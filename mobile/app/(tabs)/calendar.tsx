import { Card, Screen, Text } from '../../src/components';

// Placeholder. Calendar is Phase 5.
export default function Calendar() {
  return (
    <Screen edges={['top', 'left', 'right']}>
      <Text variant="display">Calendar</Text>
      <Card>
        <Text tone="secondary">Placeholder screen (Phase 5).</Text>
      </Card>
    </Screen>
  );
}
