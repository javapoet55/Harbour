import { describe, it, expect, vi, afterEach } from 'vitest';
import { summarize,state,overall,breached } from './metrics';
import { redactStructured } from './redaction';
import { safeError, healthRoute, observedFetch } from './telemetry';
import { canOperate } from './access';
const sample=(status=200,durationMs=10)=>({status,durationMs,errorCode:null,createdAt:new Date()});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
describe('health calculations',()=>{
 it('does not report missing or stale observations as healthy',()=>{expect(state([])).toBe('Unknown');expect(state([sample()])).toBe('Unknown');expect(state(Array.from({length:10},()=>({...sample(),createdAt:new Date(0)})))).toBe('Unknown');expect(overall(['Healthy','Unknown'])).toBe('Unknown');expect(summarize([],60).p95).toBeNull();});
 it('calculates percentiles and rates from observations',()=>{const m=summarize([sample(200,10),sample(500,100),sample(429,200),{...sample(0,300),errorCode:'TIMEOUT'}],2);expect(m.p50).toBe(100);expect(m.p95).toBe(300);expect(m.success).toBe(25);expect(m.rpm).toBe(2);expect(m.timeouts).toBe(1);expect(m.errors4xx).toBe(1);});
 it('prioritizes failures over unknown components',()=>{expect(state(Array.from({length:5},()=>sample(500)))).toBe('Down');expect(overall(['Unknown','Down'])).toBe('Down');expect(state(Array.from({length:5},()=>sample()))).toBe('Healthy');});
 it('requires a configured threshold and sample minimum',()=>{const rule={enabled:true,threshold:5,minimumSamples:20};expect(breached(5,20,rule)).toBe(true);expect(breached(100,19,rule)).toBe(false);expect(breached(null,20,rule)).toBe(false);expect(breached(10,20,{...rule,enabled:false})).toBe(false);});
 it('requires explicit operator grants',()=>{vi.stubEnv('NEXDO_HEALTH_OPERATOR_IDS','abc, def');expect(canOperate('def')).toBe(true);expect(canOperate('user')).toBe(false);});
 it('redacts nested structured secrets and private content',()=>{const redacted=JSON.stringify(redactStructured({nested:{apiKey:'SECRET',email:'person@example.com',body:'private',headers:{authorization:'SECRET'}},list:[{password:'SECRET'}],reason:'Bearer SECRET'}));expect(redacted).not.toContain('SECRET');expect(redacted).not.toContain('private');expect(safeError(new Error('secret payload'))).toBe('REQUEST_FAILED');});
 it('returns route responses unchanged except safe correlation header',async()=>{const wrapped=healthRoute('GET /api/tasks/[id]',async()=>Response.json({ok:true},{status:201}));const r=await wrapped();expect(r.status).toBe(201);expect(r.headers.get('x-request-id')).toMatch(/^[a-f0-9]{32}$/);expect(await r.json()).toEqual({ok:true});});
 it('propagates handler failures without leaking error details into telemetry',async()=>{const wrapped=healthRoute('GET /api/tasks',async()=>{throw new Error('private')});await expect(wrapped()).rejects.toThrow('private');});
 it('preserves provider request behavior when disabled',async()=>{vi.stubEnv('NEXDO_HEALTH_ENABLED','false');const fetch=vi.fn().mockResolvedValue(Response.json({ok:true}));vi.stubGlobal('fetch',fetch);await observedFetch('https://api.openai.com/v1/responses',{method:'POST',body:'{}'});expect(fetch).toHaveBeenCalledOnce();});
});
