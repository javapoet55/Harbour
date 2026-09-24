import { z } from 'zod';
import {estimateVoiceCost} from './voice-costs';
const count = z.number().int().min(0).max(100_000_000);
export const voiceTokenReceipt = z.object({
  id: z.string().min(1).max(200).regex(/^[a-zA-Z0-9_-]+$/),
  source: z.enum(['response', 'transcription']),
  model: z.string().min(1).max(100).optional(),
  durationSeconds:z.number().min(0).max(86400).optional(),
  breakdown:z.object({textInput:count,audioInput:count,textOutput:count,audioOutput:count,cachedText:count,cachedAudio:count}).optional(),
  inputTokens: count, outputTokens: count, totalTokens: count,
}).refine(v => v.totalTokens === v.inputTokens + v.outputTokens, 'Token totals must match input plus output').refine(v=>v.durationSeconds===undefined||(v.source==='transcription'&&v.totalTokens===0),'Duration receipts cannot also claim tokens');
export type VoiceTokenReceipt = z.infer<typeof voiceTokenReceipt>;
export type VoiceTokenRow = { userId: string; user: string; date: string; inputTokens: number; outputTokens: number; totalTokens: number; records: number; tokenRecords:number; textCostUsd:number; audioCostUsd:number; pricedRecords:number; unpricedRecords:number };
export function groupVoiceTokens(receipts: {userId:string;user:string;date:Date;receipt:VoiceTokenReceipt}[]): VoiceTokenRow[] {
  const groups = new Map<string, VoiceTokenRow>();
  for (const r of receipts) {
    const date = new Intl.DateTimeFormat('en-CA', {timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(r.date);
    const key = `${r.userId}:${date}`;
    const row = groups.get(key) ?? {userId:r.userId,user:r.user,date,inputTokens:0,outputTokens:0,totalTokens:0,records:0,tokenRecords:0,textCostUsd:0,audioCostUsd:0,pricedRecords:0,unpricedRecords:0};
    row.inputTokens += r.receipt.inputTokens; row.outputTokens += r.receipt.outputTokens; row.totalTokens += r.receipt.totalTokens; row.records++;
    if(r.receipt.durationSeconds===undefined)row.tokenRecords++;
    const cost=estimateVoiceCost(r.receipt);if(cost){row.textCostUsd+=cost.text;row.audioCostUsd+=cost.audio;row.pricedRecords++;}else row.unpricedRecords++;
    groups.set(key,row);
  }
  return [...groups.values()].sort((a,b)=>b.date.localeCompare(a.date)||a.user.localeCompare(b.user));
}
