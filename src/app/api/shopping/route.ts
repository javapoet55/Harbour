import { healthRoute } from '@/server/health/telemetry';
import {z,ZodError} from 'zod';
import {requireUser} from '@/server/auth';
import {jsonError} from '@/lib/http';
import {MomentError} from '@/server/moments/domain';
import {shoppingAction,shoppingLists} from '@/server/shopping/service';
const headers={'Cache-Control':'private, no-store'};
function failure(e:unknown){if(e instanceof ZodError || e instanceof SyntaxError)return Response.json({error:"Check the list name, date and item details."},{status:400,headers});return e instanceof MomentError?Response.json({error:e.message},{status:e.status,headers}):jsonError(e)}
async function healthHandlerGET(){try{return Response.json({lists:await shoppingLists((await requireUser()).id)},{headers})}catch(e){return failure(e)}}
async function healthHandlerPOST(req:Request){try{const user=await requireUser();const body=await req.text();if(body.length>4000000)return Response.json({error:'List is too large.'},{status:413});const parsed=JSON.parse(body);const key=z.object({idempotencyKey:z.string().uuid().optional()}).parse(parsed).idempotencyKey;return Response.json(await shoppingAction(user.id,parsed,key),{headers})}catch(e){return failure(e)}}

export const GET = healthRoute('GET /api/shopping', healthHandlerGET);

export const POST = healthRoute('POST /api/shopping', healthHandlerPOST);
