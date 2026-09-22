import { router, useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { KeyboardAvoidingView, KeyboardAwareScrollView, RevealablePasswordField, Text } from '../../src/components';
import { useConfirmPasswordReset, useRequestPasswordReset } from '../../src/query/useAuth';
import { sanitizeCode } from '../../src/schemas/auth';
import { androidGroup, androidLabel, inputText, isAndroid, textStyles, useTheme } from '../../src/theme';

/**
 * Port of `PasswordResetView` (ios/App/RootView.swift:574-640).
 *
 * Confirmed as ONE screen with two stages: the verification section and the update button appear in
 * place once `codeSent` is true, without navigating.
 *
 * Unlike the other three auth screens this is a SwiftUI `Form`, not a glass card over `SignInBackdrop`
 * — so it is a plain inset-grouped list on the grouped background, and it deliberately looks different.
 */
export default function ResetPassword() {
  // `presentation: 'modal'`, so the dark backgrounds elevate (see useTheme).
  const theme = useTheme({ elevated: true });
  const params = useLocalSearchParams<{ email?: string }>();

  // `init(initialEmail:)` — the address typed on sign-in carries over.
  const [email, setEmail] = useState(params.email ?? '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [localError, setLocalError] = useState<string | undefined>();

  const request = useRequestPasswordReset();
  const confirm = useConfirmPasswordReset();
  const busy = request.isPending || confirm.isPending;

  const close = () => router.back();

  const requestCode = () => {
    setLocalError(undefined);
    request.mutate(
      { email },
      { onSuccess: () => setCodeSent(true), onError: (error) => setLocalError(error.message) },
    );
  };

  const updatePassword = () => {
    // RootView.swift:636 — the mismatch is checked before the request is made.
    if (password !== confirmation) {
      setLocalError('The passwords do not match.');
      return;
    }
    setLocalError(undefined);
    confirm.mutate(
      { email, code, password },
      {
        onSuccess: () =>
          Alert.alert('Password updated', 'You can now sign in with your new password.', [{ text: 'Sign In', onPress: close }]),
        onError: (error) => setLocalError(error.message),
      },
    );
  };

  return (
    <View style={[styles.fill, { backgroundColor: theme.colors.groupedBackground }]}>
      <KeyboardAvoidingView style={styles.fill} behavior="padding">
        <KeyboardAwareScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form}>
          <FormSection footer="We’ll email a six-digit code if an account exists. Codes expire after 15 minutes.">
            <FormRow>
              <TextInput
                // Android draws its own underline drawable behind a TextInput; it showed
                // as a pale hard-edged box inside the glass card.
                underlineColorAndroid="transparent"
                accessibilityLabel="Email address"
                placeholder="Email address"
                placeholderTextColor={theme.colors.placeholder}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                textContentType="username"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                style={[inputText(theme.typography.body), styles.input, { color: theme.colors.ink }]}
              />
            </FormRow>
          </FormSection>

          {codeSent ? (
            <FormSection header="Verification">
              <FormRow>
                <TextInput
                  // Android draws its own underline drawable behind a TextInput; it showed
                  // as a pale hard-edged box inside the glass card.
                  underlineColorAndroid="transparent"
                  accessibilityLabel="6-digit code"
                  placeholder="6-digit code"
                  placeholderTextColor={theme.colors.placeholder}
                  value={code}
                  onChangeText={(value) => setCode(sanitizeCode(value))}
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  autoComplete="one-time-code"
                  style={[inputText(theme.typography.body), styles.input, { color: theme.colors.ink }]}
                  testID="reset-code"
                />
              </FormRow>
              <FormRow>
                <RevealablePasswordField
                  title="New password"
                  autoComplete="new-password"
                  value={password}
                  onChangeText={setPassword}
                />
              </FormRow>
              <FormRow last>
                <RevealablePasswordField
                  title="Confirm new password"
                  autoComplete="new-password"
                  value={confirmation}
                  onChangeText={setConfirmation}
                />
              </FormRow>
            </FormSection>
          ) : null}

          {localError ? (
            <FormSection>
              <FormRow last>
                <Text accessibilityLiveRegion="polite" style={[theme.typography.body, { color: theme.colors.danger }]}>
                  {localError}
                </Text>
              </FormRow>
            </FormSection>
          ) : null}

          <FormSection>
            {codeSent ? (
              <>
                <FormButton
                  title={confirm.isPending ? 'Updating…' : 'Update Password'}
                  onPress={updatePassword}
                  // RootView.swift:620: six digits and at least twelve characters.
                  disabled={busy || code.length !== 6 || password.length < 12}
                  testID="reset-update"
                />
                <FormButton title="Send a new code" onPress={requestCode} disabled={busy} last />
              </>
            ) : (
              <FormButton
                title={request.isPending ? 'Sending…' : 'Send Verification Code'}
                onPress={requestCode}
                disabled={busy || !email.includes('@')}
                last
                testID="reset-request"
              />
            )}
          </FormSection>
        </KeyboardAwareScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

/**
 * One inset-grouped `Section`, with the optional header and footer SwiftUI draws around it.
 *
 * Measured off the Swift app on iOS 26, where the inset-grouped list changed: the section is inset
 * 16pt (not 20), its corners are 26pt (not 10), rows are 56pt tall (not 44), and the header is
 * sentence case at `.body` — **not** the uppercase `.footnote` of earlier iOS.
 */
function FormSection({ children, header, footer }: { children: ReactNode; header?: string; footer?: string }) {
  const theme = useTheme({ elevated: true });
  return (
    <View style={styles.section}>
      {/* Android: the shared field label, 20 above and 8 to the group (docs/android-polish.md §4). */}
      {header ? <Text style={[styles.header, { color: theme.colors.secondaryLabel }, androidLabel(theme), isAndroid() && styles.androidHeader]}>{header}</Text> : null}
      {/* Android: the shared form group — field surface a step above this sheet, and a hairline
          (docs/android-polish.md §3). */}
      <View style={[styles.sectionBody, { backgroundColor: theme.colors.surface }, androidGroup(theme)]} testID="reset-section">
        {children}
      </View>
      {footer ? <Text style={[styles.footer, { color: theme.colors.secondaryLabel }]}>{footer}</Text> : null}
    </View>
  );
}

/** A 56pt form row with the inset 1pt separator iOS draws between rows. */
function FormRow({ children, last = false }: { children: ReactNode; last?: boolean }) {
  const theme = useTheme({ elevated: true });
  return (
    <View
      style={[
        styles.row,
        !last && { borderBottomWidth: 1, borderBottomColor: theme.colors.listSeparator },
        // Android: the group's 1px separator colour.
        !last && isAndroid() && { borderBottomColor: theme.colors.fieldBorder },
      ]}
    >
      {children}
    </View>
  );
}

/** A `Button` inside a Form: tinted, leading-aligned text; grey when disabled. */
function FormButton({
  title,
  onPress,
  disabled,
  last = false,
  testID,
}: {
  title: string;
  onPress: () => void;
  disabled: boolean;
  last?: boolean;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={[styles.row, !last && { borderBottomWidth: 1, borderBottomColor: theme.colors.listSeparator }]}
    >
      <Text style={[theme.typography.body, { color: disabled ? theme.colors.secondary : theme.colors.tint }]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // Measured: the Swift Form's first section sits 35pt below the navigation bar.
  form: { paddingTop: 35, paddingBottom: 18 },
  input: { flex: 1, paddingVertical: 0 },
  section: { marginBottom: 0 },
  // iOS 26 inset-grouped metrics, measured off the Swift app: 16pt outer inset, 26pt corners,
  // 16pt row inset, 56pt rows.
  sectionBody: { marginHorizontal: 16, borderRadius: 26, overflow: 'hidden' },
  // 15pt of vertical padding makes a plain row 56pt and a row holding the 44pt eye button 74pt,
  // which is what the Swift Form measures.
  row: { minHeight: 56, paddingHorizontal: 16, paddingVertical: 15, flexDirection: 'row', alignItems: 'center' },
  // Header and footer sit 16pt inside the section, so 32pt from the screen edge.
  header: { ...textStyles.body, marginHorizontal: 32, marginTop: 16, marginBottom: 8 },
  androidHeader: { marginTop: 20, marginBottom: 8 },
  footer: { ...textStyles.subheadline, marginHorizontal: 32, marginTop: 10, marginBottom: 12 },
});
