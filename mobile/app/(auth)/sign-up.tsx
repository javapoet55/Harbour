import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Platform, StyleSheet, TextInput, View } from 'react-native';

import {
  AuthFieldDivider,
  AuthFieldRow,
  AuthScreen,
  GlassCard,
  GradientButton,
  RevealablePasswordField,
  Text,
} from '../../src/components';
import { useSignUp } from '../../src/query/useAuth';
import { signUpSchema, type SignUpValues } from '../../src/schemas/auth';
import { inputText, systemText, textStyles, useTheme } from '../../src/theme';

/**
 * Port of `SignUpView` (ios/App/RootView.swift:472-571).
 *
 * Server failures show as ONE message in the inline footnote slot, matching Swift: `SignUpView` keeps
 * a single `localError` string (RootView.swift:479, 531-532) and does no field mapping, because the
 * server returns prose rather than field-keyed errors. Phase 2 briefly mapped messages onto
 * individual fields; that went beyond the Swift app and was reverted in Phase 3 housekeeping.
 */
export default function SignUp() {
  // `presentation: 'modal'`, so the dark background elevates (see useTheme).
  const theme = useTheme({ elevated: true });
  // The field being edited, so its row's icon tile takes the focus accent (Android, docs/android-polish.md §11).
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const blurField = (name: string) => setFocusedField((current) => (current === name ? null : current));
  const signUp = useSignUp();

  const {
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { name: '', email: '', password: '', confirmation: '' },
    mode: 'onSubmit',
  });

  const [name, email, password, confirmation] = useWatch({ control, name: ['name', 'email', 'password', 'confirmation'] });
  const busy = signUp.isPending;
  // RootView.swift:561-563 `canCreate`.
  const canCreate = !busy && name.trim().length > 0 && email.includes('@') && password.length >= 12 && confirmation.length >= 12;

  // The inline footnote slot: a schema message, or whatever the server said.
  const inlineError = errors.confirmation?.message ?? errors.password?.message ?? errors.email?.message ?? errors.name?.message ?? errors.root?.message;

  const submit = handleSubmit((values) => {
    signUp.mutate(
      { name: values.name, email: values.email, password: values.password },
      {
        onSuccess: (pending) => {
          // A server without email verification signs in at registration; the gate takes over.
          if (!pending) return;
          router.push({ pathname: '/verify-email', params: { email: pending.email, reason: pending.reason } });
        },
        // Whatever the server said, in the one inline slot Swift has.
        onError: (error) => setError('root', { message: error.message }),
      },
    );
  });

  return (
    <AuthScreen contentStyle={styles.column} elevated>
      {/* .font(.system(size: 34, weight: .bold, design: .rounded)) */}
      <Text style={[styles.title, { color: theme.colors.ink }]}>Create your account</Text>
      <Text style={[styles.body, styles.intro, { color: theme.colors.secondary }]}>
        Make your day easier with an AI-powered to-do app that turns a busy mind into a clear plan.
      </Text>

      <GlassCard radius={26} style={styles.card} formGroup testID="sign-up-card">
        <AuthFieldRow icon="person" paddingHorizontal={18} minHeight={68} focused={focusedField === 'name'}>
          <Controller
            control={control}
            name="name"
            render={({ field }) => (
              <TextInput
                // Android draws its own underline drawable behind a TextInput; it showed
                // as a pale hard-edged box inside the glass card.
                underlineColorAndroid="transparent"
                accessibilityLabel="Full name"
                placeholder="Full name"
                placeholderTextColor={theme.colors.placeholder}
                value={field.value}
                onChangeText={field.onChange}
                onFocus={() => setFocusedField('name')}
                onBlur={() => {
                  field.onBlur();
                  blurField('name');
                }}
                textContentType="name"
                autoComplete="name"
                returnKeyType="next"
                style={[inputText(theme.typography.body), styles.input, { color: theme.colors.ink }]}
              />
            )}
          />
        </AuthFieldRow>

        <AuthFieldDivider />

        <AuthFieldRow icon="envelope" paddingHorizontal={18} minHeight={68} focused={focusedField === 'email'}>
          <Controller
            control={control}
            name="email"
            render={({ field }) => (
              <TextInput
                // Android draws its own underline drawable behind a TextInput; it showed
                // as a pale hard-edged box inside the glass card.
                underlineColorAndroid="transparent"
                accessibilityLabel="Email address"
                placeholder="Email address"
                placeholderTextColor={theme.colors.placeholder}
                value={field.value}
                onChangeText={field.onChange}
                onFocus={() => setFocusedField('email')}
                onBlur={() => {
                  field.onBlur();
                  blurField('email');
                }}
                keyboardType="email-address"
                textContentType="username"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                style={[inputText(theme.typography.body), styles.input, { color: theme.colors.ink }]}
              />
            )}
          />
        </AuthFieldRow>

        <AuthFieldDivider />

        <AuthFieldRow icon="lock" paddingHorizontal={18} minHeight={68} focused={focusedField === 'password'}>
          <Controller
            control={control}
            name="password"
            render={({ field }) => (
              <RevealablePasswordField
                title="Password"
                autoComplete="new-password"
                value={field.value}
                onChangeText={field.onChange}
                onFocus={() => setFocusedField('password')}
                onBlur={() => {
                  field.onBlur();
                  blurField('password');
                }}
                returnKeyType="next"
              />
            )}
          />
        </AuthFieldRow>

        <AuthFieldDivider />

        <AuthFieldRow icon="checkmark.shield" paddingHorizontal={18} minHeight={68} focused={focusedField === 'confirmation'}>
          <Controller
            control={control}
            name="confirmation"
            render={({ field }) => (
              <RevealablePasswordField
                title="Confirm password"
                autoComplete="new-password"
                value={field.value}
                onChangeText={field.onChange}
                onFocus={() => setFocusedField('confirmation')}
                onBlur={() => {
                  field.onBlur();
                  blurField('confirmation');
                }}
                returnKeyType="go"
                onSubmitEditing={() => submit()}
              />
            )}
          />
        </AuthFieldRow>
      </GlassCard>

      <Text style={[styles.footnote, styles.policy, { color: theme.colors.secondary }]}>
        Use at least 12 characters. Your password is sent securely to Nexdo and stored only as a one-way hash.
      </Text>

      {inlineError ? (
        <Text accessibilityLiveRegion="polite" style={[styles.footnote, styles.error, { color: theme.colors.danger }]}>
          {inlineError}
        </Text>
      ) : null}

      <GradientButton
        title={busy ? 'Creating Account…' : 'Create Account'}
        onPress={() => submit()}
        disabled={!canCreate}
        minHeight={60}
        style={styles.createButton}
        testID="sign-up-submit"
      />

      <Text style={[styles.footnote, styles.closing, { color: theme.colors.secondary }]}>
        Nexdo captures tasks in your own words, finds the right next step, and helps you protect time for what matters.
      </Text>

      {/* .padding(.vertical, 28) closes the column. Android: 24 under the closing copy, with the
          navigation bar's inset added by AuthScreen so the copy scrolls clear of it. */}
      <View style={[styles.bottomInset, Platform.OS === 'android' && styles.androidBottomInset]} testID="sign-up-bottom" />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  // .padding(.horizontal, 28).padding(.vertical, 28), leading-aligned.
  column: { paddingHorizontal: 28, paddingTop: 28, alignItems: 'stretch' },
  title: { ...systemText(34), fontWeight: '700' },
  body: textStyles.body,
  intro: { marginTop: 8 },
  input: { flex: 1, paddingVertical: 0 },
  card: { marginTop: 28 },
  footnote: textStyles.footnote,
  policy: { marginTop: 12 },
  error: { marginTop: 8 },
  createButton: { marginTop: 20 },
  closing: { marginTop: 18 },
  bottomInset: { height: 28 },
  androidBottomInset: { height: 24 },
});
