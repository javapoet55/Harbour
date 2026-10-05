import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '../theme';
import { TaskSymbol } from './TaskSymbol';
import { Text } from './Text';

/**
 * `.navigationTitle(title).navigationBarTitleDisplayMode(.inline)` on a screen PUSHED inside the Account
 * sheet's `NavigationStack` (Help, Feedback, Change password): the back chevron in the tint, the title
 * centred. `backHidden` is `.navigationBarBackButtonHidden(saving)`.
 */
export function InlineNavBar({ title, onBack, backHidden = false, testID }: { title: string; onBack: () => void; backHidden?: boolean; testID?: string }) {
  const theme = useTheme();
  return (
    <View style={styles.bar} testID={testID}>
      <View style={styles.side}>
        {backHidden ? null : (
          <Pressable accessibilityLabel="Back" accessibilityRole="button" hitSlop={8} onPress={onBack} style={styles.back} testID={testID ? `${testID}-back` : 'nav-back'}>
            <TaskSymbol color={theme.colors.link} name="chevron.backward" size={22} />
          </Pressable>
        )}
      </View>
      <Text accessibilityRole="header" numberOfLines={1} style={[styles.title, { color: theme.colors.ink }]}>
        {title}
      </Text>
      <View style={styles.side} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, minHeight: 50 },
  side: { width: 44 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center', fontSize: 17, lineHeight: 22, fontWeight: '600' },
});
