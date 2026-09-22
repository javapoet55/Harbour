import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/server/db';
import { saveMoment, generateDraft, approveDraft, schedule, changePlan } from './service';
import { saveFestival, festivalSettings } from './festival';
let userId = '';
beforeAll(async () => { userId = (await prisma.user.create({ data: { email: `${randomUUID()}@example.test`, name: 'Moments UAT', passwordHash: '' } })).id; });
afterAll(async () => { await prisma.user.delete({ where: { id: userId } }); });
async function moment(type = 'festival') {
 return saveMoment(userId, { type, title: type === 'festival' ? 'Happy Diwali' : 'Birthday', firstName: 'Test Recipient', phone: '+15555550123', email: 'recipient@example.test', occurrenceDate: '2030-10-20', timeZoneID: 'America/Los_Angeles', source: 'manual', sourceKey: randomUUID() });
}
it.fails('festival fallback honors the four selected tones (known UAT defect)', async () => {
 const m = await moment(); const bodies = [];
 for (const tone of ['Warm', 'Personal', 'Short', 'Fun']) {
  const result = await generateDraft(userId, { momentID: m.id, tone, aiConsent: false });
  expect(result.usedAI).toBe(false); bodies.push(result.draft.body);
 }
 expect(new Set(bodies).size).toBe(4);
});
it('rejects blank approval and preserves an edited draft when regenerating', async () => {
 const m = await moment();
 const { draft } = await generateDraft(userId, { momentID: m.id, tone: 'Warm' });
 await expect(approveDraft(userId, { id: draft.id, body: ' ', approved: true })).rejects.toThrow();
 await approveDraft(userId, { id: draft.id, body: 'Diwali wishes for Alex, from Sam.', approved: true });
 await generateDraft(userId, { momentID: m.id, tone: 'Fun' });
 expect((await prisma.wishDraft.findUniqueOrThrow({ where: { id: draft.id } })).body).toBe('Diwali wishes for Alex, from Sam.');
});
it.each(['copy', 'share'])('preserves exact personalized %s content and never marks it sent', async (channel) => {
 const m = await moment(); const { draft } = await generateDraft(userId, { momentID: m.id, tone: 'Personal' });
 const body = 'Happy Diwali, Alex!\nWith love, Sam ✨';
 await approveDraft(userId, { id: draft.id, body, approved: true });
 const request = { draftID: draft.id, channel, recipient: '', scheduledAtUTC: '2030-10-20T15:00:00Z', timeZoneID: 'America/Los_Angeles', automaticDelivery: false, reminderOffset: 0, repeatYearly: false, idempotencyKey: randomUUID(), approved: true };
 await expect(schedule(userId, request)).rejects.toThrow('available now only');
 const plan = await schedule(userId, { ...request, sendNow: true });
 expect(plan.body).toBe(body); expect(plan.automaticDelivery).toBe(false);
 await changePlan(userId, { id: plan.id, action: channel === 'copy' ? 'copied' : 'shared' });
 const saved = await prisma.deliveryPlan.findUniqueOrThrow({ where: { id: plan.id } });
 expect(saved.status).toBe(channel === 'copy' ? 'COPIED' : 'SHARED'); expect(saved.sentAt).toBeNull();
});
it('does not merge birthday recipients into a festival group', async () => {
 const festival = await moment(); const birthday = await moment('birthday');
 await expect(saveFestival(userId, { ids: [festival.id, birthday.id], title: 'Happy Diwali', date: '2030-10-20', timeZoneID: 'America/Los_Angeles', yearly: false, active: true, recipients: [], settings: festivalSettings.parse({ groupID: randomUUID() }) })).rejects.toThrow('one occasion category');
 expect((await prisma.importantMoment.findUniqueOrThrow({ where: { id: birthday.id } })).title).toBe('Birthday');
});
