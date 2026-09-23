import { observedFetch } from '@/server/health/telemetry';
import { prisma } from '@/server/db';
import { encryptCredential, decryptCredential } from '@/lib/credentials';
import { SignJWT, jwtVerify } from 'jose';
import { sessionSigningKey } from '@/server/session-key';
import { MomentError } from './domain';
import { randomUUID } from 'node:crypto';
import { renderEmail } from '@/server/email/template';
export function emailConfigured() { return !!(process.env.MOMENTS_GOOGLE_CLIENT_ID && process.env.MOMENTS_GOOGLE_CLIENT_SECRET && process.env.MOMENTS_GOOGLE_REDIRECT_URI); }
export async function connectURL(userID: string) {
  if (!emailConfigured()) throw new MomentError('Connected email is not configured on this server.',503);
  const state = await new SignJWT({sub:userID,purpose:'moments-email'}).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('10m').sign(sessionSigningKey());
  return 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({client_id:process.env.MOMENTS_GOOGLE_CLIENT_ID!,redirect_uri:process.env.MOMENTS_GOOGLE_REDIRECT_URI!,response_type:'code',scope:'openid email https://www.googleapis.com/auth/gmail.send',access_type:'offline',prompt:'consent',state});
}
async function token(params: Record<string,string>) {
  const res=await observedFetch('https://oauth2.googleapis.com/token',{method:'POST',signal:AbortSignal.timeout(15000),body:new URLSearchParams({client_id:process.env.MOMENTS_GOOGLE_CLIENT_ID!,client_secret:process.env.MOMENTS_GOOGLE_CLIENT_SECRET!,...params})});
  if (!res.ok) throw new MomentError('Reconnect your email account.',409);
  return await res.json() as {access_token:string; refresh_token?:string};
}
export async function connect(code:string,state:string) {
  const {payload}=await jwtVerify(state,sessionSigningKey(),{algorithms:['HS256']});
  if(payload.purpose!=='moments-email'||typeof payload.sub!=='string') throw new MomentError('Invalid authorization.');
  const t=await token({code,grant_type:'authorization_code',redirect_uri:process.env.MOMENTS_GOOGLE_REDIRECT_URI!});
  if(!t.refresh_token) throw new MomentError('Please reconnect and approve offline email access.');
  const res=await observedFetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:`Bearer ${t.access_token}`},signal:AbortSignal.timeout(15000)});
  const profile=await res.json() as {email?:string;email_verified?:boolean};
  if(!res.ok||!profile.email||!profile.email_verified) throw new MomentError('Unable to verify email account.');
  await prisma.momentEmailAccount.upsert({where:{userId:payload.sub},create:{userId:payload.sub,email:profile.email,refreshToken:encryptCredential(t.refresh_token)!},update:{email:profile.email,refreshToken:encryptCredential(t.refresh_token)!,status:'connected'}});
}
export type EmailResult = {kind:'sent'; id:string}|{kind:'retry'|'permanent'|'uncertain'|'reconnect'; error:string};
export type WishCard = {id:string; mime:string; bytes:Uint8Array};
export type WishExtras = {card?:WishCard|null; signature?:string|null};
export interface WishEmailProvider { send(userId:string, recipient:string, subject:string, body:string, key:string, extras?:WishExtras):Promise<EmailResult> }

const encodedWord = (value:string) => `=?UTF-8?B?${Buffer.from(value).toString('base64')}?=`;
// RFC 2045 limits encoded lines to 76 characters.
const base64Lines = (data:Uint8Array|string) => (Buffer.from(data).toString('base64').match(/.{1,76}/g) ?? []).join('\r\n');

/**
 * The raw RFC 5322 message Gmail sends. Without a card: a single text/plain part, as before. With one:
 *   multipart/related (type multipart/alternative)
 *   ├─ multipart/alternative
 *   │  ├─ text/plain  the wish text and signature
 *   │  └─ text/html   the branded template: subject, card via cid:, wish text, signature
 *   └─ image/jpeg|png Content-ID <card-…>, inline
 */
export function buildWishMessage(input:{recipient:string; subject:string; body:string; key:string; sender?:string; card?:WishCard|null; signature?:string|null}) {
 const headers=[`To: ${input.recipient}`,`Subject: ${encodedWord(input.subject)}`,`Message-ID: <${input.key}@nexdo.local>`,'MIME-Version: 1.0'];
 if(!input.card) return [...headers,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',Buffer.from(input.body).toString('base64')].join('\r\n');
 const signature=input.signature?.trim();
 const text=signature ? `${input.body}\n\n${signature}` : input.body;
 const cid=`card-${input.card.id}@nexdo.local`;
 const paragraphs=input.body.split(/\n\s*\n/).map(part=>part.trim()).filter(Boolean);
 const {html}=renderEmail({
  preheader:paragraphs[0] ?? input.subject, heading:input.subject, intro:paragraphs[0] ?? '', body:[...paragraphs.slice(1),...(signature?[signature]:[])],
  image:{src:`cid:${cid}`,alt:'Greeting card',width:496}, showSupport:false,
  footerNote:input.sender ? `Sent by ${input.sender} with Nexdo.` : 'Sent with Nexdo.',
 });
 const id=randomUUID().replace(/-/g,'');
 const related=`nexdo-related-${id}`, alternative=`nexdo-alternative-${id}`;
 const extension=input.card.mime==='image/png'?'png':'jpg';
 return [...headers,`Content-Type: multipart/related; boundary="${related}"; type="multipart/alternative"`,'',
  `--${related}`,`Content-Type: multipart/alternative; boundary="${alternative}"`,'',
  `--${alternative}`,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',base64Lines(text),
  `--${alternative}`,'Content-Type: text/html; charset=UTF-8','Content-Transfer-Encoding: base64','',base64Lines(html),
  `--${alternative}--`,'',
  `--${related}`,`Content-Type: ${input.card.mime}; name="greeting-card.${extension}"`,'Content-Transfer-Encoding: base64',`Content-ID: <${cid}>`,`Content-Disposition: inline; filename="greeting-card.${extension}"`,'',base64Lines(input.card.bytes),
  `--${related}--`,''].join('\r\n');
}
export const gmail: WishEmailProvider = {
 async send(userId,recipient,subject,body,key,extras) {
  const account=await prisma.momentEmailAccount.findUnique({where:{userId}});
  if(!account||account.status!=='connected') return {kind:'reconnect',error:'Reconnect your email account.'};
  let access:string;
  try { access=(await token({grant_type:'refresh_token',refresh_token:decryptCredential(account.refreshToken)!})).access_token; }
  catch { await prisma.momentEmailAccount.update({where:{userId},data:{status:'reconnect'}}); return {kind:'reconnect',error:'Reconnect your email account.'}; }
  // Never retry an ambiguous submission: Gmail send has no idempotency-key guarantee.
  try {
    const raw=buildWishMessage({recipient,subject,body,key,sender:account.email,card:extras?.card,signature:extras?.signature});
    const res=await observedFetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{method:'POST',signal:AbortSignal.timeout(20000),headers:{Authorization:`Bearer ${access}`,'Content-Type':'application/json'},body:JSON.stringify({raw:Buffer.from(raw).toString('base64url')})});
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
 const response=await observedFetch('https://oauth2.googleapis.com/revoke',{method:'POST',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:decryptCredential(account.refreshToken)!})});
 if(!response.ok&&response.status!==400) throw new MomentError('Email access could not be revoked. Try disconnecting again.',502);
}
