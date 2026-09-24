export type VoiceRecord = { id:string; user:string; date:string; minutes:number|null; type:string; status:string };
export function formatVoiceDate(value:string) {
 return new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit',timeZoneName:'short'}).format(new Date(value));
}
export function voiceSummary(records:VoiceRecord[]) {
 const measured=records.filter(r=>r.minutes!==null);
 const minutes=measured.reduce((sum,r)=>sum+r.minutes!,0);
 const users=Array.from(new Set(records.map(r=>r.user))).map(user=>{
  const rows=records.filter(r=>r.user===user);
  return {user,count:rows.length,measured:rows.filter(r=>r.minutes!==null).length,minutes:rows.reduce((sum,r)=>sum+(r.minutes??0),0),last:rows.map(r=>r.date).sort().at(-1)!};
 }).sort((a,b)=>b.minutes-a.minutes);
 const types=['Realtime','Transcription','Voice'].map(type=>{
  const rows=records.filter(r=>r.type===type);
  return {type,count:rows.length,measured:rows.filter(r=>r.minutes!==null).length,minutes:rows.reduce((sum,r)=>sum+(r.minutes??0),0)};
 });
 return {measured,minutes,average:measured.length?minutes/measured.length:null,users,types};
}
