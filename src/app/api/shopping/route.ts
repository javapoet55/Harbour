import {ZodError} from 'zod';
import {requireUser} from '@/server/auth';
import {jsonError} from '@/lib/http';
import {MomentError} from '@/server/moments/domain';
import {shoppingAction,shoppingLists} from '@/server/shopping/service';
const headers={'Cache-Control':'private, no-store'};
function failure(e:unknown){if(e instanceof ZodError || e instanceof SyntaxError)return Response.json({error:"Check the list name, date and item details."},{status:400,headers});return e instanceof MomentError?Response.json({error:e.message},{status:e.status,headers}):jsonError(e)}
export async function GET(){try{return Response.json({lists:await shoppingLists((await requireUser()).id)},{headers})}catch(e){return failure(e)}}
export async function POST(req:Request){try{const user=await requireUser();const body=await req.text();if(body.length>250000)return Response.json({error:'List is too large.'},{status:413});return Response.json(await shoppingAction(user.id,JSON.parse(body)),{headers})}catch(e){return failure(e)}}
