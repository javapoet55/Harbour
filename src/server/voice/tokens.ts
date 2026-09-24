import { prisma } from '@/server/db';
import { groupVoiceTokens, voiceTokenReceipt, type VoiceTokenReceipt } from '@/lib/voice-tokens';

export async function recordVoiceTokens(userId: string, receipt: VoiceTokenReceipt) {
  const value = voiceTokenReceipt.parse(receipt);
  // Provider response/item IDs are stable across retries. First receipt wins;
  // retries must not change its timestamp or duplicate usage.
  await prisma.userMemory.upsert({
    where: {userId_key:{userId,key:`voice-token:${value.source}:${value.id}`}},
    create: {userId,key:`voice-token:${value.source}:${value.id}`,kind:'voice_tokens',source:'ios-realtime',value:JSON.stringify(value)},
    update: {},
  });
}
export async function getVoiceTokens(from: Date, to: Date) {
  const rows = await prisma.userMemory.findMany({where:{kind:'voice_tokens',createdAt:{gte:from,lte:to},user:{deletedAt:null}},select:{userId:true,value:true,createdAt:true,user:{select:{email:true}}}});
  return groupVoiceTokens(rows.flatMap(row=>{
    try { const parsed=voiceTokenReceipt.safeParse(JSON.parse(row.value));
      return parsed.success?[{userId:row.userId,user:row.user.email,date:row.createdAt,receipt:parsed.data}]:[];
    } catch {return [];}
  }));
}
