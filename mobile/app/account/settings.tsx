import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { NextActionPreference, Profile, ProfilePreferences } from '../../src/api';
import { AccountAvatar, ProfileBackground } from '../../src/components/ProfileParts';
import {
  SettingsCaption,
  SettingsCard,
  SettingsDivider,
  SettingsField,
  SettingsHours,
  SettingsLabeledValue,
  SettingsPicker,
  SettingsSegments,
  SettingsSlider,
  SettingsToggle,
} from '../../src/components/SettingsControls';
import { TaskSymbol } from '../../src/components/TaskSymbol';
import { Text } from '../../src/components/Text';
import { PHOTO_INVALID } from '../../src/lib/profilePhoto';
import {
  APPEARANCES,
  CONFIRMATION_LEVELS,
  deviceTimeZone,
  SWITCHING_THRESHOLDS,
  timeZoneLabel,
  validateSettings,
} from '../../src/lib/profileSettings';
import { encodeProfilePhoto } from '../../src/photo/encodePhoto';
import { useConnectGoogleCalendar } from '../../src/query/useCalendar';
import { useMe } from '../../src/query/useMe';
import { useDeleteAccount, useSyncNow, useUpdateProfile, useUploadPhoto } from '../../src/query/useProfile';
import { useAppearance } from '../../src/store/appearance';
import { useConsent } from '../../src/store/consent';
import { brand, ElevatedSurface, useTheme } from '../../src/theme';

/**
 * `ProfileSettingsView` (ios/App/ProfileView.swift:126), **body `:146-270`**, read top to bottom.
 *
 * Children followed: `ProfileAvatar` (`:39`) and `ProfileBackground` (`:116`) in
 * `src/components/ProfileParts.tsx`; the private `card(_:content:)` (`:274`), `field(_:text:)`
 * (`:277`), `hours(_:start:end:)` (`:293`) and the SwiftUI `Picker`/`Toggle`/`Slider` in
 * `src/components/SettingsControls.tsx`; `CalendarOAuthCoordinator` (`:6-36`) in
 * `src/query/useCalendar.ts`; `ProfilePhotoEncoder` (ios/App/ProfilePhotoEncoder.swift) in
 * `src/lib/profilePhoto.ts` and `src/photo/encodePhoto.ts`.
 *
 * NOT IN `body`, and so not built — the brief asked after each of these:
 * - no email field. Only `name` is editable (`:194`).
 * - no default duration and no default reminder minutes. Both exist in the server's preference
 *   schema, but no control in `body` touches them and `ProfilePreferences`
 *   (ios/Sources/NexdoCore/ProfileSettings.swift:3-17) does not even decode them.
 * - no SMS toggle and no phone-number field, although `smsEnabled` and `phoneNumber` are decoded.
 *   `settingsInput()` still normalises the stored phone number on every save (`:343-350`), which is
 *   ported in `validateSettings`.
 * - no app version, no legal links, no photo crop, and no working-hours sheet.
 *
 * SAVING IS NOT PER CONTROL. Every control edits local state; only "Save settings" and the back
 * chevron PATCH, both through `settingsInput()`. Appearance and App Voice volume are the exceptions —
 * they are `@AppStorage` (`:127-128`), device-local, and apply the moment they change.
 */
/**
 * `ProfileSettingsView` is pushed inside the account `.sheet`, so it is elevated too, so everything below resolves the *elevated* system backgrounds.
 *
 * The provider has to sit above the body rather than inside it: `useTheme({ elevated: true })`
 * only colours the screen's own styles, and a shared component further down — `ProfileCard`,
 * `AccountAvatar`, the settings controls — has no way to know it is in a sheet. In dark mode
 * that painted the card `#1C1C1E` on a `#1C1C1E` sheet, so it stopped reading as a card.
 */
export default function Settings() {
  return (
    <ElevatedSurface>
      <SettingsBody />
    </ElevatedSurface>
  );
}

function SettingsBody() {
  const me = useMe();
  // `load()` (ProfileView.swift:297-309) seeds `name`, `preferences` and `next` from the profile
  // BEFORE the editable screen appears. Remounting on the profile's id does the same without a
  // seeding effect, which is the fix Phase 3 used for the project editor: an effect that writes state
  // on its first run is both a cascading render and a window where the form is blank.
  return <SettingsScreen key={me.data?.id ?? 'loading'} loading={me.isLoading} onRetry={() => void me.refetch()} profile={me.data ?? null} />;
}

