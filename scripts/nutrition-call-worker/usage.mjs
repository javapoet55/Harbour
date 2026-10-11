// Retain numeric provider receipts only; incomplete modality detail stays unpriced.
export function usageReceipt(id, usage, model, source = 'response') {
  const count = v => Number.isInteger(v) && v >= 0 && v <= 100000000;
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,150}$/.test(id) || !usage) return null;
  const inputTokens=usage.input_tokens, outputTokens=usage.output_tokens;
  if (![inputTokens,outputTokens,usage.total_tokens].every(count) || inputTokens+outputTokens!==usage.total_tokens) return null;
  const receipt={id,source,model,inputTokens,outputTokens,totalTokens:usage.total_tokens};
  const i=usage.input_token_details ?? usage.input_tokens_details, o=usage.output_token_details ?? usage.output_tokens_details;
  const c=i?.cached_tokens_details;
  const breakdown={textInput:i?.text_tokens,audioInput:i?.audio_tokens,textOutput:o?.text_tokens,audioOutput:o?.audio_tokens,cachedText:c?.text_tokens ?? (i?.cached_tokens===0?0:undefined),cachedAudio:c?.audio_tokens ?? (i?.cached_tokens===0?0:undefined)};
  if(Object.values(breakdown).every(count))receipt.breakdown=breakdown;
  return receipt;
}
