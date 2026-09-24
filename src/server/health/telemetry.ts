import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';
import { inc } from '@/lib/metrics';
import { prisma } from '@/server/db';

export const healthContext = new AsyncLocalStorage<{ traceId: string; feature: string }>();
export const newTrace = () => randomBytes(16).toString('hex');
// Strict allowlisting: never persist exception messages, bodies, URLs, headers or user identifiers.
export function safeError(error: unknown) {
  const name = error instanceof Error ? error.name : '';
  return name === 'TimeoutError' || name === 'AbortError' ? 'TIMEOUT' : 'REQUEST_FAILED';
}
export type Measurement = { kind: 'api' | 'provider' | 'scheduler' | 'job'; service: string; operation: string; status: number; durationMs: number; model?: string; errorCode?: string; inputTokens?: number; outputTokens?: number; costUsd?: number };
let pending = 0;
export async function recordEvent(event: Measurement) {
  if (process.env.NEXDO_HEALTH_ENABLED !== 'true') return;
  if (pending >= 50) { inc('health.dropped_events'); return; }
  pending++;
  inc('health.events');
  const context = healthContext.getStore();
  const write = prisma.healthEvent.create({ data: { ...event, traceId: context?.traceId ?? newTrace(), feature: context?.feature ?? 'background' } })
    .catch(() => { inc('health.write_failures'); })
    .finally(() => { pending--; });
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([write, new Promise<void>(resolve=>{timer=setTimeout(resolve,200);})]);
  if(timer)clearTimeout(timer);

}
export function featureFor(route: string) {
  if (route.includes('realtime') || route.includes('voice') || route.includes('speech') || route.includes('transcribe')) return 'Voice';
  if (route.includes('shopping')) return 'Shopping List AI';
  if (route.includes('moments')) return 'Moments';
  if (route.includes('calendar') || route.includes('schedule-intelligence')) return 'Calendar intelligence';
  if (route.includes('tasks')) return 'Task creation';
  if (route.includes('brief')) return 'Daily Brief';
  if (route.includes('assistant') || route.includes('insights')) return 'Ask AI';
  if (route.includes('auth') || route.includes('/admin/session')) return 'Authentication';
  return 'Other';
}
export function healthRoute<A extends unknown[]>(operation: string, handler: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    const traceId = newTrace(); // Do not trust arbitrary caller-supplied correlation identifiers.
    return healthContext.run({ traceId, feature: featureFor(operation) }, async () => {
      const start = performance.now();
      let status = 500;
      let errorCode: string | undefined;
      try {
        const response = await handler(...args);
        status = response.status;
        // Responses returned by fetch/redirect may have immutable headers.
        const headers = new Headers(response.headers); headers.set('X-Request-ID', traceId);
        return new Response(response.body, { status, statusText: response.statusText, headers });
      } catch (error) { errorCode = safeError(error); throw error; }
      finally { await recordEvent({ kind: 'api', service: 'API', operation, status, durationMs: performance.now() - start, errorCode }); }
    });
  };
}
const hosts: Record<string, string> = {
  'api.openai.com': 'OpenAI', 'api.mail.hostinger.com': 'Hostinger Mail', 'api.sendgrid.com': 'SendGrid', 'api.twilio.com': 'Twilio',
  'www.googleapis.com': 'Google Calendar', 'graph.microsoft.com': 'Microsoft Calendar', 'gmail.googleapis.com': 'Gmail',
  'oauth2.googleapis.com': 'Google OAuth', 'openidconnect.googleapis.com': 'Google OAuth', 'login.microsoftonline.com': 'Microsoft OAuth',
  'appleid.apple.com': 'Apple Authentication', 'analyticsdata.googleapis.com': 'Firebase Analytics',
};
export async function observedFetch(input: Parameters<typeof fetch>[0], init?: RequestInit): Promise<Response> {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  const service = hosts[url.hostname];
  if (!service || process.env.NEXDO_HEALTH_ENABLED !== 'true') return fetch(input, init);
  let model: string | undefined;
  if (service === 'OpenAI' && typeof init?.body === 'string') {
    try { const body = JSON.parse(init.body); const value = body.model ?? body.session?.model ?? body.session?.audio?.input?.transcription?.model; if (typeof value === 'string' && /^[a-z0-9][a-z0-9._-]{0,79}$/.test(value)) model = value; } catch { /* No request content retained. */ }
  }
  if(service==='OpenAI' && init?.body instanceof FormData) {const value=init.body.get('model');if(typeof value==='string'&&/^[a-z0-9][a-z0-9._-]{0,79}$/.test(value))model=value;}
  const start = performance.now();
  let status = 0; let errorCode: string | undefined;
  let usage: {inputTokens?:number;outputTokens?:number;costUsd?:number} = {};
  try { const response = await fetch(input, init); status = response.status;
    if(service === 'OpenAI' && response.ok && response.headers.get('content-type')?.includes('application/json') && !url.pathname.includes('images')) usage = await readUsage(response, model);
    return response; }
  catch (error) { errorCode = safeError(error); throw error; }
  finally { await recordEvent({ kind: 'provider', service, operation: service === 'OpenAI' && url.pathname.includes('images') ? 'Image generation' : 'request', model, status, durationMs: performance.now() - start, errorCode, ...usage }); }
}
export async function measuredJob<T>(service: string, run: () => Promise<T>): Promise<T> {
  return healthContext.run({ traceId: newTrace(), feature: 'background' }, async () => {
    const start = performance.now(); let status = 200;
    try { return await run(); } catch (e) { status = 500; throw e; }
    finally { await recordEvent({ kind: 'scheduler', service, operation: 'tick', status, durationMs: performance.now() - start }); }
  });
}

// Read a bounded clone only to extract numeric usage. No body is persisted or logged.
async function readUsage(response:Response, model:string|undefined) {
 const reader=response.clone().body?.getReader(); if(!reader)return {};
 const timer=setTimeout(()=>{void reader.cancel().catch(()=>{});},1000);
 try {
  let text='';let bytes=0;const decoder=new TextDecoder();
  for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>262144)return {};text+=decoder.decode(part.value,{stream:true});}
  const raw=JSON.parse(text).usage;
  const input=raw?.input_tokens??raw?.prompt_tokens;const output=raw?.output_tokens??raw?.completion_tokens;
  if(!Number.isInteger(input)||input<0||!Number.isInteger(output)||output<0)return {};
  let costUsd:number|undefined;
  try {const rate=JSON.parse(process.env.NEXDO_AI_PRICES_JSON??'{}')[model??''];if(rate&&Number.isFinite(rate.input)&&rate.input>=0&&Number.isFinite(rate.output)&&rate.output>=0)costUsd=(input*rate.input+output*rate.output)/1000000;} catch {/* Unconfigured prices remain unknown. */}
  return {inputTokens:input,outputTokens:output,costUsd:costUsd!==undefined&&Number.isFinite(costUsd)?costUsd:undefined};
 } catch {return {};} finally {clearTimeout(timer);void reader.cancel().catch(()=>{});}
}
