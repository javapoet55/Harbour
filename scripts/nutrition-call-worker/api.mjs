// Worker → Nexdo API calls. The worker holds no business logic or database access.
export function createApiClient({ baseUrl, workerSecret, fetchImpl = fetch, timeoutMs = 8000 }) {
  async function post(path, body) {
    const response = await fetchImpl(new URL(path, baseUrl), {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
      headers: { Authorization: `Bearer ${workerSecret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) { await response.body?.cancel(); throw new Error(`api_${response.status}`); }
    return response.json();
  }
  return {
    session: (callToken, twilioCallSid) => post('/api/internal/nutrition-calls/session', { callToken, twilioCallSid }),
    tool: async (callToken, name, args) => (await post('/api/internal/nutrition-calls/tool', { callToken, name, arguments: args })).result,
    complete: (callToken, report) => post('/api/internal/nutrition-calls/complete', { callToken, ...report }),
  };
}
