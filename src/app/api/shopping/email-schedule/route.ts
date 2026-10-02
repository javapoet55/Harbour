import {z,ZodError} from 'zod';
import {requireUser} from '@/server/auth';
import {jsonError} from '@/lib/http';
import {MomentError} from '@/server/moments/domain';
import {emailSchedule,saveEmailSchedule,pauseEmailSchedule} from '@/server/shopping/email-service';
import {connectURL} from '@/server/moments/email';
const headers={'Cache-Control':'private, no-store'};
function failure(e:unknown){if(e instanceof ZodError||e instanceof SyntaxError)return Response.json({error:'Check the recipient, schedule, timezone, and sending permission.'},{status:400,headers});return e instanceof MomentError?Response.json({error:e.message},{status:e.status,headers}):jsonError(e)}
export async function GET(req:Request){try{const user=await requireUser();const id=z.string().min(1).parse(new URL(req.url).searchParams.get('listId'));return Response.json(await emailSchedule(user.id,id),{headers})}catch(e){return failure(e)}}
export async function POST(req:Request){try{
 const user=await requireUser();const text=await req.text();if(text.length>4000)return Response.json({error:'Request too large'},{status:413,headers});
 const body=z.object({listId:z.string().min(1),operation:z.enum(['save','pause','connect']),input:z.unknown().optional()}).parse(JSON.parse(text));
 if(body.operation==='connect'){await emailSchedule(user.id,body.listId);return Response.json({url:await connectURL(user.id)},{headers})}
 if(body.operation==='pause')await pauseEmailSchedule(user.id,body.listId);else await saveEmailSchedule(user.id,body.listId,body.input);
 return Response.json(await emailSchedule(user.id,body.listId),{headers});
}catch(e){return failure(e)}}
