import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { prisma } from '@/server/db';
const session = vi.hoisted(() => ({ id: '' }));
vi.mock('@/server/session', () => ({ readUserId: async () => session.id || null }));
import { PATCH } from './route';
import { GET } from '../me/route';

const patch = (body: unknown) => PATCH(new Request('https://nexdo.test/api/settings', { method: 'PATCH', body: JSON.stringify(body) }));
describe('profile settings persistence', () => {
  let owner = ''; let other = '';
  beforeAll(async () => {
    const create = (name: string) => prisma.user.create({ data: { name, email: `${name}-${Date.now()}@profile.test`, passwordHash: '', preference: { create: {} } } });
    owner = (await create('Owner')).id; other = (await create('Other')).id; session.id = owner;
  });
  afterAll(async () => { await prisma.user.deleteMany({ where: { id: { in: [owner, other] } } }); });
  it('persists account-scoped profile, photo and preferences without replacing other preferences', async () => {
    const photo = 'data:image/jpeg;base64,' + Buffer.from([255, 216, 255, 224, 0, 2, 255, 217]).toString('base64');
    expect((await patch({ name: 'Updated Name', timeZone: 'America/New_York', photo, preference: { voiceEnabled: false }, nextAction: { enabled: true, switchingThreshold: 25 } })).status).toBe(200);
    const { user } = await (await GET()).json();
    expect(user).toMatchObject({ name: 'Updated Name', photo, timeZone: 'America/New_York', preference: { voiceEnabled: false, emailEnabled: true }, nextAction: { enabled: true, switchingThreshold: 25 } });
    expect(await prisma.user.findUnique({ where: { id: other } })).toMatchObject({ name: 'Other', photo: null });
    expect((await patch({ photo: null })).status).toBe(200);
    expect((await (await GET()).json()).user.photo).toBeNull();
  });
  it('rejects invalid values atomically', async () => {
    expect((await patch({ name: 'Must not save', photo: 'data:image/svg+xml;base64,AAAA' })).status).toBe(400);
    expect((await patch({ photo: 'data:image/jpeg;base64,AAAA' })).status).toBe(400);
    expect((await patch({ photo: 'data:image/jpeg;base64,' + 'A'.repeat(350000) })).status).toBe(400);
    expect((await patch({ timeZone: 'Invalid/Zone' })).status).toBe(400);
    expect((await patch({ preference: { workStart: '18:00', workEnd: '09:00' } })).status).toBe(400);
    expect((await prisma.user.findUnique({ where: { id: owner } }))?.name).toBe('Updated Name');
  });
  it('normalizes friendly phone input before persistence', async () => {
    expect((await patch({ preference: { phoneNumber: '(510) 555-1212' } })).status).toBe(200);
    const { user } = await (await GET()).json();
    expect(user.preference.phoneNumber).toBe('+15105551212');
    expect((await patch({ preference: { phoneNumber: null } })).status).toBe(200);
  });
  it('acknowledges the saved photo and removal without requiring a second read', async () => {
    const photo = 'data:image/jpeg;base64,' + Buffer.from([255, 216, 255, 224, 0, 2, 255, 217]).toString('base64');
    const saved = await patch({ photo });
    expect(saved.headers.get('Cache-Control')).toContain('no-store');
    expect(await saved.json()).toEqual({ ok: true, profile: { id: owner, photo } });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: owner } })).photo).toBe(photo);
    const removed = await patch({ photo: null });
    expect(await removed.json()).toEqual({ ok: true, profile: { id: owner, photo: null } });
    expect((await GET()).headers.get('Cache-Control')).toContain('no-store');
  });
  it('requires a signed-in session', async () => { session.id = ''; expect((await patch({ name: 'Denied' })).status).toBe(401); });
});
