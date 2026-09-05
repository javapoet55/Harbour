import type { Metadata } from 'next';
import { HarbourLanding } from '@/components/harbour-landing';
import './welcome.css';

export const metadata: Metadata = {
  title: 'Harbour — A little less juggling. A little more living.',
  description: 'An AI-powered to-do app that brings tasks, calendars, and conversation together. Find your focus, plan around real life, and approve changes before they happen.',
};

export default function WelcomePage() { return <HarbourLanding />; }
