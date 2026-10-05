import { getApi, type ApiClient } from './index';

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
