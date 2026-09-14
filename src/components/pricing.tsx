"use client";

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import { ArrowLeftRight, ArrowRight, CalendarDays, Check, ChevronDown, CreditCard, GraduationCap, HandHeart, Heart, Info, Rocket, ShieldCheck } from 'lucide-react';
import { MarketingHeader, MarketingFooter } from './marketing-chrome';

const plans = [
  { name: 'Free', subtitle: 'Get organized.', monthly: '0', annual: '0', description: 'A great way to experience Nexdo and see the power of AI in your day.', features: [{ name: "Unlimited tasks", description: ["Create as many tasks as you need.", "Keep your to-dos in one place."] as [string, string] }, { name: "1 calendar connection", description: ["Connect one external calendar.", "See its events alongside your tasks."] as [string, string] }, { name: "Basic AI assistant (5 actions/week)", description: ["Get help capturing and planning tasks.", "Includes five AI actions each week."] as [string, string] }, { name: "Daily briefing (limited)", description: ["See a summary of your daily plans.", "Free includes limited briefing access."] as [string, string] }, { name: "Basic schedule view", description: ["See your tasks and calendar together.", "Review what is planned for your day."] as [string, string] }, { name: "Responsive web app", description: ["Use Nexdo in your web browser.", "The layout adapts to your screen."] as [string, string] }, { name: "Community support", description: ["Get help through community support.", "Share questions about using Nexdo."] as [string, string] }] },
  { name: 'Nexdo Pro', subtitle: 'Your AI Executive Companion.', monthly: '9.99', annual: '99.99', description: 'Plan your day, choose your next step, and turn intentions into action.', features: [{ name: "Everything in Free", description: ["Keep every feature in the Free plan.", "Add the planning tools listed below."] as [string, string] }, { name: "Generous AI usage, subject to fair-use limits", description: ["Use AI more often for daily planning.", "Fair-use limits still apply."] as [string, string] }, { name: "Executive Daily Briefing and Top 3 priorities", description: ["Review your day and top three tasks.", "Prioritize urgent and important work."] as [string, string] }, { name: "What Should I Do Next? Refreshes as your day changes", description: ["Get a useful next-step suggestion.", "Refreshes on task changes and app return."] as [string, string] }, { name: "Tasks that fit your available time, with alternatives and focus sessions", description: ["Find work that fits an open time slot.", "Start focus or choose another option."] as [string, string] }, { name: "Ask Nexdo by voice or text about your tasks and calendar", description: ["Ask questions by speaking or typing.", "Answers use your tasks and calendar."] as [string, string] }, { name: "Continuous voice conversations: create tasks, add more, and make corrections", description: ["Keep talking to add or correct tasks.", "Hear replies in the same conversation."] as [string, string] }, { name: "Create calendar appointments and events by voice", description: ["Speak an appointment’s date and time.", "Save a calendar entry, not a booking."] as [string, string] }, { name: "Call, Message, Email, or Remind Later for contact tasks", description: ["Open a contact action from a task.", "Review the contact or snooze it for later."] as [string, string] }, { name: "Weekly progress, focus time, and completed-work reviews", description: ["Look back at your weekly progress.", "Review completed work and focus time."] as [string, string] }, { name: "Schedule Insights & Conflict Alerts", description: ["Spot overlapping or tight schedules.", "Review work that needs more time."] as [string, string] }, { name: "Fix My Day schedule optimization", description: ["Review proposed moves for your tasks.", "Approve changes before they apply."] as [string, string] }, { name: "Clear next steps for vague tasks (coming soon)", description: ["Coming soon: clarify a vague task.", "Save a small, actionable next step."] as [string, string] }, { name: "Multiple calendar connections", description: ["Connect more than one calendar.", "See work and personal plans together."] as [string, string] }, { name: "Priority email support", description: ["Get priority help through email.", "Ask for support with using Nexdo."] as [string, string] }] },
  { name: 'Nexdo Max', subtitle: 'For power users and executives.', monthly: '19.99', annual: '199.99', description: 'Deeper personalization to make room for your most important work.', features: [{ name: "Everything in Pro", description: ["Keep every feature in the Pro plan.", "Add the Max features listed below."] as [string, string] }, { name: "Personalized duration estimates and completion insights", description: ["Opt in to estimates from work history.", "Review duration and completion predictions."] as [string, string] }, { name: "Work-pattern and postponement insights", description: ["See patterns in your completed work.", "Notice tasks you repeatedly postpone."] as [string, string] }, { name: "Protected-time proposals for repeatedly postponed work (coming soon)", description: ["Coming soon: reserve time for delayed work.", "Approve a block protected from replanning."] as [string, string] }, { name: "Expanded voice allowance for frequent conversations (coming soon)", description: ["Coming soon: a larger voice allowance.", "For more frequent planning conversations."] as [string, string] }, { name: "Advanced analytics & insights", description: ["Explore insights from your work history.", "Review progress and completion patterns."] as [string, string] }, { name: "Email & commitment intelligence (coming soon)", description: ["Coming soon: find commitments in email.", "Turn relevant messages into suggested tasks."] as [string, string] }, { name: "Goal planning & tracking (coming soon)", description: ["Coming soon: plan and track your goals.", "Connect everyday work to bigger aims."] as [string, string] }, { name: "Early access to new features", description: ["Try selected features before wider release.", "Availability depends on the rollout."] as [string, string] }, { name: "Priority support", description: ["Get priority assistance with Nexdo.", "Ask for help with features or your account."] as [string, string] }] },
];
const questions = [
  ['Can I try Nexdo before I pay?', 'Pro and Max include a 14-day free trial, with no credit card required. You can also explore Nexdo with the Free plan.'],
  ["What’s the difference between Pro and Max?", 'Pro brings daily priorities, next-action recommendations, continuous voice conversations, contact actions, and weekly reviews. Max adds personalized duration estimates, completion predictions, and work-pattern insights. Protected-time proposals, an expanded voice allowance, and email intelligence are coming soon. Fair-use limits apply.'],
  ['Can I change plans later?', 'You can choose monthly or annual billing. For help changing an existing subscription, contact support.'],
  ['Is my data secure?', 'Nexdo asks for approval before applying AI-proposed changes and lets you choose whether to enable personalization.'],
  ['Do you offer refunds?', 'Contact support to confirm the refund terms that apply to your subscription before purchasing.'],
  ['Do you offer team or business plans?', 'Nexdo Max is designed for power users, executives and teams. Contact support to discuss your team’s requirements.'],
];
const discounts = [
  { name: 'Student', amount: '50% off', term: 'for 12 months', description: 'For verified students, educators, and faculty.', detail: 'Available after academic-status verification.', icon: GraduationCap, tone: 'violet' },
  { name: 'Nonprofit', amount: '20% off', term: 'for 3 years', description: 'For qualified nonprofit organizations doing meaningful work.', detail: 'Organization verification is required.', icon: HandHeart, tone: 'blue' },
  { name: 'Startup', amount: '20% off', term: 'for 3 years', description: 'For qualified early-stage startups building what comes next.', detail: 'Company eligibility is confirmed during application.', icon: Rocket, tone: 'pink' },
  { name: 'Switching', amount: '20% off', term: 'for 6 months', description: 'For customers moving from another eligible planning provider.', detail: 'Proof of an active competing subscription is required.', icon: ArrowLeftRight, tone: 'green' },
];
type FeatureAvailability = boolean | string;
const featureGroups: Array<{ name: string; features: Array<{ name: string; description: [string, string]; free: FeatureAvailability; pro: FeatureAvailability; max: FeatureAvailability }> }> = [
  { name: 'Tasks & organization', features: [
    { name: 'Tasks, inbox, Today, and Waiting For views', description: ["Keep tasks in one organized place.", "See today\u2019s work and what\u2019s waiting."], free: true, pro: true, max: true },
    { name: 'Priorities, due dates, duration, and energy level', description: ["Set importance, timing, and effort.", "Match your tasks to your capacity."], free: true, pro: true, max: true },
    { name: 'Notes, subtasks, and recurring tasks', description: ["Add context and smaller steps.", "Repeat tasks on a regular schedule."], free: true, pro: true, max: true },
    { name: 'Projects, categories, tags, and task dependencies', description: ["Group work by project or category.", "Link tasks that depend on others."], free: true, pro: true, max: true },
    { name: 'Task search, filters, and bulk actions', description: ["Find the tasks you need quickly.", "Update several tasks in one action."], free: true, pro: true, max: true },
    { name: 'Focus timer with pause and resume', description: ["Start a focused work session.", "Pause and resume when you need to."], free: true, pro: true, max: true },
  ] },
  { name: 'Calendar & scheduling', features: [
    { name: 'Daily, weekly, and monthly schedule views', description: ["View your schedule at different scales.", "Switch between day, week, and month."], free: true, pro: true, max: true },
    { name: 'Google Calendar and Microsoft Outlook connections', description: ["Connect Google or Outlook calendars.", "See synced events alongside tasks."], free: '1 calendar', pro: 'Multiple', max: 'Multiple' },
    { name: 'Calendar visibility, default, and write controls', description: ["Choose which calendars appear.", "Control where Nexdo can write events."], free: true, pro: true, max: true },
    { name: 'Sync Nexdo task blocks to your calendar', description: ["Add scheduled task blocks to a calendar.", "Keep your work visible with meetings."], free: false, pro: true, max: true },
    { name: 'Personal working hours and quiet hours', description: ["Set when you normally work.", "Choose quiet hours for notifications."], free: true, pro: true, max: true },
    { name: 'Schedule Insights & Conflict Alerts', description: ["Spot overlapping or tight schedules.", "Review work that needs more time."], free: false, pro: true, max: true },
    { name: 'Create calendar appointments and events by voice', description: ["Speak an appointment\u2019s date and time.", "Save a calendar entry, not a booking."], free: false, pro: true, max: true },
    { name: 'Fix My Day schedule optimization', description: ["Review proposed moves for your tasks.", "Approve changes before they apply."], free: false, pro: true, max: true },
  ] },
  { name: 'AI executive companion', features: [
    { name: 'Conversational task capture and follow-ups', description: ["Describe tasks in your own words.", "Continue the conversation to refine them."], free: '5 actions/week', pro: 'Generous usage', max: 'Generous usage' },
    { name: 'Executive Daily Briefing', description: ["Get a briefing from your saved plans.", "Review priorities and commitments."], free: 'Limited', pro: 'Unlimited', max: 'Unlimited' },
    { name: 'Top 3 priorities for today', description: ["See three recommended focus tasks.", "Ranked using urgency and importance."], free: false, pro: true, max: true },
    { name: 'What Should I Do Next?', description: ["Get one useful next-step suggestion.", "Choose it or explore alternatives."], free: 'Limited', pro: 'Unlimited', max: 'Unlimited' },
    { name: 'Tasks that fit your available time, with alternatives and focus sessions', description: ["Find work that fits an open time slot.", "Start focus or choose another option."], free: false, pro: true, max: true },
    { name: 'Next-action recommendations refresh after task changes and app return', description: ["Refresh suggestions as tasks change.", "Update again when you return to the app."], free: false, pro: true, max: true },
    { name: 'Ask about priorities, deadlines, and available time using your tasks and calendar', description: ["Ask questions about your saved plans.", "Get answers grounded in your schedule."], free: 'Limited', pro: true, max: true },
    { name: 'Turn vague tasks into clear next steps', description: ["Coming soon: clarify a vague task.", "Save a small, actionable next step."], free: false, pro: 'Coming soon', max: 'Coming soon' },
    { name: 'Driving and evening briefings', description: ["Listen to a spoken schedule briefing.", "Review your day and upcoming work."], free: false, pro: true, max: true },
    { name: 'Review and approval before AI schedule changes', description: ["Review AI-proposed schedule changes.", "Nothing moves until you approve it."], free: true, pro: true, max: true },
    { name: 'Protected commitments and stale-plan safeguards', description: ["Keep fixed commitments in place.", "Reject plans based on outdated data."], free: true, pro: true, max: true },
  ] },
  { name: 'Voice, briefings & reminders', features: [
    { name: 'Typed Ask Nexdo assistant', description: ["Type a question or planning request.", "Get help without using a microphone."], free: true, pro: true, max: true },
    { name: 'Continuous voice conversations with spoken replies and task corrections', description: ["Keep talking to add or correct tasks.", "Hear replies in the same conversation."], free: false, pro: true, max: true },
    { name: 'Expanded voice allowance for frequent planning conversations', description: ["Coming soon: a larger voice allowance.", "For more frequent planning conversations."], free: false, pro: false, max: 'Coming soon' },
    { name: 'Call, Message, Email, or Remind Later for contact tasks', description: ["Open a contact action from a task.", "Review the contact or snooze it for later."], free: false, pro: true, max: true },
    { name: 'Weekly progress, focus time, and completed-work reviews', description: ["Look back at your weekly progress.", "Review completed work and focus time."], free: false, pro: true, max: true },
    { name: 'Browser push reminders', description: ["Receive reminders in your browser.", "Requires notification permission."], free: true, pro: true, max: true },
    { name: 'Email reminders', description: ["Receive task reminders by email.", "Keep upcoming work in view."], free: false, pro: true, max: true },
    { name: 'SMS reminders', description: ["Receive reminders by text message.", "Requires a configured phone number."], free: false, pro: false, max: true },
    { name: 'Morning and evening summaries', description: ["Review plans at the start of the day.", "Reflect on progress in the evening."], free: 'Limited', pro: true, max: true },
    { name: 'Notification delivery history', description: ["Review recorded notification attempts.", "Check delivery status and failures."], free: true, pro: true, max: true },
  ] },
  { name: 'Personalization, privacy & support', features: [
    { name: 'Encrypted calendar credentials', description: ["Calendar access credentials are encrypted.", "Connect calendars without sharing passwords."], free: true, pro: true, max: true },
    { name: 'No raw voice-audio storage', description: ["Raw voice recordings are not retained.", "Transcripts may support your conversation."], free: true, pro: true, max: true },
    { name: 'Opt-in personalized duration estimates and completion predictions', description: ["Opt in to estimates from work history.", "Review duration and completion predictions."], free: false, pro: false, max: true },
    { name: 'Work-pattern and postponement insights', description: ["See patterns in your completed work.", "Notice tasks you repeatedly postpone."], free: false, pro: false, max: true },
    { name: 'Protected-time proposals for important work postponed three or more times', description: ["Coming soon: reserve time for delayed work.", "Approve a block protected from replanning."], free: false, pro: false, max: 'Coming soon' },
    { name: 'Erase learned personalization data', description: ["Remove learned personalization data.", "Stay in control of your work history."], free: true, pro: true, max: true },
    { name: 'Support', description: ["Get help with using Nexdo.", "Support options vary by plan."], free: 'Community', pro: 'Priority email', max: 'Priority' },
    { name: 'Early access to new features', description: ["Try selected features before wider release.", "Availability depends on the rollout."], free: false, pro: false, max: true },
    { name: 'Email and commitment intelligence', description: ["Coming soon: find commitments in email.", "Turn relevant messages into suggested tasks."], free: false, pro: false, max: 'Coming soon' },
    { name: 'Goal planning and tracking', description: ["Coming soon: plan and track your goals.", "Connect everyday work to bigger aims."], free: false, pro: false, max: 'Coming soon' },
  ] },
];


