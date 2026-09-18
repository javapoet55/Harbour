import {beforeEach,describe,expect,it,vi} from 'vitest';
const tx=vi.hoisted(()=>({
 importantMoment:{findMany:vi.fn(),update:vi.fn(),upsert:vi.fn(),updateMany:vi.fn()},
 deliveryPlan:{count:vi.fn(),updateMany:vi.fn()},wishDraft:{deleteMany:vi.fn()}
}));
vi.mock('@/server/db',()=>({prisma:{$transaction:(work:(client:typeof tx)=>unknown)=>work(tx)}}));
vi.mock('@/lib/logger',()=>({log:vi.fn()}));
import {saveFestival,deleteFestival,festivalSettings} from './festival';
beforeEach(()=>{vi.resetAllMocks();tx.deliveryPlan.count.mockResolvedValue(0);tx.importantMoment.upsert.mockResolvedValue({id:'new'});});
function fixture(type:string){
 tx.importantMoment.findMany.mockResolvedValue([{id:'m',type,source:'manual'}]);
 return {ids:['m'],title:'Warm wishes',date:'2099-09-20',timeZoneID:'UTC',yearly:false,active:true,
 recipients:[{id:'m',key:'a',name:'Sam',phone:'+15555550123',email:'',selected:true},{key:'b',name:'Alex',phone:'+15555550124',email:'',selected:true}],
 settings:festivalSettings.parse({groupID:'group',baseMessage:'Warm wishes',cardGreeting:'Thinking of you',cardSignature:'With love, Sri',approvedAt:'2026-09-17T00:00:00Z'})};
}
describe.each(['birthday','anniversary','getWellSoon','festival'])('%s shared management',type=>{
 it('saves the message, greeting, signature and recipient category',async()=>{
  const input=fixture(type);await saveFestival('owner',input);
  const data=tx.importantMoment.update.mock.calls[0][0].data;
  expect(JSON.parse(data.festivalSettings)).toMatchObject({cardSignature:'With love, Sri',cardGreeting:'Thinking of you',baseMessage:'Warm wishes'});
  expect(tx.importantMoment.upsert.mock.calls[0][0].create).toMatchObject({type,sourceKey:type+':group:b'});
  expect(tx.importantMoment.findMany.mock.calls[0][0].where.userId).toBe('owner');
  expect(tx.importantMoment.findMany.mock.calls[0][0].where.type.in).toContain(type);
 });
 it('requires explicit cancellation before modifying a scheduled wish',async()=>{
  const input=fixture(type);tx.deliveryPlan.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
  await expect(saveFestival('owner',input)).rejects.toThrow('schedules');
  expect(tx.importantMoment.update).not.toHaveBeenCalled();
 });
 it('archives the moment and preserves sent history',async()=>{
  fixture(type);await deleteFestival('owner',{ids:['m']});
  expect(tx.importantMoment.findMany.mock.calls[0][0].where.type.in).toContain(type);
  expect(tx.wishDraft.deleteMany.mock.calls[0][0].where.plans.none.status.in).toContain('SENT');
  expect(tx.importantMoment.updateMany.mock.calls[0][0].data.enabled).toBe(false);
 });
});
it('rejects mixed category groups',async()=>{
 const input=fixture('birthday');input.ids.push('other');
 tx.importantMoment.findMany.mockResolvedValue([{id:'m',type:'birthday'},{id:'other',type:'anniversary'}]);
 await expect(saveFestival('owner',input)).rejects.toThrow('one occasion category');
});
it('rejects missing or foreign moments',async()=>{
 const input=fixture('birthday');tx.importantMoment.findMany.mockResolvedValue([]);
 await expect(saveFestival('owner',input)).rejects.toThrow('not found');
});
