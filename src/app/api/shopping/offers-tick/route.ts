import { prisma } from '@/server/db';
import {timingSafeEqual} from 'node:crypto';
import {collectOffers} from '@/server/shopping/offers/service';
export async function POST(req:Request){
 const expected=process.env.HARBOR_CRON_SECRET;const supplied=req.headers.get('authorization')??'';
 if(!expected||Buffer.byteLength(supplied)!==Buffer.byteLength(`Bearer ${expected}`)||!timingSafeEqual(Buffer.from(supplied),Buffer.from(`Bearer ${expected}`)))return Response.json({error:'Unauthorized'},{status:401});
 await prisma.foodDataCache.deleteMany({where:{key:{startsWith:'store-brand:v1:'},expiresAt:{lte:new Date()},leaseUntil:{lte:new Date()}}});
 return Response.json(await collectOffers(),{headers:{'Cache-Control':'no-store'}});
}
