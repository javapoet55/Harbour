import { it,expect } from 'vitest';
import { overviewDetails } from './overview-analytics';
import { emptySnapshot } from '../../../test/fixtures';
it('keeps date-filtered detail rows and current totals separate',()=>{
 const data=emptySnapshot();
 data.rangeStart='2026-09-01T00:00:00.000Z';data.rangeEnd='2026-09-15T23:59:59.999Z';
 const user={id:'one',name:'Test',email:'one@example.test',plan:'PRO' as const,city:null,country:null,timeZone:'UTC',createdAt:'2026-09-10T01:00:00.000Z',lastActiveAt:'2026-09-10T01:00:00.000Z',aiActions:0,voiceMinutes:0,verified:true,activeInPeriod:true,estimatedMonthlyRevenue:9.99};
 data.users=[user,{...user,id:'two',email:'two@example.test',createdAt:'2026-08-01T00:00:00.000Z',activeInPeriod:false}];
 expect(overviewDetails(data,'users').rows).toHaveLength(2);
 expect(overviewDetails(data,'signups').rows).toHaveLength(1);
 expect(overviewDetails(data,'active').rows).toHaveLength(1);
 expect(overviewDetails(data,'mrr').rows[0][2]).toBe('$9.99');
 expect(overviewDetails(data,'signups').rows[0][2]).toContain('Sep 9, 2026');
});
it('uses all available voice and action records for drilldowns',()=>{
 const data=emptySnapshot();
 data.voiceRecords=Array.from({length:30},(_,i)=>({id:String(i),user:'test@example.test',date:'2026-09-10T01:00:00.000Z',minutes:i===0?null:1,type:'Voice',status:'processed'}));
 data.actionRecords=[{id:'a',user:'test@example.test',date:'2026-09-10T01:00:00.000Z',intent:'add_task',executed:false}];
 expect(overviewDetails(data,'recentVoice').rows).toHaveLength(30);
 expect(overviewDetails(data,'voice').rows).toHaveLength(29);
 expect(overviewDetails(data,'actions').rows[0][3]).toBe('No');
});
