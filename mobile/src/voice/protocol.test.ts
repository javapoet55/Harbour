import {
  OPENAI_CALLS_URL,
  VoiceError,
  assertUsableSession,
  clientEvents,
  exchangeSdp,
  functionCallsFrom,
  localToolResult,
  parseServerEvent,
  parseToolArguments,
  taskIdFromResult,
  toolRequest,
  uuidV4,
} from './protocol';

function fakeFetch(status: number, body: string) {
  return jest.fn(async (_url: string, _init?: RequestInit) => ({ status, text: async () => body })) as unknown as jest.Mock & typeof fetch;
}

describe('assertUsableSession', () => {
  it('accepts a well-formed, unexpired session', () => {
    const session = { value: 'ek_1', expiresAt: 1_060, model: 'gpt-realtime-2.1' };
    expect(assertUsableSession(session, 1_000_000)).toBe(session);
  });

  it.each([null, {}, { value: '', expiresAt: 2e9, model: 'm' }, { value: 'ek', expiresAt: '2e9', model: 'm' }, { value: 'ek', expiresAt: 2e9 }])(
    'rejects malformed %p',
    (value) => {
      expect(() => assertUsableSession(value, 0)).toThrow(VoiceError);
    },
  );

  it('rejects an expired secret', () => {
    expect(() => assertUsableSession({ value: 'ek', expiresAt: 1_000, model: 'm' }, 1_000_000)).toThrow('expired');
  });
});

describe('exchangeSdp', () => {
  it('posts the offer to OpenAI with the ephemeral secret and no cookies', async () => {
    const fetch = fakeFetch(201, 'v=0\r\no=answer');
    await expect(exchangeSdp('v=0\r\no=offer', 'ek_secret', fetch)).resolves.toBe('v=0\r\no=answer');
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(OPENAI_CALLS_URL);
    expect(init).toMatchObject({
      method: 'POST',
      body: 'v=0\r\no=offer',
      credentials: 'omit',
      headers: { Authorization: 'Bearer ek_secret', 'Content-Type': 'application/sdp' },
    });
  });

  it('reports a non-2xx status with the start of the body', async () => {
    await expect(exchangeSdp('v=0', 'ek', fakeFetch(401, '{"error":"expired"}'))).rejects.toThrow('OpenAI rejected the SDP offer (401): {"error":"expired"}');
  });

  it('rejects a success body that is not SDP', async () => {
    await expect(exchangeSdp('v=0', 'ek', fakeFetch(200, '<html>'))).rejects.toThrow('did not return an SDP answer');
  });
});

describe('data channel messages', () => {
  it('parses JSON events with a type', () => {
    expect(parseServerEvent('{"type":"session.created","session":{}}')).toEqual({ type: 'session.created', session: {} });
  });

  it.each([undefined, 42, 'not json', '[]', '{"no":"type"}', '{"type":3}'])('ignores %p', (data) => {
    expect(parseServerEvent(data)).toBeNull();
  });

  it('extracts function calls from a completed response.done, in order', () => {
    const event = parseServerEvent(
      JSON.stringify({
        type: 'response.done',
        response: {
          id: 'resp_1',
          status: 'completed',
          output: [
            { type: 'message', content: [{ type: 'output_audio' }] },
            { type: 'function_call', call_id: 'call_a', name: 'create_task', arguments: '{"title":"Test"}' },
            { type: 'function_call', call_id: 'call_b', name: 'find_tasks', arguments: '{"query":"te"}' },
            { type: 'function_call', call_id: 'call_c', name: 'broken' },
          ],
        },
      }),
    )!;
    expect(functionCallsFrom(event)).toEqual([
      { callId: 'call_a', name: 'create_task', arguments: '{"title":"Test"}' },
      { callId: 'call_b', name: 'find_tasks', arguments: '{"query":"te"}' },
    ]);
  });

  it.each(['cancelled', 'failed', 'incomplete'])('runs no tools from a %s response', (status) => {
    const event = { type: 'response.done', response: { id: 'r', status, output: [{ type: 'function_call', call_id: 'c', name: 'create_task', arguments: '{}' }] } };
    expect(functionCallsFrom(event)).toEqual([]);
  });

  it('only reads calls from response.done', () => {
    expect(functionCallsFrom({ type: 'response.created', response: { status: 'completed', output: [] } })).toEqual([]);
  });
});

describe('tool calls', () => {
  it('parses argument JSON into an object', () => {
    expect(parseToolArguments('{"title":"Test","durationMin":30}')).toEqual({ title: 'Test', durationMin: 30 });
  });

  it.each(['nope', '[]', 'null', '"text"'])('rejects arguments %p', (raw) => {
    expect(() => parseToolArguments(raw)).toThrow(VoiceError);
  });

  it('resolves taskId "last" to the last task this session touched', () => {
    expect(parseToolArguments('{"taskId":"last","title":"Renamed"}', 'task_9')).toEqual({ taskId: 'task_9', title: 'Renamed' });
    expect(() => parseToolArguments('{"taskId":"last"}')).toThrow('has not touched one');
    expect(parseToolArguments('{"taskId":"task_1"}', 'task_9')).toEqual({ taskId: 'task_1' });
  });

  it('builds the /api/realtime/tool envelope the server validates', () => {
    const call = { callId: 'call_a', name: 'create_task', arguments: '{"title":"Test"}' };
    expect(toolRequest('11111111-1111-4111-8111-111111111111', call, { title: 'Test' })).toEqual({
      consent: true,
      scope: 'general',
      sessionId: '11111111-1111-4111-8111-111111111111',
      callId: 'call_a',
      name: 'create_task',
      arguments: { title: 'Test' },
    });
  });

  it('answers on-device tools locally and forwards the rest', () => {
    expect(localToolResult('set_conversation_context')).toBe('{"success":true}');
    expect(localToolResult('end_session')).toBe('{"success":true}');
    expect(JSON.parse(localToolResult('prepare_call')!)).toMatchObject({ success: false });
    expect(localToolResult('create_task')).toBeUndefined();
  });

  it('reads the task ID only from successful results', () => {
    expect(taskIdFromResult('{"success":true,"task":{"id":"task_1","title":"Test"}}')).toBe('task_1');
    expect(taskIdFromResult('{"success":false,"task":{"id":"task_1"}}')).toBeUndefined();
    expect(taskIdFromResult('{"success":true}')).toBeUndefined();
    expect(taskIdFromResult('not json')).toBeUndefined();
  });

  it('formats client events like the Swift session', () => {
    expect(clientEvents.responseCreate()).toEqual({ type: 'response.create', response: {} });
    expect(clientEvents.functionCallOutput('call_a', '{"success":true}')).toEqual({
      type: 'conversation.item.create',
      item: { type: 'function_call_output', call_id: 'call_a', output: '{"success":true}' },
    });
  });
});

describe('uuidV4', () => {
  it('produces RFC 4122 version 4 UUIDs', () => {
    const pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    for (let i = 0; i < 50; i++) expect(uuidV4()).toMatch(pattern);
    expect(uuidV4(() => 0.999)).toMatch(pattern);
    expect(uuidV4(() => 0)).toMatch(pattern);
  });
});
