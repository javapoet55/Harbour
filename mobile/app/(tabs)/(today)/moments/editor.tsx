import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import type { MomentInput } from '../../../../src/api/moments';
import { MomentEditorView } from '../../../../src/features/moments/MomentEditorView';
import { momentsStore } from '../../../../src/features/moments/store';

/**
 * Create / Edit Moment, pushed (ImportantMomentsView.swift:295, :115; ManageFestivalView.swift:23;
 * the calendar and festival imports, MomentEditor.swift:304, :318).
 *
 * `id` edits a saved moment; `imported` is an import's `MomentInput` as JSON; `done=list` is the
 * `onDone` "Create New" and "Add Moment" pass, which returns to Important Moments.
 */
export default function MomentEditorScreen() {
  const params = useLocalSearchParams<{ id?: string; imported?: string; done?: string }>();
  const [moment] = useState(() => (params.id ? momentsStore.getState().snapshot?.moments.find((item) => item.id === params.id) : undefined));
  const [imported] = useState<MomentInput | undefined>(() => {
    if (!params.imported) return undefined;
    try {
      return JSON.parse(params.imported) as MomentInput;
    } catch {
      return undefined;
    }
  });
  return (
    <MomentEditorView
      moment={moment}
      imported={imported}
      onDone={params.done === 'list' ? () => router.dismissTo('/moments') : undefined}
      dismiss={() => router.back()}
    />
  );
}
