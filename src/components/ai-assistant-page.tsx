import Link from 'next/link';
import { ArrowRight, CalendarDays, Check, CircleCheck, Clock3, ListChecks, LockKeyhole, MessageCircle, Mic, RefreshCcw, ShieldCheck, Sparkles, Timer } from 'lucide-react';
import { MarketingFooter, MarketingHeader } from './marketing-chrome';

const capabilities = [
  [ListChecks, 'Prioritize the right work'],
  [Clock3, 'Find tasks that fit your time'],
  [RefreshCcw, 'Repair an overloaded day'],
  [CalendarDays, 'Work around real commitments'],
  [Mic, 'Ask and listen by voice'],
  [ShieldCheck, 'Approve changes before they happen'],
] as const;

const faqs = [
  ['What can I ask Nexdo?', 'Ask what matters most, what fits before your next meeting, whether your day has conflicts, or how to make room for a priority. You can also capture and update tasks conversationally.'],
  ['How does Nexdo decide what comes next?', 'Nexdo considers task priority, deadlines, available time, dependencies, calendar conflicts, work already in progress, and your saved working preferences. It explains the reasons behind a recommendation.'],
  ['Will Nexdo change my schedule automatically?', 'Material schedule changes are presented as a proposal. You can inspect what will move, keep protected commitments in place, and approve or reject the plan.'],
  ['Can Nexdo work with my calendar?', 'Nexdo connects with Google Calendar and Microsoft Outlook. You control which calendars are visible, which calendar is the default, and whether Nexdo may write task blocks.'],
  ['Does the AI Assistant support voice?', 'Yes. You can speak requests in supported browsers and enable spoken replies. Driving and evening briefings are designed to stay concise.'],
  ['How does personalization work?', 'Personalized predictions are optional and off by default. When enabled, Nexdo can learn from task timing, completion, and postponements. You can erase learned data without deleting your tasks.'],
] as const;

