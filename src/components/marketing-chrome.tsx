import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { NexdoLogo } from './nexdo-logo';

export function MarketingHeader({ pricing = false, product = false }: { pricing?: boolean; product?: boolean }) {
  return <header className="hs-header"><Link href="/welcome" className="hs-brand" aria-label="Nexdo home"><NexdoLogo /></Link><nav aria-label="Main navigation"><details className={`hs-product-menu${product ? ' is-active' : ''}`}><summary>Product <ChevronDown size={15} aria-hidden="true" /></summary><div className="hs-product-menu-panel"><Link href="/features/ai-assistant"><strong>AI Assistant</strong><span>Plan, prioritize, and adapt your day</span></Link></div></details><Link href="/features/ai-assistant#product-features">Features</Link><Link href="/pricing" aria-current={pricing ? 'page' : undefined}>Pricing</Link><Link href="/welcome#questions">Resources</Link></nav><div className="hs-account"><Link href="/login" className="hs-signin">Sign in</Link><Link href="/signup" className="hs-button">Get Started Free</Link></div></header>;
}
export function MarketingFooter() {
  return <footer className="hs-footer hs-wrap"><Link href="/welcome" className="hs-brand"><NexdoLogo /></Link><p>Less chaos. More progress.</p><nav aria-label="Footer navigation"><Link href="/welcome#experience">Product</Link><Link href="/features/ai-assistant#product-features">Features</Link><Link href="/pricing">Pricing</Link><Link href="/login">Sign in</Link></nav></footer>;
}
