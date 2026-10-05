import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GradientButton } from '../../components/GradientButton';
import { InlineNavBar } from '../../components/InlineNavBar';
import { closePresentedScreens, replaceWithSignIn } from '../../lib/sessionNavigation';
import { useChangePassword } from '../../query/useAuth';
import { useTheme } from '../../theme';
import { FormField, FormRow, FormScroll, FormSection, FormText } from '../moments/form';

/**
 * `ChangePasswordView` (ios/App/ProfileView.swift:150-198), pushed from Account. Three secure fields, the
 * "Change password and sign out?" confirmation, then the change and Swift's `reset()`: the app signs
 * out and Sign in opens, for the new password. A failure keeps the session and shows the server's text.
 */

/** UTF-8 bytes, as `new.utf8.count` (bcrypt reads at most 72). */
export function utf8Length(value: string): number {
  let bytes = 0;
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

/** `valid` (:158-160): a current password, a new one of 12+ characters and ≤ 72 bytes, confirmed, and different. */
export function passwordChangeValid(current: string, next: string, confirmation: string): boolean {
  return current !== '' && Array.from(next).length >= 12 && utf8Length(next) <= 72 && next === confirmation && next !== current;
}

export function ChangePasswordScreen({ onBack }: { onBack: () => void }) {
  const theme = useTheme();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [failure, setFailure] = useState<string | null>(null);
  const change = useChangePassword({ beforeSessionEnds: closePresentedScreens });
  const saving = change.isPending;
  const valid = passwordChangeValid(current, next, confirmation);

  /** `save()` (:184-192). */
  const save = () => {
    if (!valid || saving) return;
    setFailure(null);
    change.mutate(
      { current, next, confirmation },
      {
        onSuccess: () => {
          setCurrent('');
          setNext('');
          setConfirmation('');
          replaceWithSignIn();
        },
        onError: (error) => setFailure(error.message),
      },
    );
  };

  /** `.alert("Change password and sign out?", …)` (:172-177). */
  const confirm = () =>
    Alert.alert('Change password and sign out?', 'After your password is changed, you’ll be signed out and must sign in again using your new password. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Change password', onPress: save },
    ]);

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.fill, { backgroundColor: theme.colors.groupedBackground }]} testID="change-password-screen">
      <InlineNavBar backHidden={saving} onBack={onBack} testID="change-password-nav" title="Change password" />
      <FormScroll>
        <FormSection disabled={saving} footer="Use at least 12 characters (72 bytes maximum). You’ll need to sign in again after changing your password.">
          <FormRow>
            <FormField autoCapitalize="none" autoComplete="current-password" autoCorrect={false} onChangeText={setCurrent} placeholder="Current password" secureTextEntry testID="change-password-current" textContentType="password" value={current} />
          </FormRow>
          <FormRow>
            <FormField autoCapitalize="none" autoComplete="new-password" autoCorrect={false} onChangeText={setNext} placeholder="New password" secureTextEntry testID="change-password-new" textContentType="newPassword" value={next} />
          </FormRow>
          <FormRow last>
            <FormField
              autoCapitalize="none"
              autoComplete="new-password"
              autoCorrect={false}
              onChangeText={setConfirmation}
              placeholder="Confirm new password"
              secureTextEntry
              testID="change-password-confirm"
              textContentType="newPassword"
              value={confirmation}
            />
          </FormRow>
        </FormSection>
        {confirmation !== '' && next !== confirmation ? (
          <FormSection>
            <FormRow last>
              <FormText tone="danger" testID="change-password-mismatch">
                The new passwords do not match.
              </FormText>
            </FormRow>
          </FormSection>
        ) : null}
        {failure ? (
          <FormSection>
            <FormRow last>
              <FormText tone="danger" testID="change-password-failure">
                {failure}
              </FormText>
            </FormRow>
          </FormSection>
        ) : null}
        {/* The button is a `Form` row of its own (`change-password`). */}
        <FormSection>
          <FormRow last>
            <View style={styles.submit}>
              <GradientButton disabled={!valid || saving} minHeight={50} onPress={confirm} testID="change-password-submit" title={saving ? 'Changing password…' : 'Change password'} />
            </View>
          </FormRow>
        </FormSection>
      </FormScroll>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  submit: { flex: 1 },
});
