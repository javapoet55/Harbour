import Link from 'next/link';
import type { Metadata } from 'next';
import articles from '@/content/support-articles.json';
import { MarketingHeader, MarketingFooter } from '@/components/marketing-chrome';
import '../welcome/welcome.css';
import './help.css';
export const metadata: Metadata = { title: 'Nexdo Help — guides and common questions', description: 'Learn about Nexdo, compare plans, and browse task and calendar help.' };
export default function HelpPage() {
  return <div className="harbour-site"><MarketingHeader /><main className="help-page hs-wrap"><p className="hs-eyebrow">NEXDO HELP</p><h1>A little guidance.<br />A clearer day.</h1><p className="help-intro">Find answers in our product guides, or use <strong>Ask support</strong> to ask a question in your own words.</p><nav className="help-links" aria-label="Help categories"><a href="#website">Website & plans</a><a href="#tasks">iPhone tasks</a><a href="#calendar">iPhone calendar</a></nav><section id="website"><h2>Website & plans</h2><p>Explore Nexdo’s features, pricing, and frequently asked questions.</p><div className="help-links"><Link href="/welcome#questions">Getting started →</Link><Link href="/pricing">Plans & billing →</Link><Link href="/features/ai-assistant">AI Assistant →</Link></div></section>{['tasks', 'calendar'].map(category => <section id={category} key={category}><h2>{category === 'tasks' ? 'Tasks' : 'Calendar'} · iPhone app</h2><p>These guides describe the native iPhone app. Website controls may differ.</p>{articles.filter(a => a.platform === 'iPhone app' && a.id.startsWith(category + '-')).map(a => <article id={a.id} key={a.id}><h3>{a.title}</h3><p>{a.text}</p></article>)}</section>)}</main><MarketingFooter /></div>;
}
