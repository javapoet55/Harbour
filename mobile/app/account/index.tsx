import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AccountAvatar, AccountMenuRow, ProfileBackground, ProfileCard } from '../../src/components/ProfileParts';
import { TaskSymbol } from '../../src/components/TaskSymbol';
import { Text } from '../../src/components/Text';
import { useSignOut } from '../../src/query/useAuth';
import { useMe } from '../../src/query/useMe';
import { brand, useTheme } from '../../src/theme';
import { withAlpha } from '../../src/components/SignInBackdrop';

/**
 * `AccountView` (ios/App/ProfileView.swift:60), **body `:65-99`**, read top to bottom.
 *
 * Children followed: `ProfileAvatar` (`:39`, body `:48-57`), `ProfileBackground` (`:116-118`),
 * `menuRow(_:_:web:)` (`:104-110`) and `webRow(_:_:_:)` (`:111-114`) — all in
 * `src/components/ProfileParts.tsx` — and `ProfileSettingsView` (`:126`), which is `app/account/settings.tsx`.
 *
 * The five web rows open the PRODUCTION web app in the system browser. Swift hardcodes that origin
 * (`:112`) rather than using the configured API base, and this does the same: those pages exist only
 * on the deployed site, so pointing them at a development server would open nothing.
 */
const WEB_ORIGIN = 'https://harbour-production-f8a0.up.railway.app';

export default function Account() {
  const theme = useTheme();
  const { data: profile } = useMe();
  const signOut = useSignOut();
  const [signingOut, setSigningOut] = useState(false);

  const openWeb = (path: string) => void Linking.openURL(WEB_ORIGIN + path);

  /** `.confirmationDialog("Sign out of Nexdo?", …)` (ProfileView.swift:96-98). */
  const confirmSignOut = () => {
    Alert.alert('Sign out of Nexdo?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => {
          setSigningOut(true);
          // `await model.logout(); if model.profile == nil { dismiss() }` — the session gate in
          // app/_layout.tsx swaps to the auth group on its own, so there is no navigation here.
          signOut.mutate(undefined, { onSettled: () => setSigningOut(false) });
        },
      },
    ]);
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.fill}>
      <ProfileBackground />

      {/* `.navigationTitle("My Page").navigationBarTitleDisplayMode(.inline)` with a trailing Close. */}
      <View style={styles.navBar}>
        <Text accessibilityRole="header" style={[styles.navTitle, styles.grow, { color: theme.colors.ink }]}>
          My Page
        </Text>
        <Pressable
          accessibilityLabel="Close"
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => router.back()}
          testID="account-close"
        >
          <TaskSymbol color={theme.colors.tint} name="xmark" size={20} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* 1. The profile header (ProfileView.swift:68-74). */}
        <View style={styles.header}>
          <AccountAvatar name={profile?.name ?? ''} photo={profile?.photo} size={76} />
          <View style={styles.headerText}>
            <Text style={[styles.title3, { color: theme.colors.ink }]} testID="account-name">
              {profile?.name ?? 'Your profile'}
            </Text>
            <Text style={[styles.caption, { color: theme.colors.secondary }]} testID="account-email">
              {profile?.email ?? ''}
            </Text>
          </View>
        </View>

        {/* 2. The standalone link to Settings (`:75`). */}
        <AccountMenuRow
          icon="person.crop.circle"
          onPress={() => router.push('/account/settings')}
          testID="account-edit-profile"
          title="Edit profile and settings"
        />

        {/* 3. The card of web rows, then Settings again (`:76-83`). */}
        <ProfileCard style={styles.menuCard} testID="account-menu">
          <AccountMenuRow icon="tray" onPress={() => openWeb('/inbox')} testID="account-inbox" title="Inbox" web />
          <AccountMenuRow icon="stopwatch" onPress={() => openWeb('/waiting')} testID="account-waiting" title="Waiting For" web />
          <AccountMenuRow icon="sparkles" onPress={() => openWeb('/planner')} testID="account-planner" title="AI Planner" web />
          <AccountMenuRow icon="chart.bar" onPress={() => openWeb('/insights')} testID="account-insights" title="Insights" web />
          <AccountMenuRow icon="bell" onPress={() => openWeb('/notifications')} testID="account-notifications" title="Notifications" web />
          <AccountMenuRow
            icon="slider.horizontal.3"
            onPress={() => router.push('/account/settings')}
            testID="account-settings"
            title="Settings"
          />
        </ProfileCard>

        {/* 4. Sign out (`:84-86`). */}
        <Pressable
          accessibilityLabel="Sign out"
          accessibilityRole="button"
          accessibilityState={{ disabled: signingOut }}
          disabled={signingOut}
          onPress={confirmSignOut}
          style={[
            styles.signOut,
            { backgroundColor: theme.colors.surface, borderColor: withAlpha(brand.nexdoIndigo, 0.13), opacity: signingOut ? 0.55 : 1 },
          ]}
          testID="account-sign-out"
        >
          <Text style={[theme.typography.body, { color: theme.colors.danger }]}>
            {signingOut ? 'Signing out…' : 'Sign out'}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flex: 1 },
  title3: { fontSize: 20, lineHeight: 25, fontWeight: '700' },
  caption: { fontSize: 12, lineHeight: 16 },

  navBar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 14 },
  navTitle: { fontSize: 17, lineHeight: 22, fontWeight: '600' },

  // `VStack(alignment: .leading, spacing: 18).padding(20)`
  scroll: { padding: 20, gap: 18 },
  // `HStack(spacing: 14) … .padding(.vertical, 8)`
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 8 },
  headerText: { flex: 1, gap: 4 },
  // `VStack(spacing: 0) … .padding(8)`
  menuCard: { padding: 8 },
  // `.frame(maxWidth: .infinity, minHeight: 46)` with corner radius 14.
  signOut: { minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
});
