import { Authed } from '@/components/authed';
import { TasksScreen } from '@/components/tasks-screen';

export default function TasksPage() {
  return (
    <Authed>
      <TasksScreen />
    </Authed>
  );
}
