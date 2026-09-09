import type { Metadata } from 'next';
import { Pricing } from '@/components/pricing';
import '../welcome/welcome.css';
import './pricing.css';
export const metadata: Metadata = { title: 'Nexdo Pricing — Choose your plan', description: 'Compare Free, Nexdo Pro, and Nexdo Max with monthly and annual pricing.' };
export default function PricingPage() { return <Pricing />; }
