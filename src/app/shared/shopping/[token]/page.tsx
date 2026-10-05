import type { Metadata } from 'next';
import {prisma} from '@/server/db';
import {notFound} from 'next/navigation';
export const dynamic='force-dynamic';
export const metadata: Metadata = {
 title: 'Shared shopping list · NexDo',
 description: 'View the selected shopping items shared with you on NexDo.',
 applicationName: 'NexDo - www.nexdoapp.com',
 robots: { index: false, follow: false }, referrer: 'no-referrer',
 openGraph: {
  type: 'website', title: 'Shared shopping list · NexDo',
  description: 'View the selected shopping items shared with you on NexDo.',
  siteName: 'NexDo - www.nexdoapp.com',
  images: [{ url: 'https://app.nexdoapp.com/nexdo-app-512.png', width: 512, height: 512, alt: 'NexDo logo' }],
 },
 twitter: {
  card: 'summary', title: 'Shared shopping list · NexDo',
  description: 'View the selected shopping items shared with you on NexDo.',
  images: ['https://app.nexdoapp.com/nexdo-app-512.png'],
 },
};
export default async function SharedShopping({params}:{params:Promise<{token:string}>}){
 const {token}=await params;if(!/^[a-f0-9]{64}$/.test(token))notFound();
 const list=await prisma.shoppingList.findUnique({where:{shareToken:token},include:{items:{orderBy:{sortOrder:'asc'}}}});if(!list)notFound();
 const items=list.items.filter(item=>item.checked);
 return <main style={{maxWidth:640,margin:'40px auto',padding:24,background:'linear-gradient(135deg,#eeeaff,#eaf5ff)',borderRadius:24,color:'#17153c'}}>
 <p>NexDo · Shared shopping list</p><h1>{list.title}</h1><p>{list.date} · {items.length} {items.length===1?'item':'items'} · View only</p>
 {items.length===0 && <p>No items selected to share.</p>}
 {[...new Set(items.map(i=>i.category))].map(category=><section key={category}>
   <h2>{category}</h2>
   <ul style={{listStyleType:'disc',paddingLeft:24,marginTop:8}}>
     {items.filter(i=>i.category===category).map(i=><li key={i.id} style={{marginBottom:8}}>{i.name} — {i.quantity} {i.size}{i.notes?' · '+i.notes:''}</li>)}
   </ul>
 </section>)}
 </main>;
}
