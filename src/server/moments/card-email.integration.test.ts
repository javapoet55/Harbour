import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/server/db';
import { saveMoment, generateDraft, approveDraft, schedule, runJobs, listMoments } from './service';
import { buildWishMessage, gmail, type WishExtras } from './email';
import { CARD_MAX_BYTES } from './card-image';

const mocks = vi.hoisted(() => ({ requireUser: vi.fn() }));
vi.mock('@/server/auth', () => ({ requireUser: mocks.requireUser }));
import { DELETE, GET, PUT } from '@/app/api/moments/[id]/card/route';

let userId = '';
const jpeg = (fill: number, size = 2048) => { const bytes = new Uint8Array(size).fill(fill); bytes.set([0xff, 0xd8, 0xff, 0xe0]); return bytes; };
const png = () => { const bytes = new Uint8Array(512).fill(7); bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); return bytes; };
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const put = (id: string, body: BodyInit, type = 'image/jpeg') => PUT(new Request(`https://nexdo.test/api/moments/${id}/card`, { method: 'PUT', headers: { 'Content-Type': type }, body }), ctx(id));
const get = (id: string, headers: HeadersInit = {}) => GET(new Request(`https://nexdo.test/api/moments/${id}/card`, { headers }), ctx(id));
const remove = (id: string) => DELETE(new Request(`https://nexdo.test/api/moments/${id}/card`, { method: 'DELETE' }), ctx(id));

async function birthday(type = 'birthday') {
  return saveMoment(userId, { type, title: 'Asha’s birthday', firstName: 'Asha', email: `${randomUUID()}@example.com`, phone: '+15555550123', occurrenceDate: '2000-06-01', yearly: true, timeZoneID: 'America/Los_Angeles', sourceKey: randomUUID() });
}
async function ready(momentID: string, body?: string) {
  const { draft } = await generateDraft(userId, { momentID, tone: 'Warm' });
  await approveDraft(userId, { id: draft.id, body: body ?? draft.body, approved: true });
  return draft;
}
async function emailPlan(momentID: string, body?: string, channel = 'email') {
  const draft = await ready(momentID, body);
  return schedule(userId, { draftID: draft.id, channel, recipient: channel === 'email' ? 'asha@example.com' : '+15555550123', scheduledAtUTC: new Date(Date.now() + 3_600_000).toISOString(), timeZoneID: 'America/Los_Angeles', automaticDelivery: channel === 'email', reminderOffset: 0, repeatYearly: false, idempotencyKey: randomUUID(), approved: true });
}

beforeAll(async () => {
  const user = await prisma.user.create({ data: { email: `${randomUUID()}@example.com`, name: 'Card Test', passwordHash: '' } });
  userId = user.id;
  await prisma.momentEmailAccount.create({ data: { userId, email: 'sender@example.com', refreshToken: 'test-only' } });
  process.env.MOMENTS_SCHEDULER_ENABLED = 'true';
  mocks.requireUser.mockResolvedValue({ id: userId });
});
afterEach(() => { vi.unstubAllGlobals(); mocks.requireUser.mockResolvedValue({ id: userId }); });
afterAll(async () => { await prisma.user.delete({ where: { id: userId } }); });

