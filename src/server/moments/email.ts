import { prisma } from '@/server/db';
import { encryptCredential, decryptCredential } from '@/lib/credentials';
import { SignJWT, jwtVerify } from 'jose';
import { sessionSigningKey } from '@/server/session-key';
import { MomentError } from './domain';
export function emailConfigured() { return !!(process.env.MOMENTS_GOOGLE_CLIENT_ID && process.env.MOMENTS_GOOGLE_CLIENT_SECRET && process.env.MOMENTS_GOOGLE_REDIRECT_URI); }
export async function connectURL(userID: string) {
  if (!emailConfigured()) throw new MomentError('Connected email is not configured on this server.',503);
  const state = await new SignJWT({sub:userID,purpose:'moments-email'}).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('10m').sign(sessionSigningKey());
  return 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({client_id:process.env.MOMENTS_GOOGLE_CLIENT_ID!,redirect_uri:process.env.MOMENTS_GOOGLE_REDIRECT_URI!,response_type:'code',scope:'openid email https://www.googleapis.com/auth/gmail.send',access_type:'offline',prompt:'consent',state});
}
async function token(params: Record<string,string>) {
  const res=await fetch('https://oauth2.googleapis.com/token',{method:'POST',signal:AbortSignal.timeout(15000),body:new URLSearchParams({client_id:process.env.MOMENTS_GOOGLE_CLIENT_ID!,client_secret:process.env.MOMENTS_GOOGLE_CLIENT_SECRET!,...params})});
  if (!res.ok) throw new MomentError('Reconnect your email account.',409);
  return await res.json() as {access_token:string; refresh_token?:string};
}
export async function connect(code:string,state:string) {
  const {payload}=await jwtVerify(state,sessionSigningKey(),{algorithms:['HS256']});
  if(payload.purpose!=='moments-email'||typeof payload.sub!=='string') throw new MomentError('Invalid authorization.');
  const t=await token({code,grant_type:'authorization_code',redirect_uri:process.env.MOMENTS_GOOGLE_REDIRECT_URI!});
  if(!t.refresh_token) throw new MomentError('Please reconnect and approve offline email access.');
  const res=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:`Bearer ${t.access_token}`},signal:AbortSignal.timeout(15000)});
  const profile=await res.json() as {email?:string;email_verified?:boolean};
  if(!res.ok||!profile.email||!profile.email_verified) throw new MomentError('Unable to verify email account.');
  await prisma.momentEmailAccount.upsert({where:{userId:payload.sub},create:{userId:payload.sub,email:profile.email,refreshToken:encryptCredential(t.refresh_token)!},update:{email:profile.email,refreshToken:encryptCredential(t.refresh_token)!,status:'connected'}});
}
export type EmailResult = {kind:'sent'; id:string}|{kind:'retry'|'permanent'|'uncertain'|'reconnect'; error:string};
export interface WishEmailProvider { send(userId:string, recipient:string, subject:string, body:string, key:string):Promise<EmailResult> }
export const gmail: WishEmailProvider = {
 async send(userId,recipient,subject,body,key) {
  const account=await prisma.momentEmailAccount.findUnique({where:{userId}});
  if(!account||account.status!=='connected') return {kind:'reconnect',error:'Reconnect your email account.'};
  let access:string;
  try { access=(await token({grant_type:'refresh_token',refresh_token:decryptCredential(account.refreshToken)!})).access_token; }
  catch { await prisma.momentEmailAccount.update({where:{userId},data:{status:'reconnect'}}); return {kind:'reconnect',error:'Reconnect your email account.'}; }
  // Never retry an ambiguous submission: Gmail send has no idempotency-key guarantee.
  try {
    const raw=[`To: ${recipient}`,`Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,`Message-ID: <${key}@nexdo.local>`,'MIME-Version: 1.0','Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',Buffer.from(body).toString('base64')].join('\r\n');
    const res=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{method:'POST',signal:AbortSignal.timeout(20000),headers:{Authorization:`Bearer ${access}`,'Content-Type':'application/json'},body:JSON.stringify({raw:Buffer.from(raw).toString('base64url')})});
    if(res.status===429) return {kind:'retry',error:'Email provider rate limit. Will retry.'};
    if(res.status===401||res.status===403) return {kind:'reconnect',error:'Reconnect and approve email sending.'};
    if(res.status>=500) return {kind:'uncertain',error:'Delivery could not be verified. Check Sent mail before sending again.'};
    if(!res.ok) return {kind:'permanent',error:'Email provider rejected the message.'};
    const result=await res.json() as {id?:string};
    return result.id ? {kind:'sent',id:result.id} : {kind:'uncertain',error:'Check Sent mail; delivery could not be verified.'};
  } catch { return {kind:'uncertain',error:'Connection interrupted. Check Sent mail; Nexdo will not automatically retry.'}; }
 }
};
export async function revokeEmail(userId:string) {
 const account=await prisma.momentEmailAccount.findUnique({where:{userId}});
 if(!account) return;
 const response=await fetch('https://oauth2.googleapis.com/revoke',{method:'POST',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:decryptCredential(account.refreshToken)!})});
 if(!response.ok&&response.status!==400) throw new MomentError('Email access could not be revoked. Try disconnecting again.',502);
}
