import {z,ZodError} from 'zod';
import {requireUser} from '@/server/auth';
import {jsonError} from '@/lib/http';
import {MomentError} from '@/server/moments/domain';
import {listOffers,chooseOffer} from '@/server/shopping/offers/service';
const headers={'Cache-Control':'private, no-store'};
function failure(e:unknown){if(e instanceof ZodError||e instanceof SyntaxError)return Response.json({error:'Check the offer and list details.'},{status:400,headers});return e instanceof MomentError?Response.json({error:e.message},{status:e.status,headers}):jsonError(e);}
export async function GET(req:Request){try{const user=await requireUser();const id=z.string().min(1).max(200).parse(new URL(req.url).searchParams.get('listId'));return Response.json(await listOffers(user.id,id),{headers});}catch(e){return failure(e);}}
export async function POST(req:Request){try{const user=await requireUser();const p=z.object({listId:z.string().min(1),itemId:z.string().min(1),offerId:z.string().nullable(),revision:z.number().int().nonnegative()}).parse(await req.json());return Response.json(await chooseOffer(user.id,p.listId,p.itemId,p.offerId,p.revision),{headers});}catch(e){return failure(e);}}