function FeatureInfo({ name, description }: { name: string; description: [string, string] }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const tooltip = useRef<HTMLSpanElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number; above: boolean; width: number } | null>(null);
  const cancelClose = () => { if (closeTimer.current) clearTimeout(closeTimer.current); };
  const close = () => { cancelClose(); setPosition(null); };
  const open = () => {
    cancelClose();
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(360, window.innerWidth - 24);
    const above = rect.bottom + 90 > window.innerHeight;
    setPosition({ left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)), top: above ? rect.top - 8 : rect.bottom + 8, above, width });
  };
  const delayedClose = () => { cancelClose(); closeTimer.current = setTimeout(() => setPosition(null), 160); };
  useEffect(() => {
    if (!position) return;
    const hide = () => setPosition(null);
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') hide(); };
    const outside = (event: PointerEvent) => { if (!trigger.current?.contains(event.target as Node) && !tooltip.current?.contains(event.target as Node)) hide(); };
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    document.addEventListener('keydown', escape);
    document.addEventListener('pointerdown', outside);
    return () => { window.removeEventListener('scroll', hide, true); window.removeEventListener('resize', hide); document.removeEventListener('keydown', escape); document.removeEventListener('pointerdown', outside); };
  }, [position]);
  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);
  return <>
    <button ref={trigger} type="button" className="pricing-feature-info" aria-label={`About ${name}`} aria-describedby={position ? id : undefined} onMouseEnter={open} onMouseLeave={delayedClose} onFocus={open} onBlur={close} onClick={open}><Info size={16} aria-hidden="true" /></button>
    {position && createPortal(<span ref={tooltip} id={id} role="tooltip" className="pricing-feature-tooltip" style={{ left: position.left, top: position.top, width: position.width, transform: position.above ? 'translateY(-100%)' : undefined }} onMouseEnter={cancelClose} onMouseLeave={delayedClose}>{description.map(line => <span key={line}>{line}</span>)}</span>, document.body)}
  </>;
}