function SettingsScreen({
  profile,
  loading,
  onRetry,
}: {
  profile: Profile | null;
  loading: boolean;
  onRetry: () => void;
}) {
  // Pushed inside the account `.sheet`, so it takes the elevated palette too (style map section 3).
  const theme = useTheme({ elevated: true });
  const consent = useConsent();
  const appearance = useAppearance();

  const update = useUpdateProfile();
  const uploadPhoto = useUploadPhoto();
  const syncNow = useSyncNow();
  const connect = useConnectGoogleCalendar();
  const deleteAccount = useDeleteAccount();

  // `@State private var name/preferences/next` (ProfileView.swift:132-134).
  const [name, setName] = useState(() => profile?.name ?? '');
  const [preferences, setPreferences] = useState<ProfilePreferences | null>(() => profile?.preference ?? null);
  const [next, setNext] = useState<NextActionPreference>(() => profile?.nextAction ?? { enabled: false, switchingThreshold: 10 });
  const [message, setMessage] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [photoMessage, setPhotoMessage] = useState<string | null>(null);

  const saving = update.isPending || uploadPhoto.isPending || syncNow.isPending || connect.isPending || deleteAccount.isPending;
  const savingPhoto = uploadPhoto.isPending;
  const zone = deviceTimeZone();

  // `.alert("Could not update profile", isPresented:)` (`:257-259`).
  useEffect(() => {
    if (failure === null) return;
    Alert.alert('Could not update profile', failure, [{ text: 'OK', style: 'cancel', onPress: () => setFailure(null) }]);
  }, [failure]);

  const patch = (changes: Partial<ProfilePreferences>) =>
    setPreferences((current) => (current ? { ...current, ...changes } : current));

  /** `run(_:)` (ProfileView.swift:310-313): clear both banners, run, report a failure. */
  const run = async (operation: () => Promise<string | null>) => {
    if (saving) return;
    setFailure(null);
    setMessage(null);
    try {
      const result = await operation();
      if (result !== null) setMessage(result);
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : String(cause));
    }
  };

  /** `settingsInput()` + `save()` (`:314-320`, `:339-356`). */
  const buildInput = () => {
    if (!preferences) return null;
    const result = validateSettings({ name, preferences, nextAction: next, deviceTimeZone: zone });
    if (!result.ok) {
      setFailure(result.failure);
      return null;
    }
    // Swift writes the normalised phone number back into its own state (`:349`).
    setPreferences(result.input.preference);
    return result.input;
  };

  const save = async () => {
    const input = buildInput();
    if (input === null) return;
    await run(async () => {
      await update.mutateAsync(input);
      return 'Settings saved.';
    });
  };

  /** `saveAndDismiss()` (`:322-337`): the back chevron saves first, and only then goes back. */
  const saveAndDismiss = async () => {
    const input = buildInput();
    if (input === null) return;
    setFailure(null);
    try {
      await update.mutateAsync(input);
      router.back();
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : String(cause));
    }
  };

  /** `.onChange(of: selectedPhoto)` (`:261-271`) behind `PhotosPicker(matching: .images)` (`:181`). */
  const changePhoto = async () => {
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (picked.canceled || !picked.assets[0]) return;
    const asset = picked.assets[0];
    setPhotoMessage(null);
    await run(async () => {
      const encoded = await encodeProfilePhoto(asset.uri, asset.width, asset.height).catch(() => {
        throw new Error(PHOTO_INVALID);
      });
      await uploadPhoto.mutateAsync(encoded);
      setPhotoMessage('Profile picture saved.');
      return null;
    });
  };

  /** `Button("Remove photo", role: .destructive)` (`:183`). */
  const removePhoto = () =>
    run(async () => {
      await uploadPhoto.mutateAsync(null);
      return 'Profile picture removed.';
    });

  /** `.confirmationDialog("Permanently delete this account?", …)` (`:267-269`). */
  const confirmDelete = () =>
    Alert.alert(
      'Permanently delete this account?',
      'This removes your Nexdo data permanently and cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete account', style: 'destructive', onPress: () => void deleteAccount.mutateAsync().catch(() => undefined) },
      ],
    );

  const openWeb = (path: string) => void Linking.openURL('https://harbour-production-f8a0.up.railway.app' + path);

  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.fill}>
      <ProfileBackground />

      {/* `.navigationTitle("Settings").navigationBarTitleDisplayMode(.large)` with a leading chevron
          that SAVES first (`:248-256`), and `.navigationBarBackButtonHidden(true)`. */}
      <View style={styles.navBar}>
        <Pressable
          accessibilityLabel="Save settings and go back"
          accessibilityRole="button"
          accessibilityState={{ disabled: loading || saving }}
          disabled={loading || saving}
          hitSlop={8}
          onPress={() => void saveAndDismiss()}
          style={{ opacity: loading || saving ? 0.25 : 1 }}
          testID="settings-back"
        >
          {/* `Image(systemName: "chevron.backward")` with no `.font` is `.body` (ProfileView.swift:251). */}
          <TaskSymbol color={theme.colors.tint} name="chevron.backward" size={17} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text accessibilityRole="header" style={[styles.largeTitle, { color: theme.colors.ink }]}>
          Settings
        </Text>

        {/* 1. Appearance (ProfileView.swift:148-157). */}
        <SettingsCard testID="settings-appearance" title="Appearance">
          <SettingsSegments
            label="Appearance"
            onChange={(value) => void appearance.setAppearance(value)}
            options={APPEARANCES}
            testIDPrefix="appearance"
            value={appearance.appearance}
          />
          <SettingsCaption>
            Day uses a light view. Night uses a dark view. System follows your iPhone. Changes apply immediately and are
            saved on this device.
          </SettingsCaption>
        </SettingsCard>

        {/* 2. App Voice (`:158-175`). */}
        <SettingsCard testID="settings-app-voice" title="App Voice">
          <View style={styles.row}>
            {/* A `Label` with no `.foregroundStyle` is `Color.primary` — `.label`, not nexdoInk. */}
            <TaskSymbol color={theme.colors.label} name="speaker.wave.2" size={17} />
            <Text style={[theme.typography.body, styles.grow, { color: theme.colors.label }]}>AI speaking volume</Text>
            {/* `.monospacedDigit()` (ProfileView.swift:163) so the percentage does not jitter. */}
            <Text style={[theme.typography.body, styles.tabular, { color: theme.colors.secondary }]} testID="voice-volume-value">
              {`${Math.round(appearance.voiceVolume * 100)}%`}
            </Text>
          </View>
          <SettingsSlider
            label="AI speaking volume"
            onChange={(value) => void appearance.setVoiceVolume(value)}
            step={0.05}
            testID="voice-volume"
            value={appearance.voiceVolume}
          />
          <SettingsCaption>
            Adjusts Nexdo’s spoken responses immediately. This setting is saved on this device.
          </SettingsCaption>
        </SettingsCard>

        {/* 3. Profile picture (`:176-190`). */}
        <SettingsCard testID="settings-photo" title="Profile picture">
          <View style={styles.photoRow}>
            <AccountAvatar name={name} photo={profile?.photo} size={76} />
            <View style={styles.photoActions}>
              <Pressable
                accessibilityLabel="Change photo"
                accessibilityRole="button"
                accessibilityState={{ disabled: loading || saving }}
                disabled={loading || saving}
                onPress={() => void changePhoto()}
                style={styles.photoButton}
                testID="settings-change-photo"
              >
                <TaskSymbol color={theme.colors.tint} name="photo" size={17} />
                <Text style={[theme.typography.body, { color: theme.colors.tint }]}>Change photo</Text>
              </Pressable>
              {profile?.photo ? (
                <Pressable
                  accessibilityLabel="Remove photo"
                  accessibilityRole="button"
                  onPress={() => void removePhoto()}
                  style={styles.photoButton}
                  testID="settings-remove-photo"
                >
                  <Text style={[theme.typography.body, { color: theme.colors.danger }]}>Remove photo</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
          <SettingsCaption>Choose a photo from your library. Your picture is saved to your Nexdo account.</SettingsCaption>
          {savingPhoto ? (
            // `ProgressView("Saving profile photo…")` puts its label under the spinner.
            <View style={styles.centred}>
              <ActivityIndicator color={theme.colors.tint} size="small" />
              <Text style={[theme.typography.body, { color: theme.colors.secondary }]}>Saving profile photo…</Text>
            </View>
          ) : null}
          {photoMessage !== null ? (
            <Text style={[styles.caption, { color: theme.colors.tint }]} testID="settings-photo-message">
              {photoMessage}
            </Text>
          ) : null}
        </SettingsCard>

        {/* 4. `if loading … else if preferences != nil … else` (`:191`, `:245`). */}
        {loading ? (
          <View style={styles.centred}>
            <ActivityIndicator color={theme.colors.tint} size="small" />
            <Text style={[theme.typography.body, { color: theme.colors.secondary }]} testID="settings-loading">
              Loading settings…
            </Text>
          </View>
        ) : preferences !== null ? (
          <>
            {/* 5. Profile and time (`:193-199`). */}
            <SettingsCard testID="settings-profile-time" title="Profile and time">
              <SettingsField onChangeText={setName} testID="settings-name" title="Display name" value={name} />
              <SettingsLabeledValue
                label="Time zone (Automatic)"
                testID="settings-time-zone"
                value={timeZoneLabel(zone)}
              />
              <SettingsHours
                end={preferences.workEnd}
                onChangeEnd={(value) => patch({ workEnd: value })}
                onChangeStart={(value) => patch({ workStart: value })}
                start={preferences.workStart}
                testIDPrefix="working-hours"
                title="Working hours"
              />
              <SettingsHours
                end={preferences.quietEnd}
                onChangeEnd={(value) => patch({ quietEnd: value })}
                onChangeStart={(value) => patch({ quietStart: value })}
                start={preferences.quietStart}
                testIDPrefix="quiet-hours"
                title="Quiet hours"
              />
            </SettingsCard>

            {/* 6. Voice and confirmation (`:200-208`). */}
            <SettingsCard testID="settings-voice" title="Voice and confirmation">
              <SettingsPicker
                label="AI confirmation"
                onChange={(value) => patch({ confirmationLevel: value })}
                options={CONFIRMATION_LEVELS}
                testID="settings-confirmation"
                value={preferences.confirmationLevel as (typeof CONFIRMATION_LEVELS)[number]['value']}
              />
              <SettingsToggle
                label="Enable spoken replies"
                onValueChange={(value) => patch({ voiceEnabled: value })}
                testID="settings-voice-enabled"
                value={preferences.voiceEnabled}
              />
              <SettingsDivider />
              <SettingsToggle
                label="Personalized predictions"
                onValueChange={(value) => patch({ personalizationEnabled: value })}
                testID="settings-personalization"
                value={preferences.personalizationEnabled}
              />
              <SettingsCaption>
                Learn from task timing, completion, postponements, and reminder outcomes. Off by default.
              </SettingsCaption>
            </SettingsCard>

            {/* 7. Notifications and focus (`:209-222`). */}
            <SettingsCard testID="settings-notifications" title="Notifications and focus">
              <SettingsToggle
                label="Suggest my next action"
                onValueChange={(value) => setNext((current) => ({ ...current, enabled: value }))}
                testID="settings-next-action"
                value={next.enabled}
              />
              <SettingsPicker
                label="Protect my current focus"
                onChange={(value) => setNext((current) => ({ ...current, switchingThreshold: value }))}
                options={SWITCHING_THRESHOLDS}
                testID="settings-switching-threshold"
                value={next.switchingThreshold as (typeof SWITCHING_THRESHOLDS)[number]['value']}
              />
              <SettingsCaption>Suggestions respect your working hours, quiet hours, and active focus.</SettingsCaption>
              <SettingsToggle
                label="Push notifications"
                onValueChange={(value) => patch({ pushEnabled: value })}
                testID="settings-push"
                value={preferences.pushEnabled}
              />
              <SettingsToggle
                label="Email notifications"
                onValueChange={(value) => patch({ emailEnabled: value })}
                testID="settings-email"
                value={preferences.emailEnabled}
              />
              <SettingsToggle
                label="Morning summary"
                onValueChange={(value) => patch({ morningSummary: value })}
                testID="settings-morning"
                value={preferences.morningSummary}
              />
              <SettingsToggle
                label="Evening summary"
                onValueChange={(value) => patch({ eveningSummary: value })}
                testID="settings-evening"
                value={preferences.eveningSummary}
              />
              <SettingsCaption>Manage delivery permissions and send tests in Notification Center.</SettingsCaption>
              <Pressable
                accessibilityLabel="Open Notification Center"
                accessibilityRole="button"
                onPress={() => openWeb('/notifications')}
                testID="settings-notification-center"
              >
                <Text style={[theme.typography.body, { color: theme.colors.tint }]}>Open Notification Center</Text>
              </Pressable>
            </SettingsCard>

            {/* 8. Calendars and privacy (`:223-244`). */}
            <SettingsCard testID="settings-calendars" title="Calendars and privacy">
              <Text style={[styles.subheadline, { color: theme.colors.secondary }]}>
                Connect Google Calendar securely. You may need to sign in with Google.
              </Text>
              <Pressable
                accessibilityLabel="Connect Google Calendar"
                accessibilityRole="button"
                accessibilityState={{ disabled: saving }}
                disabled={saving}
                onPress={() =>
                  void run(async () => {
                    const result = await connect.mutateAsync();
                    // Swift resumes with a throw for anything that is not a connection (`:227-231`).
                    if (!result.ok) throw new Error(result.message);
                    return result.message;
                  })
                }
                style={styles.linkRow}
                testID="settings-connect-google"
              >
                <TaskSymbol color={theme.colors.tint} name="calendar.badge.plus" size={17} />
                <Text style={[theme.typography.body, { color: theme.colors.tint }]}>Connect Google Calendar</Text>
              </Pressable>
              <Pressable
                accessibilityLabel="Synchronize now"
                accessibilityRole="button"
                accessibilityState={{ disabled: saving }}
                disabled={saving}
                onPress={() => void run(() => syncNow.mutateAsync())}
                style={styles.linkRow}
                testID="settings-sync-now"
              >
                <TaskSymbol color={theme.colors.tint} name="arrow.triangle.2.circlepath" size={17} />
                <Text style={[theme.typography.body, { color: theme.colors.tint }]}>Synchronize now</Text>
              </Pressable>
              <SettingsDivider />
              {/* `.font(.caption)` with no `.foregroundStyle` (ProfileView.swift:235). */}
              <Text style={[styles.caption, { color: theme.colors.label }]} testID="settings-consent-state">
                {consent.ai ? 'OpenAI sharing is allowed for this session.' : 'OpenAI sharing is off.'}
              </Text>
              {consent.ai ? (
                <Pressable
                  accessibilityLabel="Withdraw AI permission"
                  accessibilityRole="button"
                  onPress={() => consent.withdraw()}
                  testID="settings-withdraw-consent"
                >
                  <Text style={[theme.typography.body, { color: theme.colors.tint }]}>Withdraw AI permission</Text>
                </Pressable>
              ) : null}
              <Pressable
                accessibilityLabel="Delete account"
                accessibilityRole="button"
                onPress={confirmDelete}
                testID="settings-delete-account"
              >
                <Text style={[theme.typography.body, { color: theme.colors.danger }]}>Delete account</Text>
              </Pressable>
            </SettingsCard>

            {/* 9. Save settings (`:239-241`): a capsule filled with `NexdoTheme.saveGradient`. */}
            <Pressable
              accessibilityLabel="Save settings"
              accessibilityRole="button"
              accessibilityState={{ disabled: saving }}
              disabled={saving}
              onPress={() => void save()}
              testID="settings-save"
            >
              <LinearGradient
                colors={[brand.nexdoBlue, brand.nexdoIndigo, brand.nexdoMagenta]}
                end={{ x: 1, y: 0.5 }}
                start={{ x: 0, y: 0.5 }}
                style={[styles.save, { opacity: saving ? 0.55 : 1 }]}
              >
                {/* Swift reads the shared `saving` flag (ProfileView.swift:240), which a photo
                    upload, a sync and a calendar connection all set, not the save request alone. */}
                {saving ? <ActivityIndicator color="#FFFFFF" size="small" /> : null}
                <Text style={[theme.typography.body, styles.bold, { color: '#FFFFFF' }]}>
                  {saving ? 'Saving…' : 'Save settings'}
                </Text>
              </LinearGradient>
            </Pressable>
          </>
        ) : (
          <Pressable
            accessibilityLabel="Retry loading settings"
            accessibilityRole="button"
            onPress={onRetry}
            testID="settings-retry"
          >
            <Text style={[theme.typography.body, { color: theme.colors.tint }]}>Retry loading settings</Text>
          </Pressable>
        )}

        {/* 10 and 11: the failure line and the confirmation label (`:246-247`). */}
        {failure !== null ? (
          <Text style={[theme.typography.body, { color: theme.colors.danger }]} testID="settings-failure">
            {failure}
          </Text>
        ) : null}
        {message !== null ? (
          <View style={styles.row}>
            <TaskSymbol color={theme.colors.tint} name="checkmark.circle" size={17} />
            <Text style={[theme.typography.body, { color: theme.colors.tint }]} testID="settings-message">
              {message}
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flex: 1 },
  // `.subheadline` carries its own 21pt leading (style map section 2).
  subheadline: { fontSize: 15, lineHeight: 21 },
  caption: { fontSize: 12, lineHeight: 16 },
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: '700' },
  tabular: { fontVariant: ['tabular-nums'] },

  navBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14 },
  // `VStack(alignment: .leading, spacing: 18).padding(20)`
  scroll: { padding: 20, gap: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  centred: { alignItems: 'center', gap: 8, paddingVertical: 12 },

  // `HStack(spacing: 18)` with a 12pt-spaced column of actions.
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  photoActions: { flex: 1, gap: 12 },
  photoButton: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32 },

  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32 },
  bold: { fontWeight: '700' },
  // `.frame(maxWidth: .infinity, minHeight: 50)` in a Capsule.
  // A bare `HStack` spaces by 8 (ProfileView.swift:240).
  save: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 50, borderRadius: 25 },
});
