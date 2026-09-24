import {describe,it,expect} from 'vitest';
import {voiceTokenReceipt,groupVoiceTokens} from './voice-tokens';
const receipt={id:'resp_1',source:'response' as const,inputTokens:132,outputTokens:121,totalTokens:253};
describe('voice tokens',()=>{
 it('validates actual counts and rejects absent, inconsistent and negative usage',()=>{
  expect(voiceTokenReceipt.parse(receipt)).toEqual(receipt);
  for(const bad of [{},{...receipt,totalTokens:999},{...receipt,inputTokens:-1},{...receipt,outputTokens:1.5}]) expect(voiceTokenReceipt.safeParse(bad).success).toBe(false);
 });
 it('groups by user and Pacific date across UTC midnight without merging users',()=>{
  const rows=groupVoiceTokens([
   {userId:'a',user:'a@test',date:new Date('2026-09-23T01:00:00Z'),receipt},
   {userId:'a',user:'a@test',date:new Date('2026-09-22T20:00:00Z'),receipt},
   {userId:'b',user:'b@test',date:new Date('2026-09-23T01:00:00Z'),receipt},
  ]);
  expect(rows).toHaveLength(2);expect(rows[0]).toMatchObject({date:'2026-09-22',totalTokens:506,records:2});
  expect(rows[1].totalTokens).toBe(253);expect(groupVoiceTokens([])).toEqual([]);
 });
});
