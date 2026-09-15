import { router } from 'expo-router';

import { Button, Card, Screen, Text } from '../../src/components';

// Placeholder. The real sign-in screen is Phase 2.
export default function SignIn() {
  return (
    <Screen>
      <Text variant="display">Nexdo</Text>
      <Card style={{ gap: 12 }}>
        <Text variant="title">Sign in</Text>
        <Text tone="secondary">The sign-in screen arrives in Phase 2. Use the session check to sign in for now.</Text>
        <Button title="Open session check" onPress={() => router.push('/dev/session-check')} />
      </Card>
    </Screen>
  );
}
