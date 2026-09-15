import { Card, Screen, Text } from '../../src/components';

// Placeholder. Ask AI (text) is Phase 6, and becomes a sheet then.
export default function Ask() {
  return (
    <Screen edges={['top', 'left', 'right']}>
      <Text variant="display">Ask AI</Text>
      <Card>
        <Text tone="secondary">Placeholder screen (Phase 6).</Text>
      </Card>
    </Screen>
  );
}