export function AiAssistantPage() {
  return <div className="harbour-site ai-page"><a className="hs-skip" href="#main">Skip to content</a><MarketingHeader product />
    <main id="main">
      <section className="ai-hero hs-wrap">
        <div className="ai-hero-copy"><p className="hs-eyebrow"><span />AI EXECUTIVE COMPANION</p><h1>Ask Nexdo.<br /><em>Know what to do next.</em></h1><p className="ai-hero-intro">Nexdo brings your tasks, deadlines, and calendar into one conversation—then helps you focus, adapt, and follow through.</p><div className="ai-hero-actions"><Link href="/login" className="hs-button">Get Started Free <ArrowRight size={19} /></Link><Link href="/pricing" className="ai-secondary-link">See pricing</Link></div><p className="ai-hero-note"><ShieldCheck size={16} /> Your approval comes before schedule changes.</p></div>
        <div className="ai-assistant-demo" aria-label="Example conversation with Nexdo AI Assistant">
          <div className="ai-demo-header"><span><Sparkles size={17} /> Ask Nexdo</span><span className="ai-demo-status">Ready</span></div>
          <div className="ai-demo-body"><p className="ai-user-message">I have 45 minutes before my next meeting. What should I work on?</p><div className="ai-answer"><span className="ai-answer-mark"><Sparkles size={18} /></span><div><p className="ai-answer-label">BEST NEXT ACTION</p><h2>Finish the launch proposal</h2><p>It is critical, due today, and fits the open window without disturbing your 2 PM review.</p><div className="ai-reason-row"><span><Timer size={15} /> 45 min fit</span><span><CalendarDays size={15} /> Due today</span></div><button type="button"><Timer size={17} /> Start 45-minute focus</button></div></div></div>
          <div className="ai-demo-input"><span>Ask a follow-up…</span><span><Mic size={18} /></span></div>
        </div>
      </section>

      <section className="ai-capabilities"><div className="hs-wrap"><p>ONE ASSISTANT FOR A CHANGING DAY</p><div>{capabilities.map(([Icon, label]) => <span key={label}><Icon size={19} />{label}</span>)}</div></div></section>

      <section className="ai-story hs-wrap" aria-labelledby="ai-story-title"><div className="ai-section-heading"><p className="hs-eyebrow">GROUNDED IN YOUR REAL DAY</p><h2 id="ai-story-title">From a full list to one clear next step</h2><p>Nexdo weighs what matters, what fits, and what your calendar will allow. Ask why, compare options, or request another recommendation.</p></div>
        <div className="ai-story-grid"><article className="ai-story-card ai-story-priority"><span className="ai-story-icon"><ListChecks /></span><p className="ai-card-kicker">FOCUS TODAY</p><h3>Your priorities, with reasons.</h3><p>Deadlines, importance, dependencies, current progress, and schedule risk shape the recommendation.</p><div className="ai-priority-list"><span><b>1</b><span><strong>Finish the proposal</strong><small>Critical · due today</small></span><em>Start now</em></span><span><b>2</b><span><strong>Review launch notes</strong><small>High · blocks the team</small></span></span><span><b>3</b><span><strong>Send the follow-up</strong><small>15 min · after lunch</small></span></span></div></article>
          <article className="ai-story-card ai-story-window"><span className="ai-story-icon"><Clock3 /></span><p className="ai-card-kicker">USE THE TIME YOU HAVE</p><h3>Make a short opening count.</h3><p>Tell Nexdo how much time you have—or ask what fits before the next meeting. Longer work can be split only when you allow it.</p><div className="ai-window"><div><span>OPEN WINDOW</span><strong>10:45–11:30</strong></div><span className="ai-window-arrow">→</span><div><span>BEST FIT</span><strong>45 min focus</strong></div></div></article></div>
      </section>

      <section className="ai-replan-section"><div className="hs-wrap ai-replan-layout"><div><p className="hs-eyebrow">WHEN THE DAY CHANGES</p><h2>Fix the plan.<br />Keep the commitments.</h2><p>Nexdo identifies conflicts and capacity problems, then shows a before-and-after plan. Imported appointments and protected work stay put.</p><ul><li><Check /> See exactly what will move</li><li><Check /> Protect named commitments</li><li><Check /> Apply or reject the complete proposal</li></ul></div><div className="ai-replan-demo"><header><span><RefreshCcw size={17} /> Fix My Day</span><span>Review changes</span></header><div className="ai-capacity"><span>Available today</span><strong>2h 15m</strong><span>Flexible work</span><strong>3h 05m</strong></div><p className="ai-warning">50 minutes need a better home.</p><div className="ai-change"><span>BEFORE</span><div><strong>Finish proposal</strong><small>1:00 PM · conflicts with client call</small></div></div><div className="ai-change ai-change-after"><span>AFTER</span><div><strong>Finish proposal</strong><small>3:30 PM · protected 60-minute block</small></div><CircleCheck size={20} /></div><div className="ai-replan-buttons"><span>Keep current plan</span><strong>Apply changes</strong></div></div></div></section>

      <section className="ai-briefing hs-wrap"><div className="ai-briefing-demo"><div className="ai-wave" aria-hidden="true">{[18,30,22,42,29,50,24,38,18,45,27,34,20].map((height,index)=><i key={index} style={{height}} />)}</div><span className="ai-play"><Mic size={21} /></span><div><p>DRIVING BRIEFING · 42 SEC</p><strong>Your proposal is still the priority. The 4 PM review remains protected, and tomorrow begins with the client call.</strong></div></div><div><p className="hs-eyebrow">CLARITY WITHOUT THE SCREEN</p><h2>Hear the day, not the whole list.</h2><p>Morning, evening, and driving briefings surface completed work, unfinished priorities, conflicts, deadlines, and the next commitment in a concise spoken update.</p><div className="ai-followups"><span>“What can wait?”</span><span>“Tell me about the conflict.”</span><span>“What’s my first meeting?”</span></div></div></section>

      <section className="ai-control"><div className="hs-wrap"><div><p className="hs-eyebrow">HELPFUL. ACCOUNTABLE. YOURS.</p><h2>Intelligence with boundaries.</h2></div><div className="ai-control-grid"><article><LockKeyhole /><h3>Private by design</h3><p>Calendar credentials are encrypted. Task notes and credentials stay out of model context unless they are needed for the request.</p></article><article><ShieldCheck /><h3>Human approval</h3><p>Material changes remain proposals until you approve them. Stale plans expire instead of applying outdated decisions.</p></article><article><MessageCircle /><h3>Context that follows</h3><p>Ask “Why?”, protect a commitment, or correct a detail. Nexdo carries the relevant conversation forward.</p></article></div></div></section>

      <section className="ai-faq hs-wrap" id="questions"><div><p className="hs-eyebrow">QUESTIONS, ANSWERED</p><h2>About the AI Assistant</h2></div><div>{faqs.map(([question,answer])=><details key={question}><summary>{question}<span>+</span></summary><p>{answer}</p></details>)}</div></section>
      <section className="ai-final"><p className="hs-eyebrow">LESS CHAOS. MORE PROGRESS.</p><h2>A clearer next step<br />is one question away.</h2><Link href="/login" className="hs-button">Start Your Free Trial <ArrowRight size={19} /></Link><p>No credit card required</p></section>
    </main><MarketingFooter /></div>;
}
