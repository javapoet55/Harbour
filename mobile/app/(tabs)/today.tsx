import { router } from 'expo-router';

import { Button, Card, Screen, Text } from '../../src/components';
import { useSignOut } from '../../src/query/useAuth';
import { useSession } from '../../src/store/session';

// Placeholder. Today is Phase 4.
export default function Today() {
  const profile = useSession((state) => state.profile);
  const signOut = useSignOut();

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
      {/* Signed-in people land here, not on the sign-in screen. */}
      <Button title="Open voice check" variant="secondary" onPress={() => router.push('/dev/voice-check')} />
      {/* Temporary: Phase 7 moves sign-out to the Account screen. */}
      <Button title="Sign out" variant="ghost" loading={signOut.isPending} onPress={() => signOut.mutate()} testID="sign-out" />
    </Screen>
  );
}
