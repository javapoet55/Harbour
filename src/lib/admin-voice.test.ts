import { describe,it,expect } from 'vitest';
import { formatVoiceDate,voiceSummary,type VoiceRecord } from './admin-voice';
const row=(id:string,minutes:number|null,type='Realtime'):VoiceRecord=>({id,user:minutes===null?'transcription@example.test':'voice@example.test',date:'2026-09-23T17:58:42Z',minutes,type,status:'Completed'});
describe('voice analytics',()=>{
 it('uses all records for type counts and excludes unavailable durations from average',()=>{
  const result=voiceSummary([...Array.from({length:12},(_,i)=>row(String(i),2)),row('missing',null,'Transcription')]);
  expect(result.minutes).toBe(24);expect(result.average).toBe(2);expect(result.types.find(t=>t.type==='Realtime')?.count).toBe(12);expect(result.users).toHaveLength(2);
  expect(result.users.find(u=>u.user==='transcription@example.test')).toMatchObject({count:1,measured:0,minutes:0});
 });
 it('does not invent duration when no records have duration',()=>{expect(voiceSummary([]).average).toBeNull();expect(voiceSummary([row('1',null)]).average).toBeNull();});
 it('includes recorded zero durations and preserves precision for totals',()=>{expect(voiceSummary([row('1',0),row('2',1/60)]).average).toBeCloseTo(1/120);});
 it('formats Pacific time independently of the server timezone with seasonal DST',()=>{
  expect(formatVoiceDate('2026-09-23T17:58:42Z')).toContain('10:58:42 AM PDT');
  expect(formatVoiceDate('2026-01-23T17:58:42Z')).toContain('9:58:42 AM PST');
  expect(formatVoiceDate('2026-09-23T01:00:00Z')).toContain('Sep 22, 2026');
 });
});
