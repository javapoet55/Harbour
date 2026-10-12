import { healthRoute } from '@/server/health/telemetry';
import { NextResponse } from 'next/server';
import { connect } from '@/server/moments/email';
async function healthHandlerGET(req:Request) {
 const url=new URL(req.url);let location='nexdo://moments-email?status=error';
 // The app confirms the encrypted ticket while signed in (operation connectEmailConfirm); only then is the account saved.
 try {
   const code=url.searchParams.get('code'), state=url.searchParams.get('state');
   if (!url.searchParams.has('error') && code && state) location=`nexdo://moments-email?status=confirm&ticket=${encodeURIComponent(await connect(code,state))}`;
 } catch { /* Never expose credentials or provider payloads. */ }
 return new NextResponse(null,{status:303,headers:{Location:location,'Cache-Control':'no-store'}});
}

export const GET = healthRoute('GET /api/moments/email/callback', healthHandlerGET);
