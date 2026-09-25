import { z } from 'zod';
import { healthAccess, canOperate } from '@/server/health/access';
import { getHealth, incidentAction, updateRule } from '@/server/health/service';
import { windows } from '@/server/health/metrics';
const headers = { 'Cache-Control':'private, no-store' };
export async function GET(request:Request) {
  try {
    const user=await healthAccess(); const range=new URL(request.url).searchParams.get('range')??'24H';
    if(!(range in windows)) return Response.json({error:'Invalid time range'},{status:400,headers});
    return Response.json({...await getHealth(range as keyof typeof windows),canOperate:canOperate(user.id)},{headers});
  } catch(e) {return failure(e);}
}
const input=z.discriminatedUnion('type',[
 z.object({type:z.literal('incident'),id:z.string().max(100),action:z.enum(['ACKNOWLEDGED','INVESTIGATING','RESOLVED'])}),
 z.object({type:z.literal('rule'),id:z.string().max(100),threshold:z.number().finite().min(0).max(1000000),minimumSamples:z.number().int().min(1).max(100000),enabled:z.boolean()}),
]);
export async function POST(request:Request) {
  try {
    const user=await healthAccess(true);
    // Only the admin frontend's server calls this, with a bearer and the client secret; there is no browser cookie to forge.
    const parsed=input.safeParse(await request.json().catch(()=>null));
    if(!parsed.success) return Response.json({error:'Invalid action'},{status:400,headers});
    const body=parsed.data;
    if(body.type==='incident') await incidentAction(user.id,body.id,body.action);
    else await updateRule(user.id,body.id,body.threshold,body.minimumSamples,body.enabled);
    return Response.json({ok:true},{headers});
  } catch(e) { return failure(e); }
}
function failure(e:unknown) {
 const reason=e instanceof Error?e.message:'';
 const status=reason==='UNAUTHENTICATED'?401:reason==='FORBIDDEN'?403:reason==='CONFLICT'?409:503;
 return Response.json({error:status===401?'Admin sign-in required':status===403?'Operator permission required':status===409?'Incident changed. Refresh and retry.':'Health data is temporarily unavailable'},{status,headers});
}
