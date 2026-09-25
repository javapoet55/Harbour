import { Platform, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { brand, useTheme } from '../theme';
import { withAlpha } from './SignInBackdrop';

/** SF Symbol names used by the auth screens, mapped to the closest Ionicons glyph. */
export const fieldIcons = {
  envelope: 'mail-outline',
  lock: 'lock-closed-outline',
  person: 'person-outline',
  'checkmark.shield': 'shield-checkmark-outline',
  'envelope.badge': 'mail-unread-outline',
  number: 'keypad-outline',
} as const;

export type FieldIconName = keyof typeof fieldIcons;

/**
 * Port of `SignInFieldIcon` (ios/App/RootView.swift:821–831):
 *
 *   Image(systemName:).font(.title3.weight(.medium)).foregroundStyle(Color.nexdoIndigo)
 *     .frame(width: 46, height: 46)
 *     .background(Color.nexdoIndigo.opacity(0.08), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
 */
export function SignInFieldIcon({ name, focused = false }: { name: FieldIconName; focused?: boolean }) {
  const theme = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: 46,
        height: 46,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: withAlpha(brand.nexdoIndigo, 0.08),
        // Android (docs/android-polish.md §11): the row being edited borders its tile in the focus
        // accent. The border is always 1 wide, transparent when idle, so focusing does not shift it.
        ...(Platform.OS === 'android' ? { borderWidth: 1, borderColor: focused ? theme.colors.accent : 'transparent' } : null),
      }}
      testID={`field-icon-${name}`}
    >
      {/* .title3 is 20pt; Ionicons has no weight axis, so `.weight(.medium)` is not reproduced. */}
      <Ionicons name={fieldIcons[name]} size={20} color={theme.colors.link} />
    </View>
  );
}
