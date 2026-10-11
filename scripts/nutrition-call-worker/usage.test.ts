import { expect, it } from 'vitest';
import { usageReceipt } from './usage.mjs';
it('retains a complete numeric breakdown and rejects invalid totals',()=>{
 const usage={input_tokens:12,output_tokens:4,total_tokens:16,input_token_details:{text_tokens:2,audio_tokens:10,cached_tokens:0},output_token_details:{text_tokens:1,audio_tokens:3}};
 expect(usageReceipt('resp_1',usage,'gpt-realtime-2.1')).toMatchObject({model:'gpt-realtime-2.1',breakdown:{audioInput:10,cachedText:0,cachedAudio:0}});
 expect(usageReceipt('resp_1',{...usage,total_tokens:100},'gpt-realtime-2.1')).toBeNull();
 expect(usageReceipt('resp_1',{input_tokens:1,output_tokens:2,total_tokens:3},'unknown')).not.toHaveProperty('breakdown');
});
