import { timingSafeEqual } from 'node:crypto';
import { nutritionCallConfig } from './config';
import { verifyCallToken } from './twilio';

const bearerMatches = (request: Request, secret: string) => {
  if (!secret) return false;
  const supplied = Buffer.from(request.headers.get('authorization') ?? ''), expected = Buffer.from(`Bearer ${secret}`);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
};
export const cronAuthorized = (request: Request) => bearerMatches(request, process.env.HARBOR_CRON_SECRET?.trim() ?? '');

/** Worker requests carry the shared worker secret and the call's signed token. Returns the call id or null. */
export function workerCall(request: Request, body: { callToken?: unknown }): string | null {
  const { workerSecret } = nutritionCallConfig();
  if (!bearerMatches(request, workerSecret)) return null;
  return verifyCallToken(workerSecret, body.callToken);
}