describe('greeting card upload and download', () => {
  it('stores the finished card and serves it back with its type and an ETag', async () => {
    const moment = await birthday();
    const card = jpeg(1);
    const response = await put(moment.id, card);
    expect(response.status).toBe(200);
    const saved = await response.json();
    expect(saved).toMatchObject({ card: { mime: 'image/jpeg', size: card.length }, plansUpdated: 0 });

    const download = await get(moment.id);
    expect(download.status).toBe(200);
    expect(download.headers.get('content-type')).toBe('image/jpeg');
    expect(download.headers.get('x-card-id')).toBe(saved.card.id);
    expect(new Uint8Array(await download.arrayBuffer())).toEqual(card);
    expect((await get(moment.id, { 'If-None-Match': download.headers.get('etag')! })).status).toBe(304);
    expect((await listMoments(userId)).moments.find((m) => m.id === moment.id)?.card).toMatchObject({ id: saved.card.id, mime: 'image/jpeg', size: card.length });
  });

  it('accepts base64 JSON and reads the type from the bytes', async () => {
    const moment = await birthday();
    const response = await put(moment.id, JSON.stringify({ data: Buffer.from(png()).toString('base64') }), 'application/json');
    expect(await response.json()).toMatchObject({ card: { mime: 'image/png', size: 512 } });
    expect((await get(moment.id)).headers.get('content-type')).toBe('image/png');
  });

  it('rejects an oversized card, a non-image, and another account’s moment without storing anything', async () => {
    const moment = await birthday();
    expect((await put(moment.id, jpeg(2, CARD_MAX_BYTES + 1))).status).toBe(413);
    expect((await put(moment.id, JSON.stringify({ data: Buffer.from(jpeg(2, CARD_MAX_BYTES + 1)).toString('base64') }), 'application/json')).status).toBe(413);
    expect((await put(moment.id, new TextEncoder().encode('<svg/>'), 'image/png')).status).toBe(415);
    expect((await put(moment.id, jpeg(2, CARD_MAX_BYTES))).status).toBe(200);
    await prisma.greetingCardImage.deleteMany({ where: { momentId: moment.id } });
    mocks.requireUser.mockResolvedValue({ id: 'someone-else' });
    expect((await put(moment.id, jpeg(3))).status).toBe(404);
    expect((await get(moment.id)).status).toBe(404);
    mocks.requireUser.mockResolvedValue({ id: userId });
    expect((await get(moment.id)).status).toBe(404);
    expect(await prisma.greetingCardImage.count({ where: { momentId: moment.id } })).toBe(0);
  });
});

describe('delivery plans and the card', () => {
  it('references the saved card on an email plan and repoints it when the card is saved again', async () => {
    const moment = await birthday();
    const first = (await (await put(moment.id, jpeg(1))).json()).card.id;
    const plan = await emailPlan(moment.id);
    expect(plan.cardId).toBe(first);

    const again = await (await put(moment.id, jpeg(9))).json();
    expect(again.plansUpdated).toBe(1);
    expect((await prisma.deliveryPlan.findUniqueOrThrow({ where: { id: plan.id } })).cardId).toBe(again.card.id);
    // The replaced card is no longer referenced, so it is removed.
    expect(await prisma.greetingCardImage.findUnique({ where: { id: first } })).toBeNull();
  });

  it('keeps the card a send in progress started with', async () => {
    const moment = await birthday();
    const first = (await (await put(moment.id, jpeg(1))).json()).card.id;
    const plan = await emailPlan(moment.id);
    await prisma.deliveryPlan.update({ where: { id: plan.id }, data: { status: 'SENDING', claimedAt: new Date() } });
    await put(moment.id, jpeg(9));
    expect((await prisma.deliveryPlan.findUniqueOrThrow({ where: { id: plan.id } })).cardId).toBe(first);
    expect(await prisma.greetingCardImage.findUnique({ where: { id: first } })).not.toBeNull();
  });

  it('leaves manual channels and card-less email plans without a card', async () => {
    const withCard = await birthday();
    await put(withCard.id, jpeg(1));
    expect((await emailPlan(withCard.id, undefined, 'messages')).cardId).toBeNull();
    const without = await birthday();
    expect((await emailPlan(without.id)).cardId).toBeNull();
  });
});

