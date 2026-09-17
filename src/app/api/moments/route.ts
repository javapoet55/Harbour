import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { jsonError } from '@/lib/http';
import { prisma } from '@/server/db';
import { MomentError } from '@/server/moments/domain';
import { listMoments, saveMoment, generateDraft, approveDraft, schedule, changePlan, runJobs } from '@/server/moments/service';
import { connectURL, revokeEmail } from '@/server/moments/email';
import { z } from 'zod';
function failure(e:unknown) { if(e instanceof SyntaxError) return NextResponse.json({error:"Invalid JSON request."},{status:400}); return e instanceof MomentError ? NextResponse.json({error:e.message},{status:e.status}) : jsonError(e); }
export async function GET() { try { return NextResponse.json(await listMoments((await requireUser()).id)); } catch(e) { return failure(e); } }
export async function POST(req:Request) {
 try {
  const user=await requireUser();const raw=await req.text();if(raw.length>12000) throw new MomentError('Request too large.',413);
  const p=z.object({operation:z.string(),input:z.unknown().optional(),id:z.string().optional()}).parse(JSON.parse(raw));
  switch(p.operation) {
   case 'save': return NextResponse.json({moment:await saveMoment(user.id,p.input,p.id)});
   case 'generate': return NextResponse.json(await generateDraft(user.id,p.input));
   case 'approve': return NextResponse.json({draft:await approveDraft(user.id,p.input)});
   case 'schedule': { const plan=await schedule(user.id,p.input); if(plan.automaticDelivery&&plan.scheduledAtUTC<=new Date()) await runJobs(undefined,plan.id);return NextResponse.json({plan:await prisma.deliveryPlan.findUnique({where:{id:plan.id}})}); }
   case 'plan': return NextResponse.json(await changePlan(user.id,p.input));
   case 'connectEmail': return NextResponse.json({url:await connectURL(user.id)});
   case 'disconnectEmail': {
    if(await prisma.deliveryPlan.count({where:{draft:{moment:{userId:user.id}},status:'SENDING'}})) throw new MomentError('Email is being submitted. Refresh before disconnecting.',409);
    await revokeEmail(user.id);
    await prisma.$transaction([prisma.deliveryPlan.updateMany({where:{draft:{moment:{userId:user.id}},automaticDelivery:true,status:'SCHEDULED'},data:{status:'CANCELLED'}}),prisma.momentEmailAccount.deleteMany({where:{userId:user.id}})]);return NextResponse.json({ok:true});
   }
   case 'visibility': {
    const v=z.object({id:z.string(),enabled:z.boolean(),snoozedUntil:z.iso.datetime({offset:true}).nullable().optional()}).parse(p.input);
    if(await prisma.deliveryPlan.count({where:{draft:{moment:{id:v.id,userId:user.id}},status:{in:['SENDING','SCHEDULED']}}})) throw new MomentError('Cancel the automatic wish before disabling the moment.',409);
    await prisma.importantMoment.updateMany({where:{id:v.id,userId:user.id},data:{enabled:v.enabled,snoozedUntil:v.snoozedUntil}});return NextResponse.json({ok:true});
   }
   default: throw new MomentError('Unsupported operation.');
  }
 } catch(e) {return failure(e);}
}
export async function DELETE() {
 try { const user=await requireUser();if(await prisma.deliveryPlan.count({where:{draft:{moment:{userId:user.id}},status:'SENDING'}})) throw new MomentError('A send is in progress. Try again after it finishes.',409);
 await revokeEmail(user.id);
 await prisma.$transaction([prisma.importantMoment.deleteMany({where:{userId:user.id}}),prisma.momentEmailAccount.deleteMany({where:{userId:user.id}})]);return NextResponse.json({ok:true}); }catch(e){return failure(e);}
}
