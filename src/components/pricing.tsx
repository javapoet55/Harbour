"use client";

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeftRight, ArrowRight, CalendarDays, Check, ChevronDown, CreditCard, GraduationCap, HandHeart, Heart, Rocket, ShieldCheck } from 'lucide-react';
import { MarketingHeader, MarketingFooter } from './marketing-chrome';

const plans = [
  { name: 'Free', subtitle: 'Get organized.', monthly: '0', annual: '0', description: 'A great way to experience Nexdo and see the power of AI in your day.', features: ['Unlimited tasks', '1 calendar connection', 'Basic AI assistant (5 actions/week)', 'Daily briefing (limited)', 'Basic schedule view', 'Responsive web app', 'Community support'] },
  { name: 'Nexdo Pro', subtitle: 'Your AI Executive Companion.', monthly: '9.99', annual: '99.99', description: 'Everything you need to stay ahead, reduce stress and get more done.', features: ['Everything in Free', 'Generous AI usage, subject to fair-use limits', 'Executive Daily Briefing (unlimited)', 'Risk & Conflict Intelligence', 'What Should I Do Next? (unlimited)', 'Fix My Day (AI schedule optimization)', 'Conversational AI companion', 'Voice support', 'Multiple calendar connections', 'Priority email support'] },
  { name: 'Nexdo Max', subtitle: 'For power users and executives.', monthly: '19.99', annual: '199.99', description: 'Maximum intelligence, personalization and control for your most important work.', features: ['Everything in Pro', 'Expanded voice usage, subject to fair-use limits', 'Advanced personalization (learns your work style)', 'Email & commitment intelligence (extracts tasks automatically)', 'Goal planning & tracking (coming soon)', 'Advanced analytics & insights', 'Early access to new features', 'Priority support', 'Designed for executives and teams'] },
];
const questions = [
  ['Can I try Nexdo before I pay?', 'Pro and Max include a 14-day free trial, with no credit card required. You can also explore Nexdo with the Free plan.'],
  ["What’s the difference between Pro and Max?", 'Pro adds generous AI usage, daily briefings and schedule intelligence. Max adds expanded voice usage, advanced personalization, email intelligence and advanced analytics. Fair-use limits apply.'],
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
const featureGroups: Array<{ name: string; features: Array<{ name: string; free: FeatureAvailability; pro: FeatureAvailability; max: FeatureAvailability }> }> = [
  { name: 'Tasks & organization', features: [
    { name: 'Tasks, inbox, Today, and Waiting For views', free: true, pro: true, max: true },
    { name: 'Priorities, due dates, duration, and energy level', free: true, pro: true, max: true },
    { name: 'Notes, subtasks, and recurring tasks', free: true, pro: true, max: true },
    { name: 'Projects, categories, tags, and task dependencies', free: true, pro: true, max: true },
    { name: 'Task search, filters, and bulk actions', free: true, pro: true, max: true },
    { name: 'Focus timer with pause and resume', free: true, pro: true, max: true },
  ] },
  { name: 'Calendar & scheduling', features: [
    { name: 'Daily, weekly, and monthly schedule views', free: true, pro: true, max: true },
    { name: 'Google Calendar and Microsoft Outlook connections', free: '1 calendar', pro: 'Multiple', max: 'Multiple' },
    { name: 'Calendar visibility, default, and write controls', free: true, pro: true, max: true },
    { name: 'Sync Nexdo task blocks to your calendar', free: false, pro: true, max: true },
    { name: 'Personal working hours and quiet hours', free: true, pro: true, max: true },
    { name: 'Schedule risk and conflict intelligence', free: false, pro: true, max: true },
    { name: 'Fix My Day schedule optimization', free: false, pro: true, max: true },
  ] },
  { name: 'AI executive companion', features: [
    { name: 'Conversational task capture and follow-ups', free: '5 actions/week', pro: 'Generous usage', max: 'Generous usage' },
    { name: 'Executive Daily Briefing', free: 'Limited', pro: 'Unlimited', max: 'Unlimited' },
    { name: 'What Should I Do Next?', free: 'Limited', pro: 'Unlimited', max: 'Unlimited' },
    { name: 'Recommendations for the time before your next meeting', free: false, pro: true, max: true },
    { name: 'Driving and evening briefings', free: false, pro: true, max: true },
    { name: 'Review and approval before AI schedule changes', free: true, pro: true, max: true },
    { name: 'Protected commitments and stale-plan safeguards', free: true, pro: true, max: true },
  ] },
  { name: 'Voice, briefings & reminders', features: [
    { name: 'Typed Ask Nexdo assistant', free: true, pro: true, max: true },
    { name: 'Voice input and spoken replies', free: false, pro: true, max: 'Expanded usage' },
    { name: 'Browser push reminders', free: true, pro: true, max: true },
    { name: 'Email reminders', free: false, pro: true, max: true },
    { name: 'SMS reminders', free: false, pro: false, max: true },
    { name: 'Morning and evening summaries', free: 'Limited', pro: true, max: true },
    { name: 'Notification delivery history', free: true, pro: true, max: true },
  ] },
  { name: 'Personalization, privacy & support', features: [
    { name: 'Encrypted calendar credentials', free: true, pro: true, max: true },
    { name: 'No raw voice-audio storage', free: true, pro: true, max: true },
    { name: 'Opt-in personalized timing and completion predictions', free: false, pro: false, max: true },
    { name: 'Learned duration, postponement, and work-rhythm insights', free: false, pro: false, max: true },
    { name: 'Erase learned personalization data', free: false, pro: false, max: true },
    { name: 'Support', free: 'Community', pro: 'Priority email', max: 'Priority' },
    { name: 'Early access to new features', free: false, pro: false, max: true },
    { name: 'Email and commitment intelligence', free: false, pro: false, max: 'Coming soon' },
    { name: 'Goal planning and tracking', free: false, pro: false, max: 'Coming soon' },
  ] },
];

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
        <ul>{plan.features.map(feature => <li key={feature}><Check size={20} strokeWidth={3} aria-hidden="true" /><span>{feature}</span></li>)}</ul>
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
              {featureGroups.map(group => <tbody key={group.name}><tr className="pricing-feature-group"><th colSpan={4} scope="colgroup">{group.name}</th></tr>{group.features.map(feature => <tr key={feature.name}><th scope="row">{feature.name}</th><td><FeatureValue value={feature.free} /></td><td className="pricing-feature-pro"><FeatureValue value={feature.pro} /></td><td><FeatureValue value={feature.max} /></td></tr>)}</tbody>)}
            </table>
          </div>
          <p className="pricing-features-note">Generous and expanded usage are subject to fair-use limits. Coming-soon features are not included in the current product.</p>
        </div>
      </section>
      <section className="pricing-faq" aria-labelledby="faq-title"><h2 id="faq-title">Frequently asked questions</h2><div>{questions.map(([question, answer]) => <details key={question}><summary>{question}<ChevronDown size={16} aria-hidden="true" /></summary><p>{answer}</p></details>)}</div></section>
      <section className="pricing-final"><div><h2>Ready to get back control of your day?</h2><p>Join professionals who are doing more with Nexdo.</p></div><div><Link className="hs-button" href="/login">Start Your Free Trial <ArrowRight size={20} /></Link><p>No credit card required</p></div><span className="pricing-signature">Less chaos.<br />More progress.<br />That’s Nexdo.</span></section>
    </main><MarketingFooter /></div>;
}
