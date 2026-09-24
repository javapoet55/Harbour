import { emailProvider } from './index';
import type { EmailProvider } from './types';

// Admin sign-in codes go through the same SendGrid setup as verify-email and reset-password.
// NEXDO_ADMIN_FROM_EMAIL, when set, replaces only the sender address (EMAIL_FROM_NAME still applies).
export function adminEmailSender() {
  return (process.env.NEXDO_ADMIN_FROM_EMAIL || process.env.EMAIL_FROM_ADDRESS || process.env.SENDGRID_FROM_EMAIL || '').trim() || null;
}

/** Real delivery only: the shared provider's development mock must never stand in for an admin code. */
export function adminEmailConfigured() {
  return Boolean(process.env.SENDGRID_API_KEY?.trim() && adminEmailSender());
}

export const adminEmailProvider: EmailProvider = {
  name: 'sendgrid',
  async send(message) {
    const from = adminEmailSender();
    if (!adminEmailConfigured() || !from) return { id: '', status: 'FAILED', reason: 'Admin email is not configured' };
    return emailProvider.send({ ...message, from });
  },
};