describe('deleting the card', () => {
  it('removes the card and takes it off deliveries that have not started sending', async () => {
    const moment = await birthday();
    const card = (await (await put(moment.id, jpeg(1))).json()).card.id;
    const plan = await emailPlan(moment.id);
    expect(plan.cardId).toBe(card);

    const response = await remove(moment.id);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: card, plansUpdated: 1 });
    expect((await prisma.deliveryPlan.findUniqueOrThrow({ where: { id: plan.id } })).cardId).toBeNull();
    expect(await prisma.greetingCardImage.findUnique({ where: { id: card } })).toBeNull();
    expect((await get(moment.id)).status).toBe(404);
    expect((await listMoments(userId)).moments.find((m) => m.id === moment.id)?.card).toBeNull();
    expect((await remove(moment.id)).status).toBe(404);
  });

  it('keeps the image a send in progress uses, without bringing an older card back', async () => {
    const moment = await birthday();
    const first = (await (await put(moment.id, jpeg(1))).json()).card.id;
    const sending = await emailPlan(moment.id);
    await prisma.deliveryPlan.update({ where: { id: sending.id }, data: { status: 'SENDING', claimedAt: new Date() } });
    const second = (await (await put(moment.id, jpeg(2))).json()).card.id;
    await prisma.deliveryPlan.update({ where: { id: sending.id }, data: { status: 'SENT' } });

    expect(await (await remove(moment.id)).json()).toEqual({ deleted: second, plansUpdated: 0 });
    // The sent delivery keeps its card, but it is history, not the moment's card.
    expect((await prisma.deliveryPlan.findUniqueOrThrow({ where: { id: sending.id } })).cardId).toBe(first);
    expect((await get(moment.id)).status).toBe(404);
    expect((await remove(moment.id)).status).toBe(404);
    // A new email for the moment goes without a card; the retired one is not picked up.
    expect((await emailPlan(moment.id)).cardId).toBeNull();
  });

  it('returns 404 when there is no card or the moment belongs to someone else', async () => {
    const moment = await birthday();
    expect((await remove(moment.id)).status).toBe(404);
    await put(moment.id, jpeg(1));
    mocks.requireUser.mockResolvedValue({ id: 'someone-else' });
    expect((await remove(moment.id)).status).toBe(404);
    mocks.requireUser.mockResolvedValue({ id: userId });
    expect((await get(moment.id)).status).toBe(200);
  });
});

describe('sending', () => {
  it('passes the referenced card and signature to the provider, and none without a card', async () => {
    const moment = await birthday();
    await prisma.importantMoment.update({ where: { id: moment.id }, data: { festivalSettings: JSON.stringify({ cardSignature: 'Love, Sri' }) } });
    const card = jpeg(4);
    await put(moment.id, card);
    const withCard = await emailPlan(moment.id);
    const bare = await emailPlan((await birthday()).id);
    const calls: WishExtras[] = [];
    const provider = { send: async (...args: [string, string, string, string, string, WishExtras?]) => { calls.push(args[5] ?? {}); return { kind: 'sent' as const, id: `sent-${calls.length}` }; } };
    for (const plan of [withCard, bare]) {
      await prisma.deliveryPlan.update({ where: { id: plan.id }, data: { nextAttemptAt: new Date(0) } });
      await runJobs(provider, plan.id);
    }
    expect(new Uint8Array(calls[0].card!.bytes)).toEqual(card);
    expect(calls[0]).toMatchObject({ card: { mime: 'image/jpeg' }, signature: 'Love, Sri' });
    expect(calls[1].card).toBeNull();
    expect((await prisma.deliveryPlan.findUniqueOrThrow({ where: { id: withCard.id } })).status).toBe('SENT');
  });

  it('sends the multipart message through Gmail when the plan has a card', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ access_token: 'access' }))
      .mockResolvedValueOnce(Response.json({ id: 'gmail-id' }));
    vi.stubGlobal('fetch', fetch);
    vi.stubEnv('MOMENTS_GOOGLE_CLIENT_ID', 'id'); vi.stubEnv('MOMENTS_GOOGLE_CLIENT_SECRET', 'secret');
    const result = await gmail.send(userId, 'asha@example.com', 'Asha’s birthday', 'Happy birthday!', 'key-1', { card: { id: 'c1', mime: 'image/jpeg', bytes: jpeg(5) }, signature: 'Sri' });
    expect(result).toEqual({ kind: 'sent', id: 'gmail-id' });
    const raw = Buffer.from(JSON.parse(fetch.mock.calls[1][1].body).raw, 'base64url').toString();
    expect(raw).toContain('Content-Type: multipart/related;');
    expect(raw).toContain('Content-ID: <card-c1@nexdo.local>');
    vi.unstubAllEnvs();
  });
});

