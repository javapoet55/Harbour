import type { Prisma } from '@/generated/prisma';
import { prisma } from '@/server/db';
import { securityRef, securityEvent } from './abuse';

export function promotionMailbox(email: string) {
  const [local, domain] = email.split('@');
  // Provider-documented Gmail aliases only; never strip arbitrary corporate local parts.
  if (domain === 'gmail.com' || domain === 'googlemail.com') return `${local.toLowerCase().split('+')[0].replaceAll('.', '')}@gmail.com`;
  return email;
}
/** Eligibility only: this code does not invent a paid plan, bonus, or trial. Future grants must use this claim. */
export async function recordPromotionEligibility(userId: string, transaction?: Prisma.TransactionClient) {
  const record = async (tx: Prisma.TransactionClient) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.emailVerifiedAt || user.deletedAt) throw new Error('UNAUTHENTICATED');
    const key = securityRef(`intro:${promotionMailbox(user.email)}`);
    const claim = await tx.signupPromotionClaim.upsert({ where: { key }, create: { key, userId }, update: {} });
    const eligible = claim.userId === userId;
    await tx.userMemory.upsert({ where: { userId_key: { userId, key: 'signup:promotion-eligibility' } }, create: { userId, key: 'signup:promotion-eligibility', value: eligible ? 'eligible' : 'already_claimed', kind: 'security', source: 'email-verification' }, update: {} });
    securityEvent('signup_promotion_eligibility_recorded');
    return { accountEligibility: true, promotionEligibility: eligible };
  };
  return transaction ? record(transaction) : prisma.$transaction(record);
}
