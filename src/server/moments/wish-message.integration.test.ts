import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/server/db';
import { saveMoment, generateDraft, approveDraft, schedule, runJobs } from './service';
import { saveFestival, festivalSettings } from './festival';
import { saveGreetingCard } from './greeting-card';
import { saveCardImage, deleteCardImage } from './card-image';
import { buildWishMessage, type WishExtras } from './email';
import { greetingMessage, savedWishMessage } from './wish-message';

let userId = '';
const DEFAULT = 'Asha’s birthday! Sending you warm wishes on your special day.';
const jpeg = (fill: number) => { const bytes = new Uint8Array(2048).fill(fill); bytes.set([0xff, 0xd8, 0xff, 0xe0]); return bytes; };

beforeAll(async () => {
  userId = (await prisma.user.create({ data: { email: `${randomUUID()}@example.com`, name: 'Wish Text', passwordHash: '' } })).id;
  await prisma.momentEmailAccount.create({ data: { userId, email: 'sender@example.com', refreshToken: 'test-only' } });
  process.env.MOMENTS_SCHEDULER_ENABLED = 'true';
});
afterAll(async () => { await prisma.user.delete({ where: { id: userId } }); });

/** A managed birthday with one email recipient, saved the way Manage Moment saves it. */
async function managed(baseMessage = DEFAULT, extra: Record<string, unknown> = {}) {
  const email = `${randomUUID()}@example.com`;
  const m = await saveMoment(userId, { type: 'birthday', title: 'Asha’s birthday', firstName: 'Asha', email, occurrenceDate: '2030-06-01', timeZoneID: 'America/Los_Angeles', sourceKey: randomUUID() });
  const settings = festivalSettings.parse({ groupID: randomUUID(), baseMessage, approvedAt: new Date().toISOString(), channels: { a: 'email' }, automatic: { a: true }, selected: { a: true }, cardSignature: 'Love, Sri', ...extra });
  const input = { ids: [m.id], title: m.title, date: m.occurrenceDate, timeZoneID: m.timeZoneID, yearly: false, active: true, recipients: [{ id: m.id, key: 'a', name: 'Asha', phone: '', email, selected: true }], settings };
  await saveFestival(userId, input);
  return { m, input };
}
/** Schedules the automatic email with the text the app reviews: generate, approve the resolved message, schedule. */
async function scheduleEmail(momentID: string, body: string) {
  const { draft } = await generateDraft(userId, { momentID, tone: 'Warm' });
  await approveDraft(userId, { id: draft.id, body, approved: true });
  return schedule(userId, { draftID: draft.id, channel: 'email', recipient: 'asha@example.com', scheduledAtUTC: new Date(Date.now() + 3_600_000).toISOString(), timeZoneID: 'America/Los_Angeles', automaticDelivery: true, reminderOffset: 0, repeatYearly: false, idempotencyKey: randomUUID(), approved: true });
}
/** Sends the plan now and returns the raw message the Gmail provider would submit. */
async function send(planId: string) {
  let raw = '';
  const provider = { send: async (_user: string, recipient: string, subject: string, body: string, key: string, extras?: WishExtras) => { raw = buildWishMessage({ recipient, subject, body, key, card: extras?.card, signature: extras?.signature }); return { kind: 'sent' as const, id: 'sent' }; } };
  await prisma.deliveryPlan.update({ where: { id: planId }, data: { nextAttemptAt: new Date(0) } });
  await runJobs(provider, planId);
  expect((await prisma.deliveryPlan.findUniqueOrThrow({ where: { id: planId } })).status).toBe('SENT');
  return raw;
}
const decode = (body: string) => Buffer.from(body.replace(/\r\n/g, ''), 'base64').toString();
/** The decoded text/plain and text/html parts of a card email. */
function mimeParts(raw: string) {
  const alternative = /multipart\/alternative; boundary="([^"]+)"/.exec(raw)![1];
  const [text, html] = raw.split(`--${alternative}`).slice(1, 3).map((part) => decode(part.replace(/^\r\n/, '').split('\r\n\r\n').slice(1).join('\r\n\r\n')));
  return { text, html };
}

