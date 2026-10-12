import { prisma } from './db';
import { inc } from '@/lib/metrics';

// Standard USD rates verified 2026-10-10 against the official model pages.
// https://developers.openai.com/api/docs/models/gpt-5.4-mini
// https://developers.openai.com/api/docs/models/gpt-4o-mini
// https://developers.openai.com/api/docs/models/gpt-4o-mini-transcribe
const standardPrices: Record<string, Record<string, number>> = {
  'gpt-4o-mini-tts': { input: .6, audioOutput: 12 },
  'gpt-5.4-mini': { input: .75, cachedInput: .075, output: 4.5 },
  'gpt-4o-mini': { input: .15, cachedInput: .075, output: .6 },
  'gpt-4o-mini-transcribe': { input: 1.25, audioInput: 1.25, output: 5, perMinute: .003 },
};
const operations: Record<string, string> = {
  '/v1/responses': 'General AI', '/v1/chat/completions': 'General AI',
  '/v1/audio/speech': 'Speech generation', '/v1/audio/transcriptions': 'Audio transcription',
  '/v1/audio/translations': 'Audio translation', '/v1/images/generations': 'Image generation',
};
export function apiCostOperation(path: string) { return operations[path]; }
const number = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const integer = (v: unknown): v is number => number(v) && Number.isSafeInteger(v);
export type ApiUsage = { inputTokens?: number; outputTokens?: number; cachedTokens?: number; durationSeconds?: number; characters?: number; audioInput?: number; audioOutput?: number };
export function numericUsage(body: unknown): ApiUsage {
  const object = (v: unknown): Record<string, unknown> => v !== null && typeof v === 'object' ? v as Record<string, unknown> : {};
  const raw = object(body);
  const u = object(raw.usage);
  if (!Object.keys(u).length) return number(raw.duration) ? { durationSeconds: raw.duration } : {};
  const input = u.input_tokens ?? u.prompt_tokens, output = u.output_tokens ?? u.completion_tokens;
  const details = object(u.input_tokens_details ?? u.input_token_details ?? u.prompt_tokens_details);
  const outputDetails = object(u.output_tokens_details);
  const seconds = u.seconds ?? raw.duration;
  return {
    ...(integer(input) ? { inputTokens: input } : {}), ...(integer(output) ? { outputTokens: output } : {}),
    ...(integer(details?.cached_tokens) ? { cachedTokens: details.cached_tokens } : {}),
    ...(integer(details?.audio_tokens) ? { audioInput: details.audio_tokens } : {}),
    ...(integer(outputDetails.audio_tokens) ? { audioOutput: outputDetails.audio_tokens } : {}),
    ...(number(seconds) ? { durationSeconds: seconds } : {}),
  };
}
// Exact-model, operator-maintained USD rates. Unknown units/models are never guessed.
export function estimateApiCost(model: string | undefined, operation: string, usage: ApiUsage, prices = process.env.NEXDO_AI_PRICES_JSON): { costUsd: number; pricing: string } | null {
  try {
    const configured = JSON.parse(prices ?? '{}');
    const source = Object.hasOwn(configured, model ?? '') ? configured[model ?? ''] : standardPrices[model ?? ''];
    const rate = source && Object.fromEntries(['input', 'output', 'cachedInput', 'audioInput', 'audioOutput', 'perMinute', 'perMillionCharacters'].filter(k => number(source[k])).map(k => [k, source[k]]));
    if (!rate) return null;
    let cost: number | undefined;
    const { inputTokens: input, outputTokens: output, cachedTokens: cached = 0, audioInput = 0, audioOutput = 0 } = usage;
    if (operation === 'General AI' && integer(input) && integer(output) && cached <= input && !audioInput && !audioOutput && number(rate.input) && number(rate.output) && (!cached || number(rate.cachedInput))) {
      cost = ((input - cached) * rate.input + cached * (rate.cachedInput ?? 0) + output * rate.output) / 1e6;
    } else if (operation === 'Audio transcription' && integer(input) && integer(output) && number(rate.input) && number(rate.audioInput) && number(rate.output) && cached === 0 && audioInput <= input) {
      // Require a provider-reported modality split for mixed audio/text input.
      if (usage.audioInput !== undefined) cost = ((input - audioInput) * rate.input + audioInput * rate.audioInput + output * rate.output) / 1e6;
    }
    if (operation === 'Speech generation' && integer(input) && integer(output) && cached === 0 && number(rate.input) && number(rate.audioOutput)) cost = (input * rate.input + output * rate.audioOutput) / 1e6;
    if (cost === undefined && operation.startsWith('Audio') && number(usage.durationSeconds) && number(rate.perMinute)) cost = usage.durationSeconds / 60 * rate.perMinute;
    if (cost === undefined && operation === 'Speech generation' && integer(usage.characters) && number(rate.perMillionCharacters)) cost = usage.characters / 1e6 * rate.perMillionCharacters;
    return number(cost) ? { costUsd: cost, pricing: JSON.stringify(rate) } : null;
  } catch { return null; }
}