/** Parses the parts between a boundary's delimiters. */
function parts(message: string, boundary: string) {
  return message.split(`--${boundary}`).slice(1, -1).map((part) => {
    const [head, ...rest] = part.replace(/^\r\n/, '').split('\r\n\r\n');
    return { head, body: rest.join('\r\n\r\n').replace(/\r\n$/, '') };
  });
}
const decode = (body: string) => Buffer.from(body.replace(/\r\n/g, ''), 'base64');

describe('buildWishMessage', () => {
  const base = { recipient: 'asha@example.com', subject: 'Asha’s birthday', body: 'Happy birthday, Asha!\n\nHave a <wonderful> day.', key: 'plan-key' };

  it('builds multipart/related with text and HTML alternatives and the card inline', () => {
    const card = jpeg(6, 4000);
    const raw = buildWishMessage({ ...base, signature: 'Love, Sri', card: { id: 'card1', mime: 'image/jpeg', bytes: card } });
    const [headers] = raw.split('\r\n\r\n');
    expect(headers).toContain('To: asha@example.com');
    expect(headers).toContain(`Subject: =?UTF-8?B?${Buffer.from('Asha’s birthday').toString('base64')}?=`);
    expect(headers).toContain('Message-ID: <plan-key@nexdo.local>');
    const related = /multipart\/related; boundary="([^"]+)"; type="multipart\/alternative"/.exec(headers)![1];

    const [alternativePart, imagePart] = parts(raw, related);
    const alternative = /multipart\/alternative; boundary="([^"]+)"/.exec(alternativePart.head)![1];
    const [text, html] = parts(alternativePart.body, alternative);
    expect(text.head).toContain('Content-Type: text/plain; charset=UTF-8');
    expect(decode(text.body).toString()).toBe('Happy birthday, Asha!\n\nHave a <wonderful> day.\n\nLove, Sri');
    expect(html.head).toContain('Content-Type: text/html; charset=UTF-8');
    const htmlText = decode(html.body).toString();
    // The friend-to-friend layout: card first, then the wish, the signature and one footer line.
    const order = ['src="cid:card-card1@nexdo.local"', 'Happy birthday, Asha!', 'Have a &lt;wonderful&gt; day.', 'Love, Sri', 'Sent with Nexdo'].map((part) => htmlText.indexOf(part));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(htmlText).not.toContain('nexdo-logo-email');
    expect(htmlText).not.toContain('Questions?');

    expect(imagePart.head).toContain('Content-Type: image/jpeg; name="greeting-card.jpg"');
    expect(imagePart.head).toContain('Content-ID: <card-card1@nexdo.local>');
    expect(imagePart.head).toContain('Content-Disposition: inline; filename="greeting-card.jpg"');
    expect(new Uint8Array(decode(imagePart.body))).toEqual(card);
    expect(imagePart.body.split('\r\n').every((line) => line.length <= 76)).toBe(true);
  });

  it('keeps the plain-text message exactly as before when there is no card', () => {
    expect(buildWishMessage({ ...base, card: null, signature: 'Love, Sri' })).toBe(['To: asha@example.com', `Subject: =?UTF-8?B?${Buffer.from(base.subject).toString('base64')}?=`, 'Message-ID: <plan-key@nexdo.local>', 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', Buffer.from(base.body).toString('base64')].join('\r\n'));
  });
});
