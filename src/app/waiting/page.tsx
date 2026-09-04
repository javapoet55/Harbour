import { Authed } from '@/components/authed';
import { TaskBrowser } from '@/components/task-browser';

export default function WaitingPage() {
  return (
    <Authed>
      <h1 className="mb-4 text-3xl font-semibold">Waiting For</h1>
      <TaskBrowser view="waiting" />
    </Authed>
  );
}