export async function recordApiReceipt(path: string, init: RequestInit | undefined, response: Response | undefined, feature: string, userId?: string) {
  const operation = apiCostOperation(path); if (!operation) return;
  try {
    let model: string | undefined; let characters: number | undefined; let standardTier = true;
    if (typeof init?.body === 'string') {
      const body = JSON.parse(init.body);
      standardTier = !body.service_tier || ['auto', 'default'].includes(body.service_tier);
      if (typeof body.model === 'string' && /^[a-z0-9][a-z0-9._-]{0,79}$/.test(body.model)) model = body.model;
      if (operation === 'Speech generation' && typeof body.input === 'string') characters = Array.from(body.input).length;
    } else if (init?.body instanceof FormData) {
      const value = init.body.get('model'); if (typeof value === 'string' && /^[a-z0-9][a-z0-9._-]{0,79}$/.test(value)) model = value;
    }
    let usage: ApiUsage = {};
    const isSpeechStream = operation === 'Speech generation' && response?.headers.get('content-type')?.includes('text/event-stream');
    if (response?.ok && (isSpeechStream || response.headers.get('content-type')?.includes('application/json'))) {
      const reader = response.clone().body?.getReader();
      if (reader) {
        const timeout = setTimeout(() => { void reader.cancel().catch(() => {}); }, isSpeechStream ? 45000 : 1000);
        try {
          let bytes = 0, text = ''; const decoder = new TextDecoder();
          for (;;) { const part = await reader.read(); if (part.done) break; bytes += part.value.length; if (bytes > (isSpeechStream ? 16 * 1024 * 1024 : 262144)) { text = ''; break; } text += decoder.decode(part.value, { stream: true }); }
          try {
            if (isSpeechStream) {
              for (const line of text.split(/\r?\n/)) {
                if (!line.startsWith('data:')) continue;
                try { const event = JSON.parse(line.slice(5)); if (event.type === 'speech.audio.done' || event.type === 'audio.done') usage = numericUsage(event); } catch { /* Ignore non-JSON stream sentinels. */ }
              }
            } else { const payload = JSON.parse(text); usage = numericUsage(payload); if (payload.service_tier && !['default', 'auto'].includes(payload.service_tier)) standardTier = false; }
          } catch { /* Streaming/oversized responses retain unknown usage. */ }
        } catch { usage = {}; } finally { clearTimeout(timeout); void reader.cancel().catch(() => {}); }
      }
    }
    usage.characters = characters;
    const estimate = response?.ok && standardTier ? estimateApiCost(model, operation, usage) : null;
    await prisma.aiApiReceipt.create({ data: { operation, feature, userId, model, status: response?.status ?? 0, ...usage, ...estimate } });
  } catch { inc('ai_cost.write_failures'); }
}

export async function apiCostReport(from: Date, to: Date) {
  const groups = await prisma.aiApiReceipt.groupBy({ by: ['operation', 'feature', 'model', 'userId'], where: { createdAt: { gte: from, lte: to } },
    _count: { _all: true, costUsd: true, inputTokens: true }, _sum: { costUsd: true, inputTokens: true, outputTokens: true } });
  const users = await prisma.user.findMany({ where: { id: { in: groups.flatMap(r=>r.userId?[r.userId]:[]) }, deletedAt: null }, select: { id:true, email:true } });
  const emails = new Map(users.map(u=>[u.id,u.email]));
  return groups.map(r => ({ user: r.userId ? emails.get(r.userId) ?? 'Deleted account' : 'System / anonymous', userId: r.userId, operation: r.operation, feature: r.feature, model: r.model ?? 'Unknown', requests: r._count._all, pricedRequests: r._count.costUsd,
    tokenRequests: r._count.inputTokens, costUsd: r._sum.costUsd, inputTokens: r._sum.inputTokens, outputTokens: r._sum.outputTokens }));
}
