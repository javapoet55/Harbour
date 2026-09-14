'use client';

import { AiFeatureShowcase } from './ai-feature-showcase';

import Link from 'next/link';
import { MarketingHeader, MarketingFooter } from './marketing-chrome';
import { useState } from 'react';
import { matchLandingStory } from '@/lib/landing-demo';
import { ArrowDown, ArrowRight, AudioLines, CalendarDays, Check, CheckCheck, ChevronRight, Compass, MessageCircle, RotateCcw, ShieldCheck, Sparkles, Timer } from 'lucide-react';

const journeys = {
  focus: { label: 'Find my focus', prompt: 'What should I focus on today?', title: 'Less deciding. More doing.', answer: 'Start with the proposal: it is due today and needs your best thinking. The follow-up can wait until after lunch.', items: [['09:00', 'Finish the proposal', 'Critical · 60 min'], ['10:00', 'Design review', 'Calendar · 30 min'], ['13:30', 'Send the follow-up', 'Task · 15 min']], note: 'Priorities, deadlines, and available time—not just the first three tasks.', cta: 'Find your focus in Nexdo' },
  replan: { label: 'Make room for a change', prompt: 'A meeting came up. Make room for my proposal.', title: 'Life moves. Your plan can too.', answer: 'Keep the new meeting at 9. Move proposal time to 10:30 and the follow-up to 2. Review the changes before applying them.', items: [['09:00', 'New client meeting', 'Calendar · 60 min'], ['10:30', 'Finish the proposal', 'Proposed move · 60 min'], ['14:00', 'Send the follow-up', 'Proposed move · 15 min']], note: 'Nexdo proposes a revised plan. You decide what changes.', cta: 'Make room in your day' },
  brief: { label: 'See the bigger picture', prompt: 'Nexdo, brief me.', title: 'Your day, without the digging.', answer: 'Your proposal is due today. Tomorrow has room for the project review. One overdue invoice needs attention; start there if it is blocking your work.', items: [['TODAY', 'Finish the proposal', 'Deadline · 60 min'], ['NEXT', 'Review the project', 'Tomorrow · 45 min'], ['LATE', 'Check the invoice', 'Overdue · 10 min']], note: 'Today, tomorrow, upcoming deadlines, conflicts, and focus—in one briefing.', cta: 'Get your own briefing' },
} as const;
type Journey = keyof typeof journeys;

