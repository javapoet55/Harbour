import { healthRoute } from '@/server/health/telemetry';
import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { runJobs } from '@/server/moments/service';
async function healthHandlerPOST(req:Request) {
 const expected=process.env.HARBOR_CRON_SECRET;const supplied=req.headers.get('authorization')??'';
 if(!expected||Buffer.byteLength(supplied)!==Buffer.byteLength(`Bearer ${expected}`)||!timingSafeEqual(Buffer.from(supplied),Buffer.from(`Bearer ${expected}`))) return NextResponse.json({error:'Unauthorized'},{status:401});
 if(process.env.MOMENTS_SCHEDULER_ENABLED!=='true') return NextResponse.json({error:'Scheduler disabled'},{status:503});
 return NextResponse.json(await runJobs());
}

export const POST = healthRoute('POST /api/moments/tick', healthHandlerPOST);
