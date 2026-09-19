import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { ManageMomentView } from '../../src/features/moments/ManageMomentView';
import type { MomentDisplayGroup } from '../../src/features/moments/domain';
import { momentsStore } from '../../src/features/moments/store';

/**
 * Manage Moment for a group of recipients (`ManageFestivalView(group:store:onDone:)`,
 * ios/App/ManageFestivalView.swift:67). Swift hands the view the group it was opened with and never
 * re-reads it, so the ids are resolved once, here.
 *
 * Every Swift entry point passes an `onDone` that returns to Important Moments (the list's
 * `managingFestival = nil`, Manage Moments' `managingMoments = false`, the notification's
 * `showingDetail = false`), so Done does the same.
 */
export default function ManageMomentScreen() {
  const { ids } = useLocalSearchParams<{ ids?: string }>();
  const [group] = useState<MomentDisplayGroup | null>(() => {
    const wanted = (ids ?? '').split(',').filter(Boolean);
    const moments = momentsStore.getState().snapshot?.moments ?? [];
    const found = wanted.map((id) => moments.find((moment) => moment.id === id)).filter((moment) => moment !== undefined);
    return found.length > 0 ? { id: wanted.join(','), moments: found } : null;
  });
  if (!group) {
    return (
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }
  return <ManageMomentView group={group} onDone={() => router.dismissTo('/moments')} />;
}