function FeatureValue({ value }: { value: FeatureAvailability }) {
  if (value === true) return <span className="pricing-feature-check"><Check size={17} strokeWidth={3} aria-hidden="true" /><span className="hs-sr-only">Included</span></span>;
  if (value === false) return <span className="pricing-feature-unavailable" aria-label="Not included">—</span>;
  return <span className={`pricing-feature-label${value === 'Coming soon' ? ' pricing-feature-coming' : ''}`}>{value}</span>;
}
export function Pricing() {
  const [annual, setAnnual] = useState(false);
  const [showFeatures, setShowFeatures] = useState(false);
  return <div className="harbour-site pricing-site"><a className="hs-skip" href="#main">Skip to content</a><MarketingHeader pricing />
    <main id="main" className="hs-wrap pricing-main">
      <section className="pricing-intro" aria-labelledby="pricing-title"><p className="hs-eyebrow">YOUR AI EXECUTIVE COMPANION</p><h1 id="pricing-title">Choose the plan that fits your day</h1><p>Get more focus, less chaos, and make real progress with AI by your side.</p>
      <div className="pricing-billing"><div className="pricing-toggle" role="group" aria-label="Billing period"><button type="button" aria-pressed={!annual} onClick={() => setAnnual(false)}>Monthly</button><button type="button" aria-pressed={annual} onClick={() => setAnnual(true)}>Annual</button></div><span className={`pricing-savings${annual ? ' pricing-savings-annual' : ''}`}>{annual ? 'Save up to 20%' : 'Save up to 20% with annual'}</span></div></section>
      <div className="pricing-grid" aria-live="polite">{plans.map((plan, index) => <article key={plan.name} className={`pricing-card pricing-card-${index}`}>
        {index === 1 && <div className="pricing-popular">MOST POPULAR</div>}
        <h2>{plan.name}</h2><p className="pricing-subtitle">{plan.subtitle}</p><div className="pricing-price"><strong>${annual ? plan.annual : plan.monthly}</strong><span>{index === 0 ? (annual ? 'forever' : '/ month') : annual ? '/ year' : '/ month'}</span></div>
        <p className="pricing-billing-note">{index > 0 ? annual ? `$${index === 1 ? '8.33' : '16.67'} / month equivalent, billed annually` : 'Billed monthly' : 'Free to get started'}</p>
        <p className="pricing-description">{plan.description}</p><Link href="/login" className={`pricing-cta ${index === 1 ? 'hs-button' : ''}`}>{index === 0 ? 'Get Started Free' : 'Start 14-Day Free Trial'}</Link>
        <ul>{plan.features.map(feature => <li key={feature.name}><Check size={20} strokeWidth={3} aria-hidden="true" /><span className="pricing-card-feature-text">{feature.name}</span><FeatureInfo name={feature.name} description={feature.description} /></li>)}</ul>
      </article>)}</div>
      <section className="pricing-assurances" aria-label="Plan benefits">{[[CalendarDays, '14-day free trial', 'No credit card required'], [CreditCard, 'Cancel anytime', 'No long-term contracts'], [ShieldCheck, 'Your data stays private', 'You stay in control'], [Heart, 'For busy professionals', 'More time for what matters']].map(([Icon, title, text]) => { const BenefitIcon = Icon as typeof CalendarDays; return <div key={String(title)}><span className="pricing-benefit-icon"><BenefitIcon size={28} /></span><p><strong>{String(title)}</strong><span>{String(text)}</span></p></div>; })}</section>
      <section className="pricing-discounts" aria-labelledby="discounts-title">
        <div className="pricing-discounts-heading"><p className="hs-eyebrow">SPECIAL PRICING</p><h2 id="discounts-title">Discounts that meet you where you are</h2><p>Eligible customers can save on Nexdo while they study, serve, build, or switch.</p></div>
        <div className="pricing-discount-grid">{discounts.map(({ name, amount, term, description, detail, icon: Icon, tone }) => <article className={`pricing-discount-card pricing-discount-${tone}`} key={name}>
          <div className="pricing-discount-top"><span className="pricing-discount-icon"><Icon size={22} aria-hidden="true" /></span><span className="pricing-discount-pill">{amount}</span></div>
          <h3>{name} Discount</h3><p className="pricing-discount-term">{term}</p><p className="pricing-discount-description">{description}</p>
          <div className="pricing-discount-actions"><Link href="/login" className="pricing-discount-apply">Apply now <ArrowRight size={16} /></Link><details><summary>Eligibility</summary><p>{detail}</p></details></div>
        </article>)}</div>
        <p className="pricing-discount-note">Discounts require verification and cannot be combined with other offers.</p>
      </section>
      <section className="pricing-features" aria-labelledby="all-features-title">
        <div className="pricing-features-heading"><p className="hs-eyebrow">COMPARE PLANS</p><h2 id="all-features-title"><button className="pricing-features-toggle" type="button" aria-expanded={showFeatures} aria-controls="pricing-feature-comparison" onClick={() => setShowFeatures(current => !current)}>{showFeatures ? 'Hide All Features' : 'Show All Features'}<ChevronDown size={24} aria-hidden="true" /></button></h2><p>See exactly what is included as Nexdo grows with your day.</p></div>
        <div id="pricing-feature-comparison" hidden={!showFeatures}>
          <div className="pricing-features-table-wrap">
            <table className="pricing-features-table">
              <caption className="hs-sr-only">Comparison of all features in Nexdo Free, Nexdo Pro, and Nexdo Max</caption>
              <thead><tr><th scope="col">Feature</th><th scope="col"><span>Free</span><small>$0</small></th><th scope="col" className="pricing-feature-pro"><span>Nexdo Pro</span><small>$9.99/mo</small></th><th scope="col"><span>Nexdo Max</span><small>$19.99/mo</small></th></tr></thead>
              {featureGroups.map(group => <tbody key={group.name}><tr className="pricing-feature-group"><th colSpan={4} scope="colgroup">{group.name}</th></tr>{group.features.map(feature => <tr key={feature.name}><th scope="row"><span className="pricing-feature-name">{feature.name}<FeatureInfo name={feature.name} description={feature.description} /></span></th><td><FeatureValue value={feature.free} /></td><td className="pricing-feature-pro"><FeatureValue value={feature.pro} /></td><td><FeatureValue value={feature.max} /></td></tr>)}</tbody>)}
            </table>
          </div>
          <p className="pricing-features-note">Generous AI usage is subject to fair-use limits. Expanded voice allowances and features marked coming soon are not included in the current product. Next-action recommendations refresh while you use the app and when you return. Voice-created appointments are calendar entries, not external bookings or invitations. Personalization is opt-in.</p>
        </div>
      </section>
      <section className="pricing-faq" aria-labelledby="faq-title"><h2 id="faq-title">Frequently asked questions</h2><div>{questions.map(([question, answer]) => <details key={question}><summary>{question}<ChevronDown size={16} aria-hidden="true" /></summary><p>{answer}</p></details>)}</div></section>
      <section className="pricing-final"><div><h2>Ready to get back control of your day?</h2><p>Join professionals who are doing more with Nexdo.</p></div><div><Link className="hs-button" href="/login">Start Your Free Trial <ArrowRight size={20} /></Link><p>No credit card required</p></div><span className="pricing-signature">Less chaos.<br />More progress.<br />That’s Nexdo.</span></section>
    </main><MarketingFooter /></div>;
}
