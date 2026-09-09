import type { Metadata } from 'next';
import { AiAssistantPage } from '@/components/ai-assistant-page';
import '../../welcome/welcome.css';
import './ai-assistant.css';

export const metadata: Metadata = {
  title: 'Nexdo AI Assistant — Know what to do next',
  description: 'Plan, prioritize, repair your schedule, and hear concise briefings with an AI executive companion grounded in your tasks and calendar.',
};

export default function AssistantFeaturePage() {
  return <AiAssistantPage />;
}