describe('the resolved wish text', () => {
  it('prefers the recipient’s own message, then the shared message with their greeting, and needs an approval', () => {
    const settings = { baseMessage: 'Have a lovely day!', overrides: { a: 'Asha, you are the best.' }, approvedAt: '2030-01-01T00:00:00Z' };
    expect(savedWishMessage(settings, { key: 'a', type: 'birthday', firstName: 'Asha' })).toBe('Asha, you are the best.');
    expect(savedWishMessage(settings, { key: 'b', type: 'birthday', firstName: 'Ravi' })).toBe('Happy Birthday, Ravi! Have a lovely day!');
    expect(savedWishMessage({ ...settings, approvedAt: null }, { key: 'a', type: 'birthday', firstName: 'Asha' })).toBeNull();
    expect(savedWishMessage({ baseMessage: ' ', approvedAt: '2030-01-01T00:00:00Z' }, { key: 'a', type: 'birthday', firstName: 'Asha' })).toBeNull();
  });

  it('matches the app’s greeting rules', () => {
    expect(greetingMessage('Happy birthday! Enjoy.', 'birthday', 'Asha')).toBe('Happy Birthday, Asha! Enjoy.');
    expect(greetingMessage('Happy Birthday', 'birthday', 'Asha')).toBe('Happy Birthday, Asha!');
    expect(greetingMessage('Dear asha, enjoy.', 'birthday', 'Asha')).toBe('Dear asha, enjoy.');
    expect(greetingMessage('Happy Birthdays all round', 'birthday', 'Asha')).toBe('Happy Birthday, Asha! Happy Birthdays all round');
    expect(greetingMessage('Joyful Diwali!', 'festival', 'Asha')).toBe('Joyful Diwali!');
  });
});

