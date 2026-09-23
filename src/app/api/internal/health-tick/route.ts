import {drainAgentQueue} from '@/server/task-agent/service';
import { measuredJob } from '@/server/health/telemetry';
import { timingSafeEqual } from 'node:crypto';
import { evaluateAlerts } from '@/server/health/service';
export async function POST(request:Request) {
 const expected=process.env.HARBOR_CRON_SECRET;
 const supplied=request.headers.get('authorization')??'';
 if(!expected||Buffer.byteLength(supplied)!==Buffer.byteLength(`Bearer ${expected}`)||!timingSafeEqual(Buffer.from(supplied),Buffer.from(`Bearer ${expected}`))) return Response.json({error:'Unauthorized'},{status:401});
 try { const health=await measuredJob('Health alert evaluator', evaluateAlerts); await measuredJob('Task agent worker', drainAgentQueue); return Response.json(health,{headers:{'Cache-Control':'no-store'}}); }
 catch { return Response.json({error:'Alert evaluation unavailable'},{status:503}); }
}
