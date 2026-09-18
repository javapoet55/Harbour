import { prisma } from './db';
import { moduleTools, moduleInstructions, executeModuleTool, moduleSchemas } from './assistant-modules';
import type { AssistantTurn } from './assistant';

function turn(transcript:string,spoken:string,actionId?:string,contextActionId?:string):AssistantTurn{return {transcript,spoken,intent:{intent:'UNKNOWN',confidence:1,confirmationRequired:!!actionId,raw:transcript},visual:{summary:spoken,appointments:[],tasks:[],overdue:[],next:actionId?'Confirm to apply these changes.':'',rangeLabel:'Moments & Shopping'},confirmation:actionId?{prompt:spoken,actionId}:null,contextActionId};}
export async function moduleConversation(userId:string,transcript:string,confirm?:string,reject?:string,context?:string):Promise<AssistantTurn|null>{
 const actionID=confirm||reject||context;
 const previous=actionID?await prisma.assistantAction.findFirst({where:{id:actionID,userId,intent:'MODULE_CONVERSATION'}}):null;
 if((confirm||reject)&&!previous)return null;
 if(previous && (confirm||reject)){
  const p=JSON.parse(previous.payloadJson);
  if(reject){await prisma.assistantAction.updateMany({where:{id:previous.id,userId,executed:false},data:{executed:true,confirmation:'REJECTED'}});return turn(transcript,'No changes made.');}
  if(previous.executed)return turn(transcript,'This request has already been handled. Ask again to check its current status.');
  // Claim once before execution; an interrupted request must never be replayed blindly.
  const claim=await prisma.assistantAction.updateMany({where:{id:previous.id,userId,executed:false},data:{executed:true,confirmation:'CONFIRMED'}});
  if(!claim.count)return turn(transcript,'This request is already being handled.');
  try{const result=await executeModuleTool(userId,previous.id,p.name,p.args);await prisma.assistantAction.update({where:{id:previous.id},data:{resultJson:JSON.stringify(result)}});return turn(transcript,'Saved your changes. Open Important Moments or Shopping Lists to review them.',undefined,previous.id);}
  catch{return turn(transcript,'The change could not be completed. Refresh the module and ask again to check its current state.',undefined,previous.id);}
 }
 if(!previous&&!/\b(moment|moments|birthday|anniversary|festival|diwali|greeting|shopping|grocery|groceries|get well soon)\b/i.test(transcript))return null;
 if(!process.env.OPENAI_API_KEY)return turn(transcript,'AI is unavailable. You can manage moments and shopping lists from Today.');
 const user=await prisma.user.findUniqueOrThrow({where:{id:userId},select:{timeZone:true}});
 const input:unknown[]=[{role:'user',content:JSON.stringify({request:transcript,previous:previous?JSON.parse(previous.payloadJson):null,now:new Date().toISOString(),timeZone:user.timeZone})}];
 for(let step=0;step<5;step++){
  const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_MODEL||'gpt-5.4-mini',store:false,instructions:moduleInstructions+' Use tools for all reads and writes. Changes are proposals until the user confirms in the UI. Ask for missing information. Answer concisely. Do not claim a mutation succeeded before execution. Handle one mutation at a time. For unrelated requests ask the user to start a new request.',tools:moduleTools,parallel_tool_calls:false,input,max_output_tokens:1600}),signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error('OpenAI module assistant unavailable');
  const payload=await response.json();
  const output=payload.output||[];input.push(...output);
  const call=output.find((o:{type:string})=>o.type==='function_call');
  if(!call){
   const spoken=output.flatMap((o:{content?:{text?:string}[]})=>o.content||[]).map((o:{text?:string})=>o.text||'').join('\n')||'Please describe the moment or shopping list you want to manage.';
   const saved=await prisma.assistantAction.create({data:{userId,intent:'MODULE_CONVERSATION',payloadJson:JSON.stringify({request:transcript,response:spoken}),executed:true}});
   return turn(transcript,spoken,undefined,saved.id);
  }
  const schema=moduleSchemas[call.name as keyof typeof moduleSchemas];if(!schema)throw new Error('Unsupported module action');
  const args=schema.parse(JSON.parse(call.arguments));
  if(call.name.startsWith('find_')){input.push({type:'function_call_output',call_id:call.call_id,output:JSON.stringify(await executeModuleTool(userId,call.call_id,call.name,args))});continue;}
  const values=args as Record<string,unknown>;
  const summary=call.name==='create_moment' ? `Create ${values.type} “${values.title}” on ${values.date}${values.yearly?' (repeats yearly)':''}. No greeting will be sent.`
   : call.name==='create_shopping_list' ? `Create “${values.title}” for ${values.date}${values.weekly?', repeating weekly':''}, with ${(values.items as unknown[]).length} items: ${(values.items as {name:string;quantity:string;size:string}[]).map(i=>`${i.quantity} ${i.name}${i.size?' ('+i.size+')':''}`).join(', ')}.`
   : call.name==='update_moment' ? `Update the moment to “${values.title}” on ${values.date}${values.yearly?' (repeats yearly)':''}.`
   : `${String(values.operation)} ${(values.itemIds as unknown[]).length || (values.items as unknown[]).length} shopping items in the selected list.`;
  const saved=await prisma.assistantAction.create({data:{userId,intent:'MODULE_CONVERSATION',payloadJson:JSON.stringify({request:transcript,name:call.name,args}),confirmation:'REQUIRED'}});
  return turn(transcript,summary,saved.id,saved.id);
 }
 return turn(transcript,'Please narrow your request to one moment or shopping list.');
}
