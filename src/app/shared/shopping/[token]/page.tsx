import {prisma} from '@/server/db';
import {notFound} from 'next/navigation';
export const dynamic='force-dynamic';
export const metadata={title:'Shared shopping list · NexDo',robots:{index:false,follow:false},referrer:'no-referrer'};
export default async function SharedShopping({params}:{params:Promise<{token:string}>}){
 const {token}=await params;if(!/^[a-f0-9]{64}$/.test(token))notFound();
 const list=await prisma.shoppingList.findUnique({where:{shareToken:token},include:{items:{orderBy:{sortOrder:'asc'}}}});if(!list)notFound();
 return <main style={{maxWidth:640,margin:'40px auto',padding:24,background:'linear-gradient(135deg,#eeeaff,#eaf5ff)',borderRadius:24,color:'#17153c'}}>
 <p>NexDo · Shared shopping list</p><h1>{list.title}</h1><p>{list.date} · {list.items.length} items · View only</p>
 {[...new Set(list.items.map(i=>i.category))].map(category=><section key={category}><h2>{category}</h2>{list.items.filter(i=>i.category===category).map(i=><p key={i.id} style={{textDecoration:i.checked?'line-through':'none'}}>{i.checked?'✓':'○'} {i.name} — {i.quantity} {i.size}{i.notes?' · '+i.notes:''}</p>)}</section>)}
 </main>;
}
