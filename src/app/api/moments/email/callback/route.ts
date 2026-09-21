import { healthRoute } from '@/server/health/telemetry';
import { NextResponse } from 'next/server';
import { connect } from '@/server/moments/email';
async function healthHandlerGET(req:Request) {
 const url=new URL(req.url);let status='error';
 try { await connect(url.searchParams.get('code')??'',url.searchParams.get('state')??'');status='connected'; } catch { /* Never expose credentials or provider payloads. */ }
 return new NextResponse(null,{status:303,headers:{Location:`nexdo://moments-email?status=${status}`,'Cache-Control':'no-store'}});
}

export const GET = healthRoute('GET /api/moments/email/callback', healthHandlerGET);
