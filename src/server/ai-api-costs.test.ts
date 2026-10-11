import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { prisma } from './db';
import { observedFetch, healthContext } from './health/telemetry';
import { apiCostReport, estimateApiCost, numericUsage, apiCostOperation } from './ai-api-costs';
const feature = `cost-test-${crypto.randomUUID()}`;
beforeEach(() => { vi.stubEnv('NEXDO_HEALTH_ENABLED', 'false'); vi.stubEnv('NEXDO_AI_PRICES_JSON', '{}'); });
afterEach(async () => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); await prisma.aiApiReceipt.deleteMany({ where: { feature } }); });
it('prices cached general AI input once', () => {
  expect(estimateApiCost('gpt-5.4-mini', 'General AI', {inputTokens:1000,cachedTokens:400,outputTokens:100})?.costUsd).toBeCloseTo(.00093);
});
it('recognizes chat and Responses usage without retaining text', () => {
  expect(numericUsage({text:'private',usage:{prompt_tokens:10,completion_tokens:2,prompt_tokens_details:{cached_tokens:4}}})).toEqual({inputTokens:10,outputTokens:2,cachedTokens:4});
});
it('supports reported audio modality and duration billing', () => {
  expect(estimateApiCost('gpt-4o-mini-transcribe','Audio transcription',{inputTokens:100,outputTokens:10,audioInput:90})?.costUsd).toBeCloseTo(.000175);
  expect(estimateApiCost('gpt-4o-mini-transcribe','Audio transcription',{durationSeconds:60})?.costUsd).toBe(.003);
});
it('does not guess unknown models, speech tokens, invalid cache totals or negative rates', () => {
  expect(estimateApiCost('unknown','General AI',{inputTokens:100,outputTokens:10})).toBeNull();
  expect(estimateApiCost('gpt-4o-mini-tts','Speech generation',{characters:100})).toBeNull();
  expect(estimateApiCost('gpt-5.4-mini','General AI',{inputTokens:100,outputTokens:10,cachedTokens:101})).toBeNull();
  expect(estimateApiCost('x','General AI',{inputTokens:100,outputTokens:10},'{"x":{"input":-1,"output":1}}')).toBeNull();
});
it('supports explicitly configured character-priced speech without using text token rates', () => {
  expect(estimateApiCost('tts-1','Speech generation',{characters:1000},'{"tts-1":{"perMillionCharacters":15}}')?.costUsd).toBe(.015);
});
it('excludes Realtime credentials, whose usage is already reported by receipts', () => {
  expect(apiCostOperation('/v1/realtime/client_secrets')).toBeUndefined();
});
it('records requests independently of health monitoring and preserves the response', async () => {
  const body = {output_text:'private answer',usage:{input_tokens:100,output_tokens:10,input_tokens_details:{cached_tokens:0}}};
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body)));
  const response = await healthContext.run({traceId:'test',feature}, () => observedFetch('https://api.openai.com/v1/responses',{body:JSON.stringify({model:'gpt-5.4-mini',input:'private prompt'})}));
  expect(await response.json()).toEqual(body);
  const rows = await prisma.aiApiReceipt.findMany({where:{feature}});
  expect(rows).toHaveLength(1); expect(rows[0].costUsd).toBeCloseTo(.00012);
  expect(JSON.stringify(rows)).not.toMatch(/private prompt|private answer/);
  const report = await apiCostReport(new Date(Date.now()-60000),new Date(Date.now()+1000));
  expect(report.find(r=>r.feature===feature)).toMatchObject({requests:1,pricedRequests:1,inputTokens:100,outputTokens:10});
});
it('counts failed and binary speech requests as unpriced and leaves audio readable', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response('audio bytes',{headers:{'content-type':'audio/mpeg'}})).mockResolvedValueOnce(new Response('',{status:429}));
  vi.stubGlobal('fetch',fetch);
  await healthContext.run({traceId:'test',feature},async()=>{
    const r=await observedFetch('https://api.openai.com/v1/audio/speech',{body:JSON.stringify({model:'gpt-4o-mini-tts',input:'private text'})});
    expect(await r.text()).toBe('audio bytes');
    await observedFetch('https://api.openai.com/v1/responses',{body:JSON.stringify({model:'gpt-5.4-mini'})});
  });
  const rows=await prisma.aiApiReceipt.findMany({where:{feature}});
  expect(rows).toHaveLength(2); expect(rows.every(r=>r.costUsd===null)).toBe(true);
});
it('prices speech completion usage exactly once and preserves the SSE for audio decoding', async () => {
  const text='data: '+JSON.stringify({type:'speech.audio.delta',audio:Buffer.from('mp3').toString('base64')})+'\n\ndata: '+JSON.stringify({type:'speech.audio.done',usage:{input_tokens:100,output_tokens:200}})+'\n\n';
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(text,{headers:{'content-type':'text/event-stream'}})));
  const response=await healthContext.run({traceId:'test',feature},()=>observedFetch('https://api.openai.com/v1/audio/speech',{body:JSON.stringify({model:'gpt-4o-mini-tts',stream_format:'sse',input:'private text'})}));
  const {speechAudio}=await import('./voice/speech-stream');
  expect(Buffer.from(await speechAudio(response)).toString()).toBe('mp3');
  const rows=await prisma.aiApiReceipt.findMany({where:{feature}});
  expect(rows).toHaveLength(1);expect(rows[0].costUsd).toBeCloseTo(.00246);
});
it('rejects incomplete speech instead of returning broken audio',async()=>{
  const {speechAudio}=await import('./voice/speech-stream');
  await expect(speechAudio(new Response('data: {"type":"speech.audio.delta","audio":"YQ=="}\n\n',{headers:{'content-type':'text/event-stream'}}))).rejects.toThrow('Incomplete');
});
it('reads the provider transcription input_token_details field',()=>{
 const usage=numericUsage({usage:{input_tokens:14,input_token_details:{audio_tokens:4,text_tokens:10},output_tokens:101}});
 expect(usage.audioInput).toBe(4);expect(estimateApiCost('gpt-4o-mini-transcribe','Audio transcription',usage)).not.toBeNull();
});
it('attributes authenticated usage and applies report date bounds',async()=>{
 const user=await prisma.user.create({data:{name:'Cost test',email:`cost-${crypto.randomUUID()}@example.test`,passwordHash:'unused'}});
 try {
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({usage:{input_tokens:100,output_tokens:10}})));
  await healthContext.run({traceId:'test',feature,userId:user.id},()=>observedFetch('https://api.openai.com/v1/responses',{body:JSON.stringify({model:'gpt-5.4-mini'})}));
  const report=await apiCostReport(new Date(Date.now()-60000),new Date(Date.now()+1000));
  expect(report.find(r=>r.feature===feature)).toMatchObject({userId:user.id,user:user.email});
  const old=await apiCostReport(new Date('2000-01-01'),new Date('2000-01-02'));
  expect(old.find(r=>r.feature===feature)).toBeUndefined();
 }finally{await prisma.aiApiReceipt.deleteMany({where:{feature}});await prisma.user.delete({where:{id:user.id}});}
});
