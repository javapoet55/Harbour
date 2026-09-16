import { LinearGradient } from 'expo-linear-gradient';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { firstName } from '../store/lastSignedIn';
import { brand, useTheme } from '../theme';
import { NEXDO_GRADIENT } from './TodayShell';
import { withAlpha } from './SignInBackdrop';
import { TaskSymbol, type TaskSymbolName } from './TaskSymbol';
import { Text } from './Text';

/**
 * The shared pieces of `AccountView` and `ProfileSettingsView` (ios/App/ProfileView.swift):
 * `ProfileAvatar` (`:39-58`, body `:48-57`), `ProfileBackground` (`:116-118`) and
 * `menuRow(_:_:web:)` (`:104-110`).
 */

/**
 * `ProfileAvatar` (ProfileView.swift:39-58) at any size.
 *
 * Swift draws the stored photo when there is one and the first letter of the first name otherwise,
 * both inside a gradient circle with a 2pt white ring. The photo is a `data:image/jpeg;base64,…` URL,
 * which `Image` renders directly — Swift decodes the same string by hand (`:43-46`).
 */
export function AccountAvatar({ name, photo, size = 76 }: { name: string; photo?: string | null; size?: number }) {
  // `ProfileName.firstName(from: name)?.prefix(1).uppercased() ?? "U"`.
  const initial = firstName(name)?.charAt(0).toUpperCase() ?? 'U';
  return (
    <View accessibilityLabel="Profile picture" style={[styles.avatarRing, { width: size, height: size, borderRadius: size / 2 }]}>
      <LinearGradient
        colors={[...NEXDO_GRADIENT]}
        end={{ x: 1, y: 0.5 }}
        start={{ x: 0, y: 0.5 }}
        style={[styles.avatarFill, { borderRadius: size / 2 }]}
      >
        {photo ? (
          <Image resizeMode="cover" source={{ uri: photo }} style={[styles.avatarFill, { borderRadius: size / 2 }]} testID="account-photo" />
        ) : (
          <Text style={{ fontSize: size * 0.4, fontWeight: '700', color: '#FFFFFF' }}>{initial}</Text>
        )}
      </LinearGradient>
    </View>
  );
}

/** `ProfileBackground` (ProfileView.swift:116-118). */
export function ProfileBackground() {
  const theme = useTheme();
  return (
    <LinearGradient
      colors={[withAlpha(brand.nexdoBlue, 0.09), withAlpha(brand.nexdoMagenta, 0.06), theme.colors.background]}
      end={{ x: 1, y: 1 }}
      pointerEvents="none"
      start={{ x: 0, y: 0 }}
      style={StyleSheet.absoluteFill}
    />
  );
}

/**
 * `menuRow(_:_:web:)` (ProfileView.swift:104-110). `web` swaps the trailing chevron for the
 * "opens elsewhere" arrow; `webRow` (`:111-114`) adds the accessibility hint.
 */
export function AccountMenuRow({
  title,
  icon,
  web = false,
  onPress,
  testID,
}: {
  title: string;
  icon: TaskSymbolName;
  web?: boolean;
  onPress: () => void;
  testID: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityHint={web ? 'Opens Nexdo in your browser' : undefined}
      accessibilityLabel={title}
      accessibilityRole="button"
      onPress={onPress}
      style={styles.menuRow}
      testID={testID}
    >
      <View style={styles.menuIcon}>
        <TaskSymbol color={brand.nexdoIndigo} name={icon} size={20} />
      </View>
      <Text style={[theme.typography.body, styles.grow, { color: theme.colors.ink }]}>{title}</Text>
      <TaskSymbol color={theme.colors.secondary} name={web ? 'arrow.up.right' : 'chevron.right'} size={13} />
    </Pressable>
  );
}

/** `profileCard()` (ProfileView.swift:119-123). */
export function ProfileCard({ children, style, testID }: { children: React.ReactNode; style?: object; testID?: string }) {
  const theme = useTheme();
  return (
    <View
      style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: withAlpha(brand.nexdoIndigo, 0.13) }, style]}
      testID={testID}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  // `.overlay(Circle().stroke(.white, lineWidth: 2))`
  avatarRing: { borderWidth: 2, borderColor: '#FFFFFF', overflow: 'hidden' },
  avatarFill: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  // `.padding(.horizontal, 12).frame(minHeight: 50)`
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 12, minHeight: 50 },
  // `Image(systemName:).frame(width: 24)`
  menuIcon: { width: 24, alignItems: 'center' },
  card: { borderRadius: 20, borderWidth: StyleSheet.hairlineWidth },
});
