// PHASE 0 PROOF OF CONCEPT. Phase 9 replaces this module.
// Wire protocol helpers for a live voice conversation, ported from ios/App/VoiceWebRTCTransport.swift and
// ios/Sources/NexdoCore/VoiceConversationSession.swift. See mobile/docs/voice-protocol.md.
// No React Native or WebRTC imports here, so everything is unit-testable.

export const TASK_SESSION_PATH = '/api/realtime/task-session';
export const TOOL_PATH = '/api/realtime/tool';
export const OPENAI_CALLS_URL = 'https://api.openai.com/v1/realtime/calls';
export const DATA_CHANNEL_LABEL = 'oai-events';
export const SDP_TIMEOUT_MS = 25_000;

/** What the Swift session sends back when a tool call throws (VoiceConversationSession.swift:339). */
export const UNCONFIRMED_TOOL_RESULT =
  '{"success":false,"error":"Operation could not be confirmed. Check current tasks before retrying. Do not claim success."}';

/** Realtime error codes the Swift session ignores (VoiceConversationSession.swift:299). */
export const BENIGN_ERROR_CODES = ['response_cancel_not_active', 'conversation_already_has_active_response'];

export type VoiceScope = 'general' | 'calendar';

export type TaskSessionRequest = { consent: true; scope: VoiceScope };
export type TaskSessionResponse = { value: string; expiresAt: number; model: string };

export type ToolRequest = {
  consent: true;
  scope: VoiceScope;
  sessionId: string;
  callId: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type ServerEvent = { type: string } & Record<string, unknown>;
export type ClientEvent = { type: string } & Record<string, unknown>;
export type FunctionCall = { callId: string; name: string; arguments: string };

export class VoiceError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, VoiceError.prototype);
    this.name = 'VoiceError';
  }
}

/** Validates the task-session response and that the 60-second client secret has not expired. */
export function assertUsableSession(value: unknown, nowMs: number): TaskSessionResponse {
  const session = value as Partial<TaskSessionResponse> | null;
  if (!session || typeof session.value !== 'string' || !session.value || typeof session.expiresAt !== 'number' || typeof session.model !== 'string') {
    throw new VoiceError('The voice session response was not { value, expiresAt, model }.');
  }
  if (session.expiresAt * 1000 <= nowMs) throw new VoiceError('The voice session expired before it could be used.');
  return session as TaskSessionResponse;
}

/** POST the SDP offer straight to OpenAI with the ephemeral secret and return the answer SDP. */
export async function exchangeSdp(offerSdp: string, secret: string, fetchImpl: typeof fetch = fetch, timeoutMs = SDP_TIMEOUT_MS): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(OPENAI_CALLS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/sdp' },
      body: offerSdp,
      // The Swift client uses an ephemeral URLSession: no Nexdo cookies go to OpenAI.
      credentials: 'omit',
      signal: controller.signal,
    });
    const text = await response.text();
    if (response.status < 200 || response.status >= 300) {
      throw new VoiceError(`OpenAI rejected the SDP offer (${response.status}): ${text.slice(0, 200)}`);
    }
    if (!text.trimStart().startsWith('v=')) throw new VoiceError('OpenAI did not return an SDP answer.');
    return text;
  } finally {
    clearTimeout(timer);
  }
}

export function parseServerEvent(data: unknown): ServerEvent | null {
  if (typeof data !== 'string') return null;
  try {
    const value: unknown = JSON.parse(data);
    if (value && typeof value === 'object' && !Array.isArray(value) && typeof (value as { type?: unknown }).type === 'string') {
      return value as ServerEvent;
    }
  } catch {
    // fall through
  }
  return null;
}

/** The response ID carried by response.created / response.done. */
export function responseIdOf(event: ServerEvent): string | undefined {
  const response = event.response as { id?: unknown } | undefined;
  return typeof response?.id === 'string' ? response.id : undefined;
}

/** Function calls in a completed response.done, in order. Cancelled or failed responses run no tools. */
export function functionCallsFrom(event: ServerEvent): FunctionCall[] {
  if (event.type !== 'response.done') return [];
  const response = event.response as { status?: unknown; output?: unknown } | undefined;
  if (response?.status !== 'completed' || !Array.isArray(response.output)) return [];
  return response.output.flatMap((item: unknown) => {
    const call = item as { type?: unknown; call_id?: unknown; name?: unknown; arguments?: unknown };
    if (call?.type !== 'function_call' || typeof call.call_id !== 'string' || typeof call.name !== 'string' || typeof call.arguments !== 'string') return [];
    return [{ callId: call.call_id, name: call.name, arguments: call.arguments }];
  });
}

/** Parse the model's JSON argument string. `taskId: "last"` becomes the last task this session touched. */
export function parseToolArguments(raw: string, lastTaskId?: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new VoiceError('Tool arguments were not valid JSON.');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new VoiceError('Tool arguments were not a JSON object.');
  const args = { ...(value as Record<string, unknown>) };
  if (args.taskId === 'last') {
    if (!lastTaskId) throw new VoiceError('The model referred to the last task, but this session has not touched one.');
    args.taskId = lastTaskId;
  }
  return args;
}

/**
 * Tools the Swift app answers on the device. The PoC keeps the conversation going and leaves ending it to Stop.
 * Returns undefined for tools that go to the server.
 */
export function localToolResult(name: string): string | undefined {
  if (name === 'set_conversation_context' || name === 'end_session') return '{"success":true}';
  if (name === 'prepare_call' || name === 'prepare_email') {
    // The Swift app resolves contacts from the on-device address book; the PoC has no contacts access.
    return '{"success":false,"error":"Contacts are not available in this preview build. Ask the user to add the task without a contact."}';
  }
  return undefined;
}

export function toolRequest(sessionId: string, call: FunctionCall, args: Record<string, unknown>, scope: VoiceScope = 'general'): ToolRequest {
  return { consent: true, scope, sessionId, callId: call.callId, name: call.name, arguments: args };
}

/** The task ID in a successful tool result, used to resolve `taskId: "last"` later. */
export function taskIdFromResult(output: string): string | undefined {
  const result = parseServerEvent(`{"type":"result","value":${output}}`)?.value as { success?: unknown; task?: { id?: unknown } } | undefined;
  return result?.success === true && typeof result.task?.id === 'string' ? result.task.id : undefined;
}

export const clientEvents = {
  responseCreate: (): ClientEvent => ({ type: 'response.create', response: {} }),
  functionCallOutput: (callId: string, output: string): ClientEvent => ({
    type: 'conversation.item.create',
    item: { type: 'function_call_output', call_id: callId, output },
  }),
};

/** RFC 4122 version 4 UUID (the tool route validates `sessionId` as a UUID). */
export function uuidV4(random: () => number = Math.random): string {
  // TODO(phase0-decision): Math.random, not a CSPRNG. The session ID only scopes tool idempotency keys on the
  // server; Phase 9 should use expo-crypto's randomUUID.
  const hex = Array.from({ length: 32 }, () => Math.floor(random() * 16));
  hex[12] = 4;
  hex[16] = (hex[16] & 0x3) | 0x8;
  const s = hex.map((n) => n.toString(16)).join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}
