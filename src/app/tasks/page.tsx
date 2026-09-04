import { Authed } from '@/components/authed';
import { TaskBrowser } from '@/components/task-browser';

export default function TasksPage() {
  return (
    <Authed>
      <h1 className="mb-4 text-3xl font-semibold">Tasks</h1>
      <TaskBrowser view="open" />
    </Authed>
  );
}
