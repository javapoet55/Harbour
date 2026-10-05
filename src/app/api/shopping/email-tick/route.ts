import {timingSafeEqual} from 'node:crypto';
import {runShoppingEmails} from '@/server/shopping/email-service';
export async function POST(req:Request){
 const expected=process.env.HARBOR_CRON_SECRET;const supplied=req.headers.get('authorization')??'';
 if(!expected||Buffer.byteLength(supplied)!==Buffer.byteLength(`Bearer ${expected}`)||!timingSafeEqual(Buffer.from(supplied),Buffer.from(`Bearer ${expected}`)))return Response.json({error:'Unauthorized'},{status:401});
 return Response.json(await runShoppingEmails(),{headers:{'Cache-Control':'no-store'}});
}
