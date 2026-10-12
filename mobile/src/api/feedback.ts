import { getApi, type ApiClient } from './index';
import type { BugReportInput, BugReportReceipt } from '../features/bugReport/model';

/**
 * `POST /api/feedback` (src/app/api/feedback/route.ts:7-19), as `AppModel.submitFeedback`
 * (ios/App/NexdoApp.swift:854-858). An upsert on `id`: resending the same id is harmless, so the form
 * keeps one id for as long as it is open. 400 "Enter a title, description, and a rating from 1 to 5
 * stars."; 409 when the id belongs to another account. Stored only; no email is sent.
 */
export type FeedbackInput = { id: string; title: string; description: string; stars: number };

export const feedbackApi = {
  submit: (input: FeedbackInput, client: ApiClient = getApi()) => client.post<{ ok: true }>('/api/feedback', input),
};

/**
 * `POST /api/feedback/bugs` (src/app/api/feedback/bugs/route.ts), as `AppModel.submitBugReport`
 * (ios/App/NexdoApp.swift:886-888), with Swift's default 60s timeout.
 *
 * Answers `{ reference: "BR-123456" }` once the report is durably stored; the email to support goes
 * out later from an outbox (`POST /api/feedback/bug-tick`, cron-only), so success does not mean it was
 * delivered. Idempotent on `id`: resending the frozen request answers the SAME reference. Failures:
 * 413 "Screenshot is too large." (body over 2,850,000 bytes); 400 "Enter a description of 1–2,000
 * characters and review screenshot consent." (schema) or "Invalid report or screenshot." (not JSON,
 * not a PNG/JPEG, over 2,000,000 decoded bytes or 4M pixels); 409 "Report ID is already in use." (the
 * id is another account's); 429 "Too many attempts. Please try again later." (30 requests an hour, or
 * 5 new reports a day); 500 "Request failed." when no free reference is found in 20 tries.
 * `bugFailureMessage` turns these into what the form shows.
 */
export const bugReportApi = {
  submit: (input: BugReportInput, client: ApiClient = getApi()) => client.post<BugReportReceipt>('/api/feedback/bugs', input),
};
