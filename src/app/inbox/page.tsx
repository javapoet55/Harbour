'use client';

import { Authed } from '@/components/authed';
import { Inbox } from 'lucide-react';
import { TaskBrowser } from '@/components/task-browser';

export default function InboxPage() {
  return (
    <Authed>
      <section className="inbox-page" aria-labelledby="inbox-heading">
        <header className="inbox-heading">
          <span className="inbox-icon"><Inbox size={28} aria-hidden="true" /></span>
          <h1 id="inbox-heading">Inbox</h1>
          <p>A little space to collect your tasks and plan what’s next.</p>
        </header>
        <TaskBrowser view="inbox" />
      </section>
    </Authed>
  );
}