export function HarbourLanding() {
  const [journey, setJourney] = useState<Journey>('focus');
  const [prompt, setPrompt] = useState('');
  const [notice, setNotice] = useState('');
  const [approved, setApproved] = useState(false);
  const selected = journeys[journey];
  function choose(value: Journey) { setJourney(value); setApproved(false); setNotice(''); }
  function explore(event: React.FormEvent) {
    event.preventDefault();
    const story = matchLandingStory(prompt);
    if (!story) { setNotice('This guided demo has three sample stories. Choose one below to explore, or sign in for a real conversation.'); return; }
    choose(story);
    setNotice('Showing a matching sample story—not a live AI response. Nothing is saved or sent to AI.');
  }

  return <div className="harbour-site">
    <a className="hs-skip" href="#main">Skip to content</a>
    <MarketingHeader />
    <main id="main">
      <section className="hs-hero hs-wrap" aria-labelledby="hero-title"><div className="hs-hero-copy"><p className="hs-eyebrow"><span /> YOUR DAY. A LITTLE LIGHTER.</p><h1 id="hero-title">A little less<br />juggling.<br /><em>A little more living.</em></h1><p className="hs-intro">Meet the AI-powered to-do app that turns a full head into a clear plan. Tasks, calendar, and a conversation that brings it all together.</p><div className="hs-hero-actions"><a href="#experience" className="hs-button">Find your flow <ArrowRight size={19} /></a><Link href="/login" className="hs-text-link">Already have an account? <ArrowRight size={16} /></Link></div><div className="hs-trust"><ShieldCheck size={17} /> AI proposes. You stay in control.</div></div>
      <div className="hs-product" aria-label="Illustrative Nexdo daily plan"><div className="hs-product-top"><span><Compass size={19} /> MY DAY</span><span className="hs-avatar">J</span></div><p className="hs-mini-label">A SAMPLE DAY WITH NEXDO</p><h2>Room to do your best work.</h2><div className="hs-day-stats"><span><b>3</b> things that matter</span><span><b>1</b> clear next step</span></div><div className="hs-task-feature"><span className="hs-circle" /><div><strong>Finish the proposal</strong><p><b>Critical</b> 60 min · Due today</p></div><Timer size={21} /></div><div className="hs-sample-row"><CalendarDays size={20} /><div><strong>Design review</strong><p>10:00 AM · 30 min</p></div><span>Work</span></div><div className="hs-sample-row"><span className="hs-circle" /><div><strong>Send the follow-up</strong><p>After lunch · 15 min</p></div></div><div className="hs-assistant-note"><div className="hs-ai-mark"><AudioLines size={21} /></div><p><strong>A little clarity from Nexdo</strong>Your proposal comes first. There’s room for the rest after your meeting.</p></div><a href="#experience" className="hs-product-link">Try the interactive walkthrough <ArrowDown size={16} /></a></div></section>
      <div className="hs-capability-strip hs-wrap"><span>ONE PLACE FOR YOUR DAY</span><p><CheckCheck size={18} /> Tasks</p><p><CalendarDays size={18} /> Calendar</p><p><MessageCircle size={18} /> AI conversation</p><p><Timer size={18} /> Focus</p></div>
      <section id="experience" className="hs-experience"><div className="hs-wrap"><div className="hs-section-heading"><div><p className="hs-eyebrow">LESS SETUP. MORE “I’VE GOT THIS.”</p><h2>Start with what’s<br />on your mind.</h2></div><p>No tour of a dozen menus.<br />Pick what you need from your day.</p></div><div className="hs-demo-layout"><div className="hs-demo-input"><span className="hs-demo-label"><Sparkles size={16} /> INTERACTIVE SAMPLE</span><h3>How can we lighten your day?</h3><form onSubmit={explore}><label className="hs-sr-only" htmlFor="hs-prompt">What would you like help with?</label><textarea id="hs-prompt" value={prompt} maxLength={400} onChange={(event) => setPrompt(event.target.value)} placeholder="I have a busy day. Help me find my focus…" rows={3} /><button type="submit" disabled={!prompt.trim()} aria-label="Explore a matching sample"><ArrowRight size={20} /></button></form><p className="hs-demo-disclosure">Guided examples, not live AI. No account or personal data needed.</p><div className="hs-journeys" role="group" aria-label="Choose a sample story">{(Object.keys(journeys) as Journey[]).map((key, index) => <button key={key} aria-pressed={journey === key} onClick={() => choose(key)}><span>0{index + 1}</span>{journeys[key].label}<ChevronRight size={18} /></button>)}</div><p role="status" className="hs-demo-notice">{notice}</p></div><div className="hs-demo-result" aria-live="polite" aria-atomic="true"><p className="hs-demo-question">“{selected.prompt}”</p><div className="hs-demo-answer"><Compass size={26} /><div><h3>{selected.title}</h3><p>{selected.answer}</p></div></div><ol className="hs-plan">{selected.items.map(([time, title, detail]) => <li key={title}><time>{time}</time><div><strong>{title}</strong><span>{approved && journey === 'replan' ? detail.replace('Proposed move', 'Sample plan updated') : detail}</span></div><Check size={16} /></li>)}</ol>{journey === 'replan' && <button className="hs-demo-approve" onClick={() => setApproved(!approved)}>{approved ? <RotateCcw size={16} /> : <Check size={16} />}{approved ? 'Reset sample changes' : 'Approve sample changes'}</button>}<p className="hs-explanation"><ShieldCheck size={16} />{approved && journey === 'replan' ? 'Sample updated. Your real tasks have not changed.' : selected.note}</p><Link href="/login" className="hs-demo-cta">{selected.cta}<ArrowRight size={17} /></Link></div></div></div></section>
      <AiFeatureShowcase />
      <section className="hs-control hs-wrap"><div><p className="hs-eyebrow">HELPFUL. NOT HEAVY-HANDED.</p><h2>Your assistant.<br />Your final say.</h2></div><div><p>Let Nexdo do the thinking alongside you. Review proposed changes before they touch your plan, and choose whether personalization learns from your habits.</p><div className="hs-control-points"><span><Check /> Approval before AI changes</span><span><Check /> Opt-in personal predictions</span><span><Check /> Mobile-friendly web experience</span></div></div></section>
      <section id="questions" className="hs-wrap hs-faq"><div><p className="hs-eyebrow">A FEW GOOD QUESTIONS</p><h2>Before you<br />come aboard.</h2></div><div>{[
        ['Is this demo using my real tasks?', 'No. The walkthrough uses fixed sample stories, selected locally in your browser. It does not contact an AI service or read, save, or change your tasks. Sign in to use Nexdo with your own data.'],
        ['What makes Nexdo AI-powered?', 'Nexdo includes structured conversational task interpretation, contextual follow-ups, grounded briefings, scheduling, and consent-based statistical predictions. Full language-model conversations and OpenAI-generated speech require the service to be configured.'],
        ['Will AI rearrange my day without asking?', 'AI-generated material changes are proposed for review. Nexdo validates the actions and asks for approval before applying them. Direct actions you choose, such as completing a task, still work normally.'],
        ['Can I use it on my phone?', 'Yes. Nexdo has a responsive web interface for phones, tablets, and desktops. This is a web app; this page does not claim an App Store release.'],
        ['What about calendars and reminders?', 'Nexdo supports calendar integration and reminder workflows. Google or Microsoft connections and delivery channels need configuration and permission. Availability depends on the enabled providers; this demo does not connect any accounts.'],
      ].map(([question, answer]) => <details key={question}><summary>{question}<span aria-hidden="true">+</span></summary><p>{answer}</p></details>)}</div></section>
      <section className="hs-last"><p className="hs-eyebrow">MAKE ROOM FOR WHAT MATTERS.</p><h2>A clearer day<br />starts with a conversation.</h2><Link href="/login" className="hs-button">Open Nexdo <ArrowRight size={19} /></Link><p>Have a look around. Find your next step.</p></section>
    </main><MarketingFooter />
  </div>;
}
