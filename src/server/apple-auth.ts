import bcrypt from 'bcryptjs';
import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT } from 'jose';
import { createHash, randomBytes } from 'node:crypto';
import { prisma } from './db';
import { decryptCredential, encryptCredential } from '@/lib/credentials';

const APPLE_ISSUER = 'https://appleid.apple.com';
const appleKeys = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error('APPLE_AUTH_CONFIGURATION_REQUIRED');
  return value;
}

async function clientSecret(clientId: string) {
  const teamId = required('APPLE_TEAM_ID');
  const keyId = required('APPLE_KEY_ID');
  const privateKey = required('APPLE_PRIVATE_KEY').replace(/\\n/g, '\n');
  const key = await importPKCS8(privateKey, 'ES256');
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: keyId })
    .setIssuer(teamId)
    .setSubject(clientId)
    .setAudience(APPLE_ISSUER)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(key);
}

async function exchangeCode(code: string, clientId: string) {
  const response = await fetch('https://appleid.apple.com/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: await clientSecret(clientId), code, grant_type: 'authorization_code' }),
  });
  const payload = await response.json() as { id_token?: string; refresh_token?: string; error?: string };
  if (!response.ok || !payload.id_token) throw new Error('INVALID_APPLE_CREDENTIAL');
  return { identityToken: payload.id_token, refreshToken: payload.refresh_token };
}

export async function authenticateApple(input: { authorizationCode: string; rawNonce: string; givenName?: string; familyName?: string }) {
  if (!input.authorizationCode || !input.rawNonce) throw new Error('INVALID_APPLE_CREDENTIAL');
  const clientId = process.env.APPLE_CLIENT_ID?.trim() || 'com.pinslots.nexdo';
  const exchange = await exchangeCode(input.authorizationCode, clientId);
  const expectedNonce = createHash('sha256').update(input.rawNonce).digest('hex');
  const { payload } = await jwtVerify(exchange.identityToken, appleKeys, {
    issuer: APPLE_ISSUER,
    audience: clientId,
    algorithms: ['RS256'],
    clockTolerance: 5,
  });
  if (typeof payload.sub !== 'string' || payload.nonce !== expectedNonce) throw new Error('INVALID_APPLE_CREDENTIAL');
  const subject = payload.sub;

  const identity = await prisma.authIdentity.findUnique({ where: { provider_subject: { provider: 'apple', subject } }, include: { user: true } });
  if (identity?.user && !identity.user.deletedAt) {
    if (exchange.refreshToken) await prisma.authIdentity.update({ where: { id: identity.id }, data: { refreshToken: encryptCredential(exchange.refreshToken) } });
    return identity.user;
  }

  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
  const verified = payload.email_verified === true || payload.email_verified === 'true';
  if (!email || !verified) throw new Error('APPLE_EMAIL_REQUIRED');
  const name = [input.givenName, input.familyName].map((part) => part?.trim()).filter(Boolean).join(' ').slice(0, 100) || email.split('@')[0] || 'Nexdo User';
  const existing = await prisma.user.findFirst({ where: { email, deletedAt: null } });
  if (existing) {
    await prisma.authIdentity.create({ data: { userId: existing.id, provider: 'apple', subject, refreshToken: encryptCredential(exchange.refreshToken) } });
    // Apple verified this address, so the matching account counts as verified.
    if (existing.emailVerifiedAt) return existing;
    return prisma.user.update({ where: { id: existing.id }, data: { emailVerifiedAt: new Date() } });
  }
  const passwordHash = await bcrypt.hash(randomBytes(32).toString('hex'), 12);
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { email, name, passwordHash, emailVerifiedAt: new Date(), preference: { create: {} } } });
    await tx.authIdentity.create({ data: { userId: user.id, provider: 'apple', subject, refreshToken: encryptCredential(exchange.refreshToken) } });
    return user;
  });
}

export async function revokeAppleIdentity(encryptedRefreshToken: string) {
  const clientId = process.env.APPLE_CLIENT_ID?.trim() || 'com.pinslots.nexdo';
  const token = decryptCredential(encryptedRefreshToken);
  if (!token) return;
  const response = await fetch('https://appleid.apple.com/auth/revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: await clientSecret(clientId), token, token_type_hint: 'refresh_token' }),
  });
  if (!response.ok) throw new Error('APPLE_REVOCATION_FAILED');
}
