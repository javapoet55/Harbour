import type { VoiceTokenReceipt } from './voice-tokens';
// USD per million tokens, standard tier. Verified 2026-09-23.
// https://developers.openai.com/api/docs/pricing
export const VOICE_PRICING_DATE = '2026-09-23';
export function estimateVoiceCost(r: VoiceTokenReceipt): {text:number;audio:number}|null {
 if(r.source==='transcription'&&['gpt-live-transcribe','gpt-realtime-whisper'].includes(r.model??'')){
  return r.durationSeconds===undefined?null:{text:0,audio:r.durationSeconds/60*.017};
 }
 if(r.source!=='response'||!r.breakdown)return null;
 const rates=r.model==='gpt-realtime-2.1'?[4,.4,24,32,.4,64]:r.model==='gpt-realtime-2.1-mini'?[.6,.06,2.4,10,.3,20]:null;
 if(!rates)return null;
 const b=r.breakdown;
 if(b.textInput+b.audioInput!==r.inputTokens||b.textOutput+b.audioOutput!==r.outputTokens||b.cachedText>b.textInput||b.cachedAudio>b.audioInput)return null;
 return {text:((b.textInput-b.cachedText)*rates[0]+b.cachedText*rates[1]+b.textOutput*rates[2])/1e6,audio:((b.audioInput-b.cachedAudio)*rates[3]+b.cachedAudio*rates[4]+b.audioOutput*rates[5])/1e6};
}
export function usd(value:number|null){return value===null?'Unavailable':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:4,maximumFractionDigits:6}).format(value);}
