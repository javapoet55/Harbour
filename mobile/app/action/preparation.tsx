import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { useCoordinator } from '../../src/actions/coordinator';
import { FollowUpPreparationScreen } from '../../src/features/followUp/FollowUpPreparationScreen';
import { makeTaskAction } from '../../src/lib/taskAction';
import { detectTaskAction } from '../../src/lib/taskActionDetector';
import { parseServerDate } from '../../src/lib/taskQuery';
import { useTasks } from '../../src/query/useTasks';
import { useSession } from '../../src/store/session';

/**
 * `.sheet { FollowUpPreparationView(task:action:initialContact:saved:) }` (TaskActionView.swift:273-280,
 * :37-41; 6f079c0). From the Nexdo Action screen it edits that action's preparation; from a completed
 * task's Task Details there is no action any more, so one is made from the title, as Swift's
 * `TaskAction(taskId:title:detection:scheduledAt:)` does, and only the saved outcomes matter.
 */
export default function FollowUpPreparationRoute() {
  const params = useLocalSearchParams<{ taskId: string; actionId?: string; name?: string; phone?: string; email?: string }>();
  const tasks = useTasks();
  const zone = useSession((state) => state.profile?.timeZone) ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const stored = useCoordinator((state) => state.actions.find((item) => item.id === params.actionId));
  const task = tasks.data?.tasks.find((item) => item.id === params.taskId);
  // The detector's clock, read once per opening.
  const [openedAt] = useState(() => Date.now());
  if (!task) return null;
  const detection = stored ? null : detectTaskAction(task.title, openedAt, zone);
  const action =
    stored ??
    (detection
      ? makeTaskAction({ id: `history-${task.id}`, taskId: task.id, title: task.title, detection, scheduledAt: parseServerDate(task.startAt ?? null) })
      : null);
  if (!action) return null;
  const initialContact = params.name ? { name: params.name, phone: params.phone ?? '', email: params.email ?? '' } : null;
  return (
    <FollowUpPreparationScreen
      action={action}
      initialContact={initialContact}
      onClose={() => router.back()}
      onSaved={(preparation) => {
        if (stored) useCoordinator.getState().update(stored.id, (item) => ({ ...item, preparation }));
      }}
      task={task}
      zone={zone}
    />
  );
}
