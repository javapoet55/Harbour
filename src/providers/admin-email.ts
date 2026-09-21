import { observedFetch } from '@/server/health/telemetry';
import { z } from 'zod';
import type { EmailProvider } from './types';

const API = 'https://api.mail.hostinger.com/api/v1';
const mailboxResponse = z.object({ data: z.object({ mailboxes: z.array(z.object({
  resourceId: z.string().regex(/^AC[A-Za-z0-9]+$/), address: z.string().email(),
})) }) });

export function adminEmailConfigured() {
  return Boolean(process.env.HOSTINGER_MAIL_API_KEY?.trim() && process.env.NEXDO_ADMIN_FROM_EMAIL?.trim());
}

// Admin codes always use Hostinger. Never fall back to the shared SendGrid sender.
export const adminEmailProvider: EmailProvider = {
  name: 'hostinger-mail',
  async send(message) {
    if (!adminEmailConfigured()) return { id: '', status: 'FAILED', reason: 'Hostinger admin email is not configured' };
    const headers = { Authorization: `Bearer ${process.env.HOSTINGER_MAIL_API_KEY!.trim()}`, 'Content-Type': 'application/json' };
    const sender = process.env.NEXDO_ADMIN_FROM_EMAIL!.trim().toLowerCase();
    try {
      // Resolve the real sender from the authenticated mailbox, rather than spoofing a From header.
      const account = await observedFetch(`${API}/me`, { headers, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10_000) });
      if (!account.ok) return { id: '', status: 'FAILED', reason: `Hostinger account lookup failed (${account.status})` };
      const parsed = mailboxResponse.safeParse(await account.json());
      const mailbox = parsed.success ? parsed.data.data.mailboxes.find((entry) => entry.address.toLowerCase() === sender) : undefined;
      if (!mailbox) return { id: '', status: 'FAILED', reason: 'The configured admin sender is not available to this Hostinger key' };
      const response = await observedFetch(`${API}/mailboxes/${encodeURIComponent(mailbox.resourceId)}/send`, {
        method: 'POST', headers, redirect: 'error', signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({ to: [message.to], subject: message.subject, text: message.text,
          ...(message.html ? { html: message.html } : {}), displayName: 'NEXDO' }),
      });
      // Hostinger documents 204 as the successful send response. Do not retry an ambiguous send.
      if (response.status !== 204) return { id: '', status: 'FAILED', reason: `Hostinger send failed (${response.status})` };
      return { id: response.headers.get('x-correlation-id') || 'hostinger-accepted', status: 'SENT' };
    } catch {
      // Never include provider payloads, API credentials, or OTP content in errors.
      return { id: '', status: 'FAILED', reason: 'Hostinger email request failed' };
    }
  },
};
