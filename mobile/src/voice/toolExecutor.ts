import type { QueryClient } from '@tanstack/react-query';

import { getApi, type NexdoTask } from '../api';
import { resolveContacts, type ActionContact } from '../actions/contacts';
import { queryKeys } from '../query/keys';
import { replaceTask } from '../query/useTasks';
import type { VoiceToolExecuting } from './conversation';
import type { VoiceScope } from './protocol';
import { TOOL_PATH } from './protocol';

/**
 * `VoiceToolExecutor` (ios/App/VoiceToolExecutor.swift:4-32) and `AppModel.executeVoiceTool`
 * (ios/App/NexdoApp.swift:481-493).
 *
 * Every tool the model calls lands here. Three of them never leave the device — two contact lookups
 * and (in the session itself) `set_conversation_context` and `end_session`; everything else is one
 * POST to `/api/realtime/tool`, whose result the app reconciles into its task cache.
 *
 * THE OWNER CHECK IS THE POINT: each call re-verifies that the same account is still signed in and
 * that both consents still hold, so a session left open across a sign-out cannot write to the new
 * account.
 */

const CALENDAR_ONLY_TOOLS = ['get_current_time', 'create_calendar_event', 'get_schedule', 'find_free_time'];

/** `VoiceToolExecutor.execute` (`:17-19`) when the screen is calendar-only. */
const CALENDAR_ONLY_REFUSAL = { success: false, error: 'This screen creates appointments and events only.' };

/** The two contact tools' shared message (`:26`, `:29`). */
const CONTACT_SELECTED_MESSAGE =
  "Contact selected. No call was placed and no email sent. Use the task's action button to review and approve.";
const CONTACT_CANDIDATES_MESSAGE =
  'Ask the user to select a candidate. Phone numbers and email addresses remain on device. No action executed.';

export type ToolExecutorOptions = {
  queryClient: QueryClient;
  /** The account this session belongs to; every call re-checks it. */
  ownerId: string;
  /** Re-read on every call, so withdrawing consent mid-session stops the next tool. */
  consent: () => { ai: boolean; voice: boolean };
  /** The signed-in account id right now. */
  currentOwnerId: () => string | undefined;
  scope: VoiceScope;
  uuid: () => string;
  /** Injected so the contact lookup can be faked in tests. */
  resolve?: typeof resolveContacts;
};

export class VoiceToolExecutor implements VoiceToolExecuting {
  private readonly options: ToolExecutorOptions;
  /** `candidates` (`:8`): the tokens handed to the model, so no number ever reaches OpenAI. */
  private candidates = new Map<string, ActionContact>();

  constructor(options: ToolExecutorOptions) {
    this.options = options;
  }

  /** `clear()` (`:11`). */
  clear(): void {
    this.candidates.clear();
  }

  async execute({
    name,
    args,
    sessionId,
    callId,
  }: {
    name: string;
    args: Record<string, unknown>;
    sessionId: string;
    callId: string;
  }): Promise<unknown> {
    this.assertOwner();

    if (this.options.scope === 'calendar' && !CALENDAR_ONLY_TOOLS.includes(name)) {
      return CALENDAR_ONLY_REFUSAL;
    }

    if (name === 'prepare_call' || name === 'prepare_email') return this.prepareContact(name, args);

    // `AppModel.executeVoiceTool` (NexdoApp.swift:481-493).
    const response = await getApi().request<Record<string, unknown>>(TOOL_PATH, {
      method: 'POST',
      body: { consent: true, scope: this.options.scope, sessionId, callId, name, arguments: args },
      timeoutMs: 30_000,
    });

    // "Only reconcile this account. A dismissed voice screen does not discard a saved task."
    if (this.options.currentOwnerId() === this.options.ownerId && response.success === true) {
      const task = response.task as NexdoTask | undefined;
      if (task && typeof task.id === 'string') {
        if (name === 'delete_task') this.removeTask(task.id);
        else replaceTask(this.options.queryClient, task);
      }
      if (name === 'create_calendar_event') {
        void this.options.queryClient.invalidateQueries({ queryKey: queryKeys.agenda.all() });
        void this.options.queryClient.invalidateQueries({ queryKey: queryKeys.calendar.all() });
      }
    }
    return response;
  }

  /** `prepare_call` / `prepare_email` (VoiceToolExecutor.swift:20-30). */
  private async prepareContact(name: string, args: Record<string, unknown>): Promise<unknown> {
    const query = args.contactName;
    if (typeof query !== 'string' || query.length === 0 || query.length > 200) {
      throw new Error('The voice tool arguments were invalid.');
    }

    // A second call naming an earlier candidate resolves it without searching again.
    const token = args.candidateId;
    if (typeof token === 'string') {
      const selected = this.candidates.get(token);
      if (selected) {
        return { success: true, prepared: true, contactName: selected.name, requiresUserApproval: true, message: CONTACT_SELECTED_MESSAGE };
      }
    }

    const resolve = this.options.resolve ?? resolveContacts;
    const found = await resolve({ name: query });
    this.assertOwner();
    this.candidates.clear();

    const relevant = found.filter((contact) => (name === 'prepare_call' ? contact.phones.length > 0 : contact.emails.length > 0));
    // Only a NAME and an opaque token leave the device; numbers and addresses stay here.
    const minimal = relevant.slice(0, 5).map((contact) => {
      const candidateId = this.options.uuid();
      this.candidates.set(candidateId, contact);
      return { candidateId, name: contact.name };
    });

    return { success: true, candidates: minimal, moreMatches: relevant.length > 5, requiresUserApproval: true, message: CONTACT_CANDIDATES_MESSAGE };
  }

  /** `guard let model, ownerID != nil, model.profile?.id == ownerID, aiConsent, voiceConsent` (`:13`). */
  private assertOwner(): void {
    const consent = this.options.consent();
    if (this.options.currentOwnerId() !== this.options.ownerId || !consent.ai || !consent.voice) {
      throw new Error('Your session has expired. Please sign in again.');
    }
  }

  private removeTask(id: string): void {
    this.options.queryClient.setQueryData<{ tasks: NexdoTask[]; timeZone: string }>(queryKeys.tasks.all(), (previous) =>
      previous ? { ...previous, tasks: previous.tasks.filter((task) => task.id !== id) } : previous,
    );
  }
}
