import {it,expect} from 'vitest';
import {estimateVoiceCost} from './voice-costs';
import {groupVoiceTokens} from './voice-tokens';
const receipt={id:'r',source:'response' as const,model:'gpt-realtime-2.1',inputTokens:300,outputTokens:100,totalTokens:400,breakdown:{textInput:100,audioInput:200,textOutput:20,audioOutput:80,cachedText:50,cachedAudio:100}};
it('prices text and audio separately, subtracting cached inputs once',()=>{
 const c=estimateVoiceCost(receipt)!;expect(c.text).toBeCloseTo((50*4+50*.4+20*24)/1e6);expect(c.audio).toBeCloseTo((100*32+100*.4+80*64)/1e6);
});
it('never guesses prices for unknown models or missing/mismatched modalities',()=>{
 expect(estimateVoiceCost({...receipt,model:undefined})).toBeNull();expect(estimateVoiceCost({...receipt,breakdown:undefined})).toBeNull();expect(estimateVoiceCost({...receipt,inputTokens:301})).toBeNull();expect(estimateVoiceCost({...receipt,breakdown:{...receipt.breakdown,cachedText:101}})).toBeNull();
});
it('prices provider-reported transcription duration without double charging tokens',()=>{
 expect(estimateVoiceCost({...receipt,source:'transcription',model:'gpt-live-transcribe',durationSeconds:30})).toEqual({text:0,audio:.0085});expect(estimateVoiceCost({...receipt,source:'transcription',model:'gpt-live-transcribe'})).toBeNull();
});
it('reports partial coverage per user/date without inventing historical cost',()=>{
 const row={userId:'a',user:'a@test',date:new Date('2026-09-23T12:00:00Z')};
 const [r]=groupVoiceTokens([{...row,receipt},{...row,receipt:{...receipt,model:undefined}}]);expect(r.pricedRecords).toBe(1);expect(r.unpricedRecords).toBe(1);expect(r.textCostUsd).toBe(estimateVoiceCost(receipt)!.text);
});
