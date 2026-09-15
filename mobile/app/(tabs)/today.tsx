import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';

import { endpoints } from '../../src/api';
import { Button, Card, Screen, Text } from '../../src/components';
import { queryKeys } from '../../src/query/keys';
import { useSession } from '../../src/store/session';

// Placeholder. Today is Phase 4.
export default function Today() {
  const profile = useSession((state) => state.profile);
  const queryClient = useQueryClient();
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async () => {
    setSigningOut(true);
    try {
      await endpoints.logout();
    } finally {
      setSigningOut(false);
      await queryClient.invalidateQueries({ queryKey: queryKeys.me() });
    }
  };

  return (
    <Screen edges={['top', 'left', 'right']}>
      <Text variant="display">Today</Text>
      <Card style={{ gap: 8 }}>
        <Text variant="title">{profile ? `Signed in as ${profile.name}` : 'Signed in'}</Text>
        <Text tone="secondary">{profile?.email}</Text>
        <Text variant="caption" tone="secondary">
          Placeholder screen (Phase 4).
        </Text>
      </Card>
      <Button title="Open session check" variant="secondary" onPress={() => router.push('/dev/session-check')} />
      {/* Signed-in people land here, not on the sign-in placeholder. */}
      <Button title="Open voice check" variant="secondary" onPress={() => router.push('/dev/voice-check')} />
      <Button title="Sign out" variant="ghost" loading={signingOut} onPress={signOut} />
    </Screen>
  );
}
