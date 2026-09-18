import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/server/db',()=>({prisma:{importantMoment:{findFirst:vi.fn(),updateMany:vi.fn()}}}));
import { momentInput, fallback } from './domain';
import { prisma } from '@/server/db';
import { generateGreetingArtwork, saveGreetingCard } from './greeting-card';
const input={momentID:'festival',festival:'Happy Diwali',style:'Traditional',aspect:'Portrait',prompt:'Glowing diyas',aiConsent:true};
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();vi.clearAllMocks()});
describe('greeting artwork',()=>{
 it('rejects unowned festivals before contacting provider',async()=>{
  vi.mocked(prisma.importantMoment.findFirst).mockResolvedValue(null);const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
  await expect(generateGreetingArtwork('other',input)).rejects.toMatchObject({status:404});expect(fetch).not.toHaveBeenCalled();
 });
 it('requires explicit generation consent',async()=>{await expect(generateGreetingArtwork('user',{...input,aiConsent:false})).rejects.toThrow()});
 it('returns generated art without sending signature, greeting or contacts',async()=>{
  vi.mocked(prisma.importantMoment.findFirst).mockResolvedValue({id:'festival',type:'festival'} as never);vi.stubEnv('OPENAI_API_KEY','test-only');
  const data=Buffer.from([255,216,255,217]).toString('base64');const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({data:[{b64_json:data}]})));vi.stubGlobal('fetch',fetch);
  expect(await generateGreetingArtwork('success',{...input,signature:'Private signature',greeting:'Private message',contacts:['private@example.com']})).toEqual({data,mime:'image/jpeg'});
  const body=JSON.parse(fetch.mock.calls[0][1].body);expect(body.size).toBe('1024x1536');expect(body.n).toBe(1);expect(body.prompt).toContain('Happy Diwali');expect(body.prompt).not.toContain('Private');expect(body.prompt).not.toContain('private@example.com');
 });
 it('does not substitute mock art on provider failure',async()=>{
  vi.mocked(prisma.importantMoment.findFirst).mockResolvedValue({id:'festival',type:'festival'} as never);vi.stubEnv('OPENAI_API_KEY','test-only');vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{}',{status:403})));
  await expect(generateGreetingArtwork('failure',input)).rejects.toMatchObject({status:503});
 });
 it('rejects malformed artwork',async()=>{
  vi.mocked(prisma.importantMoment.findFirst).mockResolvedValue({id:'festival',type:'festival'} as never);vi.stubEnv('OPENAI_API_KEY','test-only');vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({data:[{b64_json:'not-image'}]}))));
  await expect(generateGreetingArtwork('invalid',input)).rejects.toMatchObject({status:502});
 });
});

describe('greeting cards for every supported occasion',()=>{
 it.each(['birthday','anniversary','getWellSoon'])('generates artwork for %s',async(type)=>{
  vi.mocked(prisma.importantMoment.findFirst).mockResolvedValue({id:'occasion',type} as never);
  vi.stubEnv('OPENAI_API_KEY','test-only');
  const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({data:[{b64_json:Buffer.from([255,216,255,217]).toString('base64')}]})));vi.stubGlobal('fetch',fetch);
  await generateGreetingArtwork(type,{...input,momentID:'occasion',festival:type});
  expect(JSON.parse(fetch.mock.calls[0][1].body).prompt).toContain(type);
  expect(prisma.importantMoment.findFirst).toHaveBeenCalledWith(expect.objectContaining({where:{id:'occasion',userId:type,type:{in:['birthday','anniversary','festival','getWellSoon']}}}));
 });
 it('saves a card without changing approved wishes or schedules',async()=>{
  vi.mocked(prisma.importantMoment.findFirst).mockResolvedValue({id:'birthday',festivalSettings:JSON.stringify({groupID:'existing',baseMessage:'Approved wish',approvedAt:'approved'})} as never);
  vi.mocked(prisma.importantMoment.updateMany).mockResolvedValue({count:1});
  await saveGreetingCard('owner',{momentID:'birthday',settings:{groupID:'new',cardGreeting:'Happy Birthday!',cardSignature:'Love, Sri',imageID:'art.png',baseMessage:'Must not overwrite'}});
  const args=vi.mocked(prisma.importantMoment.updateMany).mock.calls[0][0];
  const saved=JSON.parse(args.data.festivalSettings as string);
  expect(saved).toMatchObject({groupID:'existing',baseMessage:'Approved wish',approvedAt:'approved',cardSignature:'Love, Sri',cardGreeting:'Happy Birthday!'});
  expect(Object.keys(args.data)).toEqual(['festivalSettings']);
  expect(args.where).toMatchObject({id:'birthday',userId:'owner'});
 });
 it('rejects saving a card for another user',async()=>{
  vi.mocked(prisma.importantMoment.findFirst).mockResolvedValue(null);
  await expect(saveGreetingCard('other',{momentID:'birthday',settings:{groupID:'group'}})).rejects.toMatchObject({status:404});
  expect(prisma.importantMoment.updateMany).not.toHaveBeenCalled();
 });
 it('does not overwrite concurrent changes',async()=>{
  vi.mocked(prisma.importantMoment.findFirst).mockResolvedValue({id:'birthday',festivalSettings:'{}'} as never);
  vi.mocked(prisma.importantMoment.updateMany).mockResolvedValue({count:0});
  await expect(saveGreetingCard('owner',{momentID:'birthday',settings:{groupID:'group'}})).rejects.toMatchObject({status:409});
 });
});

it('accepts a one-time Get Well Soon moment and provides supportive drafts',()=>{
 expect(momentInput.parse({type:'getWellSoon',title:'Get Well Soon',occurrenceDate:'2026-09-20',timeZoneID:'America/Los_Angeles',sourceKey:'test'}).yearly).toBe(false);
 for(const tone of ['Warm','Personal','Short','Fun']) {
  const body=fallback('Sam','getWellSoon',tone);
  expect(body).toContain('Get well soon, Sam');expect(body).not.toContain('celebrating');
 }
});
