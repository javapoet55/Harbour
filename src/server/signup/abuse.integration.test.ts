import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@/server/db';
import { consumeLimit, limitCodeSend, securityRef, securityEvent } from './abuse';
import { recordPromotionEligibility } from './promotion';
import { signupProof, registerAccount, sendEmailVerification, verifyEmail, requestEmailVerification } from '@/server/account-auth';
const session = vi.hoisted(() => ({ id: '' }));
vi.mock('@/server/session', () => ({ readUserId: async () => session.id || null, writeSession: vi.fn() }));
vi.mock('./email-risk', async original => ({ ...await original<typeof import('./email-risk')>(), checkEmail: async (email: string) => ({ normalizedEmail: email, decision: 'ALLOW', reasonCodes: [] }) }));
import { requireUser } from '@/server/auth';
import { POST as registerPOST } from '@/app/api/auth/register/route';
const ids: string[] = [];
const unique = () => crypto.randomUUID();
async function account(email = `${unique()}@company.com`) { const user = await registerAccount({ name: 'User', email, password: 'a-long-password-123' }); ids.push(user.id); return user; }
async function expireCooldown(email: string) { await prisma.authRateBucket.updateMany({ where: { key: securityRef(`otp-cooldown:verify:${email.toLowerCase()}`) }, data: { expiresAt: new Date(0) } }); }
beforeEach(() => { session.id = ''; vi.stubEnv('TURNSTILE_SECRET_KEY', ''); vi.stubEnv('AUTH_TRUSTED_IP_HEADER', ''); });
afterAll(async () => {
  await prisma.userMemory.deleteMany({ where: { userId: { in: ids } } });
  await prisma.userPreference.deleteMany({ where: { userId: { in: ids } } });
  await prisma.emailVerificationToken.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  vi.restoreAllMocks(); vi.unstubAllEnvs();
});
describe('durable signup abuse protection', () => {
  it('limits signup across concurrent requests', async () => {
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => consumeLimit('signup', 'ip-'+uniqueIp, 5)));
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(5);
  });
  const uniqueIp = unique();
  it('permits multiple legitimate users sharing one IP', async () => { const ip = unique(); await expect(consumeLimit('signup', ip, 5)).resolves.toBeUndefined(); await expect(consumeLimit('signup', ip, 5)).resolves.toBeUndefined(); });
  it('enforces cooldown even for unknown emails', async () => { const email = `${unique()}@company.com`; await requestEmailVerification(email); await expect(requestEmailVerification(email)).rejects.toThrow('AUTH_RATE_LIMITED'); });
  it('limits three OTP sends per window after cooldown', async () => {
    const email = `${unique()}@company.com`;
    for (let i=0;i<3;i++) { await limitCodeSend(email,'verify'); await expireCooldown(email); }
    await expect(limitCodeSend(email,'verify')).rejects.toThrow('AUTH_RATE_LIMITED');
  });
  it('blocks concurrent resends and leaves only one active token', async () => {
    const user = await account(); const results = await Promise.allSettled([sendEmailVerification(user), sendEmailVerification(user)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.emailVerificationToken.count({ where: { userId: user.id, usedAt: null } })).toBe(1);
  });
  it('denies all authenticated resources and promotional provisioning before verification', async () => {
    const user = await account(); session.id = user.id;
    await expect(requireUser()).rejects.toThrow('UNAUTHENTICATED');
    await expect(recordPromotionEligibility(user.id)).rejects.toThrow('UNAUTHENTICATED');
    expect(await prisma.signupPromotionClaim.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.userMemory.count({ where: { userId: user.id } })).toBe(0);
    const { developmentCode } = await sendEmailVerification(user);
    await verifyEmail(user.email, developmentCode!, signupProof(user));
    await expect(requireUser()).resolves.toMatchObject({ id: user.id });
    await recordPromotionEligibility(user.id); await recordPromotionEligibility(user.id);
    expect(await prisma.signupPromotionClaim.count({ where: { userId: user.id } })).toBe(1);
    expect(await prisma.userMemory.count({ where: { userId: user.id, key: 'signup:promotion-eligibility' } })).toBe(1);
  });
  it('cannot activate a pre-registered password without the signup context', async () => {
    const user = await account(); const { developmentCode } = await sendEmailVerification(user);
    await expect(verifyEmail(`${unique()}@company.com`, '123456')).rejects.toThrow('INVALID_VERIFICATION_CONTEXT');
    await expect(verifyEmail(user.email, developmentCode!)).rejects.toThrow('INVALID_VERIFICATION_CONTEXT');
    await expect(verifyEmail(user.email, developmentCode!, '0'.repeat(64))).rejects.toThrow('INVALID_VERIFICATION_CONTEXT');
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerifiedAt).toBeNull();
    await expect(verifyEmail(user.email, developmentCode!, signupProof(user))).resolves.toMatchObject({ id: user.id });
  });
  it('permits one concurrent OTP redemption, never replay', async () => {
    const user = await account(); const { developmentCode } = await sendEmailVerification(user);
    const results = await Promise.allSettled([verifyEmail(user.email, developmentCode!, signupProof(user)), verifyEmail(user.email, developmentCode!, signupProof(user))]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    await expect(verifyEmail(user.email, developmentCode!, signupProof(user))).rejects.toThrow('INVALID_VERIFICATION_CODE');
  });
  it('separates alias promotion eligibility from account eligibility', async () => {
    const local = unique().replaceAll('-',''); const first = await account(`${local}@gmail.com`); const second = await account(`${local}+tag@gmail.com`);
    for (const user of [first, second]) await prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
    expect(await recordPromotionEligibility(first.id)).toEqual({ accountEligibility: true, promotionEligibility: true });
    expect(await recordPromotionEligibility(second.id)).toEqual({ accountEligibility: true, promotionEligibility: false });
    session.id = second.id; await expect(requireUser()).resolves.toMatchObject({ id: second.id });
  });
  it('fails closed when the limit database is unavailable', async () => {
    const originalTransaction = prisma.$transaction.bind(prisma);
    const spy = vi.spyOn(prisma, '$transaction').mockRejectedValueOnce(new Error('database down'));
    await expect(consumeLimit('signup', unique(), 5)).rejects.toThrow('SIGNUP_SECURITY_UNAVAILABLE'); spy.mockRestore(); prisma.$transaction = originalTransaction;
  });
  it('does not log emails, passwords, OTPs, or bot tokens', () => {
    const spy = vi.spyOn(console,'info').mockImplementation(()=>{}); const email='private-person@company.com'; securityEvent('signup_started',email);
    const output=JSON.stringify(spy.mock.calls); expect(output).not.toContain(email); expect(output).toContain('accountRef'); spy.mockRestore();
  });
  it('duplicate signup has the same public response and creates only one account', async () => {
    const email = `${unique()}@company.com`; const body={name:'User',email,password:'a-long-password-123'};
    const post=()=>registerPOST(new Request('https://app.test/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}));
    const first=await post(); expect(first.status, JSON.stringify(await first.clone().json())).toBe(201); const user=await prisma.user.findUniqueOrThrow({where:{email}});ids.push(user.id);await expireCooldown(email);
    const second=await post();const a=await first.json();const b=await second.json();delete a.developmentCode;delete b.developmentCode; expect(a.verificationProof).toHaveLength(64);expect(b.verificationProof).toHaveLength(64);delete a.verificationProof;delete b.verificationProof;
    expect(first.status).toBe(201);expect(second.status).toBe(201);expect(a).toEqual(b);expect(a).not.toHaveProperty('id');
    expect(await prisma.user.count({where:{email}})).toBe(1);
  });
});
