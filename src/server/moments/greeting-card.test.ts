import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/server/db',()=>({prisma:{importantMoment:{findFirst:vi.fn()}}}));
import { prisma } from '@/server/db';
import { generateGreetingArtwork } from './greeting-card';
const input={momentID:'festival',festival:'Happy Diwali',style:'Traditional',aspect:'Portrait',prompt:'Glowing diyas',aiConsent:true};
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();vi.clearAllMocks()});
describe('greeting artwork',()=>{
 it('rejects unowned festivals before contacting provider',async()=>{
  vi.mocked(prisma.importantMoment.findFirst).mockResolvedValue(null);const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
  await expect(generateGreetingArtwork('other',input)).rejects.toMatchObject({status:404});expect(fetch).not.toHaveBeenCalled();
 });
 it('requires explicit generation consent',async()=>{await expect(generateGreetingArtwork('user',{...input,aiConsent:false})).rejects.toThrow()});
 it('returns generated art without sending signature, greeting or contacts',async()=>{
  vi.mocked(prisma.importantMoment.findFirst).mockResolvedValue({id:'festival'} as never);vi.stubEnv('OPENAI_API_KEY','test-only');
  const data=Buffer.from([255,216,255,217]).toString('base64');const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({data:[{b64_json:data}]})));vi.stubGlobal('fetch',fetch);
  expect(await generateGreetingArtwork('success',{...input,signature:'Private signature',greeting:'Private message',contacts:['private@example.com']})).toEqual({data,mime:'image/jpeg'});
  const body=JSON.parse(fetch.mock.calls[0][1].body);expect(body.size).toBe('1024x1536');expect(body.n).toBe(1);expect(body.prompt).toContain('Happy Diwali');expect(body.prompt).not.toContain('Private');expect(body.prompt).not.toContain('private@example.com');
 });
 it('does not substitute mock art on provider failure',async()=>{
  vi.mocked(prisma.importantMoment.findFirst).mockResolvedValue({id:'festival'} as never);vi.stubEnv('OPENAI_API_KEY','test-only');vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{}',{status:403})));
  await expect(generateGreetingArtwork('failure',input)).rejects.toMatchObject({status:503});
 });
 it('rejects malformed artwork',async()=>{
  vi.mocked(prisma.importantMoment.findFirst).mockResolvedValue({id:'festival'} as never);vi.stubEnv('OPENAI_API_KEY','test-only');vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({data:[{b64_json:'not-image'}]}))));
  await expect(generateGreetingArtwork('invalid',input)).rejects.toMatchObject({status:502});
 });
});
