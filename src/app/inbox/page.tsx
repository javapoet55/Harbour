'use client';

import { Authed } from '@/components/authed';
import { TaskBrowser } from '@/components/task-browser';

export default function InboxPage() {
  return (
    <Authed>
      <h1 className="mb-4 text-3xl font-semibold">Inbox</h1>
      <TaskBrowser filter={(task) => task.status === 'INBOX' || !task.startAt} />
    </Authed>
  );
}
