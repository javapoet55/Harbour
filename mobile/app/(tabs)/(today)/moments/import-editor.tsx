import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import type { MomentInput } from '../../../../src/api/moments';
import { Text } from '../../../../src/components/Text';
import { MomentEditorView } from '../../../../src/features/moments/MomentEditorView';
import { useTheme } from '../../../../src/theme';

/**
 * The picked-contact editor Moments Settings presents as a `.sheet`, with a "Close" toolbar button
 * (MomentEditor.swift:242). It has no `onDone`, so Done on its Manage Moment dismisses the sheet.
 */
export default function ImportEditorScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ imported?: string }>();
  const [imported] = useState<MomentInput | undefined>(() => {
    try {
      return params.imported ? (JSON.parse(params.imported) as MomentInput) : undefined;
    } catch {
      return undefined;
    }
  });
  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          headerLeft: () => (
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.back()} hitSlop={8} testID="import-close">
              <Text style={{ fontSize: 17, lineHeight: 22, color: theme.colors.link }}>Close</Text>
            </Pressable>
          ),
        }}
      />
      <MomentEditorView imported={imported} dismiss={() => router.back()} />
    </View>
  );
}
