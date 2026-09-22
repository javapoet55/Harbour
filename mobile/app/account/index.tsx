import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AccountAvatar, AccountMenuRow, ProfileBackground, ProfileCard } from '../../src/components/ProfileParts';
import { TaskSymbol } from '../../src/components/TaskSymbol';
import { Text } from '../../src/components/Text';
import { VoiceUsageCard } from '../../src/features/account/VoiceUsageCard';
import { useSignOut } from '../../src/query/useAuth';
import { useMe } from '../../src/query/useMe';
import { useVoiceUsage } from '../../src/query/useVoiceUsage';
import { ElevatedSurface, useTheme } from '../../src/theme';

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
const WEB_ORIGIN = 'https://app.nexdoapp.com';

/**
 * `AccountView` is a `.sheet` from both entry points (RootView.swift:1181, `:1702`), so everything below resolves the *elevated* system backgrounds.
 *
 * The provider has to sit above the body rather than inside it: `useTheme({ elevated: true })`
 * only colours the screen's own styles, and a shared component further down — `ProfileCard`,
 * `AccountAvatar`, the settings controls — has no way to know it is in a sheet. In dark mode
 * that painted the card `#1C1C1E` on a `#1C1C1E` sheet, so it stopped reading as a card.
 */
export default function Account() {
  return (
    <ElevatedSurface>
      <AccountSheet />
    </ElevatedSurface>
  );
}

function AccountSheet() {
  // `AccountView` is a `.sheet` from both entry points (RootView.swift:1181, :1702); iOS resolves
  // the system backgrounds one level up inside a sheet (style map section 3).
  const theme = useTheme({ elevated: true });
  const { data: profile } = useMe();
  // `.task { await model.refreshVoiceUsage() }` (ProfileView.swift:97): asked every time Account opens.
  const { data: voiceUsage } = useVoiceUsage();
  const signOut = useSignOut();
  const [signingOut, setSigningOut] = useState(false);

  const openWeb = (path: string) => void Linking.openURL(WEB_ORIGIN + path);

  /** `dismiss()` (ProfileView.swift:71, `:99`): close the sheet, back to whichever tab presented it. */
  const dismiss = () => router.back();

  /** `.confirmationDialog("Sign out of Nexdo?", …)` (ProfileView.swift:96-98). */
  const confirmSignOut = () => {
    Alert.alert('Sign out of Nexdo?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => {
          setSigningOut(true);
          // `await model.logout(); if model.profile == nil { dismiss() }` (ProfileView.swift:99) —
          // same two steps, ORDER REVERSED. SwiftUI's sheet outlives the logout, so Swift can
          // dismiss afterwards; here the session gate in app/_layout.tsx unmounts the navigator
          // that owns this modal the moment the store flips to `signedOut`, and a dismissal with no
          // navigator left to receive it is the "GO_BACK was not handled by any navigator" warning
          // — with the sheet still on screen over the sign-in view. Closing FIRST leaves the gate a
          // plain screen swap to make, and the sign-in screen is what remains behind the sheet.
          dismiss();
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
        {/* An `.inline` title is centred; React Navigation left-aligns on Android. */}
        <View style={styles.navSide} />
        <Text accessibilityRole="header" style={[styles.navTitle, styles.grow, styles.centred, { color: theme.colors.ink }]}>
          My Page
        </Text>
        {/* iOS 26 draws a bar button inside a glass capsule, which `account-default.png` shows
            plainly as a white circle around the X. The style map lists the capsule as unclosed;
            this is the nearest thing a plain Pressable can be. */}
        <View style={styles.navSide}>
          <Pressable
            accessibilityLabel="Close"
            accessibilityRole="button"
            hitSlop={8}
            onPress={dismiss}
            style={[styles.closeCapsule, { backgroundColor: theme.colors.background }]}
            testID="account-close"
          >
            <TaskSymbol color={theme.colors.tint} name="xmark" size={20} />
          </Pressable>
        </View>
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

        {/* 2. The Real-time Voice card (`:77`, card `:101-132`). */}
        <VoiceUsageCard usage={voiceUsage} />

        {/* 3. The standalone link to Settings (`:78`). */}
        <AccountMenuRow
          icon="person.crop.circle"
          onPress={() => router.push('/account/settings')}
          testID="account-edit-profile"
          title="Edit profile and settings"
        />

        {/* 4. The card of web rows, then Settings again (`:79-86`). */}
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

        {/* 5. Sign out (`:87-89`). */}
        <Pressable
          accessibilityLabel="Sign out"
          accessibilityRole="button"
          accessibilityState={{ disabled: signingOut }}
          disabled={signingOut}
          onPress={confirmSignOut}
          // `.background(.background, in: RoundedRectangle(cornerRadius: 14))` (ProfileView.swift:85)
          // draws a fill and no stroke, and the label never changes.
          style={[styles.signOut, { backgroundColor: theme.colors.background, opacity: signingOut ? 0.55 : 1 }]}
          testID="account-sign-out"
        >
          <Text style={[theme.typography.body, { color: theme.colors.danger }]}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flex: 1 },
  // `.title3` is 20/28; 25 is `fontSize * 1.2`, which is the rule for `.system(size:)` only.
  title3: { fontSize: 20, lineHeight: 28, fontWeight: '700' },
  caption: { fontSize: 12, lineHeight: 16 },
  centred: { textAlign: 'center' },

  navBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14 },
  navSide: { width: 44, alignItems: 'flex-end' },
  navTitle: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  closeCapsule: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },

  // `VStack(alignment: .leading, spacing: 18).padding(20)`
  scroll: { padding: 20, gap: 18 },
  // `HStack(spacing: 14) … .padding(.vertical, 8)`
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 8 },
  headerText: { flex: 1, gap: 4 },
  // `VStack(spacing: 0) … .padding(8)`
  menuCard: { padding: 8 },
  // `.frame(maxWidth: .infinity, minHeight: 46)` with corner radius 14.
  signOut: { minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
});
