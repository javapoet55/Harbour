// Display helpers from the backend's src/lib/voice-costs.ts. Cost estimation itself stays on the backend.
// USD per million tokens, standard tier. Verified 2026-09-23.
// https://developers.openai.com/api/docs/pricing
export const VOICE_PRICING_DATE = '2026-09-23';
export function usd(value:number|null){return value===null?'Unavailable':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:4,maximumFractionDigits:6}).format(value);}
