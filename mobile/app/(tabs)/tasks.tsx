import { Card, ErrorView, LoadingView, Screen, Text } from '../../src/components';
import { useTasks } from '../../src/query/useTasks';

// Placeholder. Tasks is Phase 3.
export default function Tasks() {
  const tasks = useTasks();
  if (tasks.isPending) return <LoadingView message="Loading tasks" />;
  if (tasks.isError) return <ErrorView error={tasks.error} onRetry={() => tasks.refetch()} retrying={tasks.isFetching} />;

  const count = tasks.data.tasks.length;
  return (
    <Screen edges={['top', 'left', 'right']}>
      <Text variant="display">Tasks</Text>
      <Card style={{ gap: 8 }}>
        <Text variant="title">
          {count} {count === 1 ? 'task' : 'tasks'}
        </Text>
        <Text variant="caption" tone="secondary">
          Placeholder screen (Phase 3). Count from GET /api/tasks.
        </Text>
      </Card>
    </Screen>
  );
}