describe('card emails carry the saved wish in both parts', () => {
  it('(a) sends the custom message, not the default, in text/plain and HTML alongside the card', async () => {
    const custom = 'Asha, have the <best> day!\nSee you soon.';
    const { m } = await managed(custom);
    await saveCardImage(userId, m.id, jpeg(1));
    const plan = await scheduleEmail(m.id, custom);
    const { text, html } = mimeParts(await send(plan.id));
    expect(text).toBe(`${custom}\n\nLove, Sri`);
    expect(html).toContain('Asha, have the &lt;best&gt; day!<br>See you soon.');
    expect(html).toContain('Love, Sri');
    for (const part of [text, html]) expect(part).not.toContain('Sending you warm wishes');
  });

  it('(b) sends the edited message when it is approved after the email was scheduled', async () => {
    const { m, input } = await managed(DEFAULT, { overrides: {} });
    await saveCardImage(userId, m.id, jpeg(2));
    const plan = await scheduleEmail(m.id, greetingMessage(DEFAULT, 'birthday', 'Asha'));

    const edited = 'Asha, thirty looks great on you.\n\nLunch is on me.';
    await saveFestival(userId, { ...input, settings: { ...input.settings, baseMessage: edited, manuallyEdited: true, approvedAt: new Date().toISOString() } });
    const pending = await prisma.deliveryPlan.findUniqueOrThrow({ where: { id: plan.id }, include: { draft: true } });
    expect(pending.status).toBe('SCHEDULED');
    expect(pending.body).toBe(edited);
    expect(pending.draft.body).toBe(edited);

    const { text, html } = mimeParts(await send(plan.id));
    expect(text).toBe(`${edited}\n\nLove, Sri`);
    expect(html).toContain('<p style="margin:0 0 16px;');
    expect(html).toContain('Asha, thirty looks great on you.</p>');
    expect(html).toContain('Lunch is on me.</p>');
    for (const part of [text, html]) expect(part).not.toContain('Sending you warm wishes');
  });

  it('(b) uses a recipient’s personalized message when one is saved', async () => {
    const { m, input } = await managed('Have a lovely day!');
    const plan = await scheduleEmail(m.id, 'Happy Birthday, Asha! Have a lovely day!');
    await saveFestival(userId, { ...input, settings: { ...input.settings, overrides: { a: 'Asha, just for you.' }, approvedAt: new Date().toISOString() } });
    expect((await prisma.deliveryPlan.findUniqueOrThrow({ where: { id: plan.id } })).body).toBe('Asha, just for you.');
  });

  it('(b) still asks to cancel for an unapproved message or a change to who or when', async () => {
    const { m, input } = await managed('Have a lovely day!');
    const plan = await scheduleEmail(m.id, 'Happy Birthday, Asha! Have a lovely day!');
    await expect(saveFestival(userId, { ...input, settings: { ...input.settings, baseMessage: 'Unapproved', approvedAt: null } })).rejects.toThrow('Existing schedules');
    await expect(saveFestival(userId, { ...input, date: '2030-06-02', settings: { ...input.settings, baseMessage: 'Moved', approvedAt: new Date().toISOString() } })).rejects.toThrow('Existing schedules');
    await expect(saveFestival(userId, { ...input, settings: { ...input.settings, channels: { a: 'share' }, approvedAt: new Date().toISOString() } })).rejects.toThrow('Existing schedules');
    expect((await prisma.deliveryPlan.findUniqueOrThrow({ where: { id: plan.id } })).body).toBe('Happy Birthday, Asha! Have a lovely day!');
    // Cancelling keeps working as before.
    await saveFestival(userId, { ...input, settings: { ...input.settings, baseMessage: 'Moved', approvedAt: new Date().toISOString() }, cancelSchedules: true });
    expect((await prisma.deliveryPlan.findUniqueOrThrow({ where: { id: plan.id } })).status).toBe('CANCELLED');
  });

  it('(b) leaves a send in progress with the text it started with', async () => {
    const { m, input } = await managed('Have a lovely day!');
    const plan = await scheduleEmail(m.id, 'Happy Birthday, Asha! Have a lovely day!');
    await prisma.deliveryPlan.update({ where: { id: plan.id }, data: { status: 'SENDING', claimedAt: new Date() } });
    await expect(saveFestival(userId, { ...input, settings: { ...input.settings, baseMessage: 'Too late', approvedAt: new Date().toISOString() } })).rejects.toThrow('in progress');
    expect((await prisma.deliveryPlan.findUniqueOrThrow({ where: { id: plan.id } })).body).toBe('Happy Birthday, Asha! Have a lovely day!');
  });

  it('(c) re-uploading, re-saving or deleting the card does not reset the message', async () => {
    const { m, input } = await managed(DEFAULT);
    await saveCardImage(userId, m.id, jpeg(3));
    const plan = await scheduleEmail(m.id, greetingMessage(DEFAULT, 'birthday', 'Asha'));
    const edited = 'Asha, cake at seven!';
    await saveFestival(userId, { ...input, settings: { ...input.settings, baseMessage: edited, approvedAt: new Date().toISOString() } });

    const again = await saveCardImage(userId, m.id, jpeg(4));
    await saveGreetingCard(userId, { momentID: m.id, settings: { ...input.settings, cardGreeting: 'Card text', imageID: 'img-2' } });
    let saved = await prisma.deliveryPlan.findUniqueOrThrow({ where: { id: plan.id }, include: { draft: true } });
    expect(saved).toMatchObject({ cardId: again.card.id, body: edited, draft: { body: edited } });
    expect(JSON.parse((await prisma.importantMoment.findUniqueOrThrow({ where: { id: m.id } })).festivalSettings).baseMessage).toBe(edited);

    await deleteCardImage(userId, m.id);
    saved = await prisma.deliveryPlan.findUniqueOrThrow({ where: { id: plan.id }, include: { draft: true } });
    expect(saved).toMatchObject({ cardId: null, body: edited, draft: { body: edited } });
    // Without the card the email is the plain-text message, still the edited wish.
    expect(decode((await send(plan.id)).split('\r\n\r\n')[1])).toBe(edited);
  });

  it('(d) sends the text-only message unchanged when there is no card', async () => {
    const custom = 'Asha, no card this year, just love.';
    const { m } = await managed(custom);
    const plan = await scheduleEmail(m.id, custom);
    const raw = await send(plan.id);
    expect(raw).not.toContain('multipart/');
    expect(raw).toBe(buildWishMessage({ recipient: 'asha@example.com', subject: 'Asha’s birthday', body: custom, key: plan.idempotencyKey, card: null }));
  });
});
