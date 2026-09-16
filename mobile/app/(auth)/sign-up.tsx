import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { StyleSheet, TextInput, View } from 'react-native';

import {
  AuthFieldDivider,
  AuthFieldRow,
  AuthScreen,
  GlassCard,
  GradientButton,
  RevealablePasswordField,
  Text,
} from '../../src/components';
import { isApiError } from '../../src/api';
import { useSignUp } from '../../src/query/useAuth';
import { signUpSchema, type SignUpValues } from '../../src/schemas/auth';
import { inputText, systemText, textStyles, useTheme } from '../../src/theme';

/**
 * Port of `SignUpView` (ios/App/RootView.swift:472-571).
 *
 * TODO(phase2-decision): Swift shows a single inline `localError` footnote under the card and sends
 * server failures to the root alert; it does no field mapping, because the server returns prose, not
 * field-keyed errors. The brief asked for field mapping, so the server message goes into that same
 * inline slot and, where the message is unambiguous, is also attached to the field it concerns. This
 * reuses the element Swift already has rather than adding a new one, but it is not literal parity.
 */
export default function SignUp() {
  // `presentation: 'modal'`, so the dark background elevates (see useTheme).
  const theme = useTheme({ elevated: true });
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
        onError: (error) => {
          const message = error.message;
          // Messages from src/lib/http.ts, mapped to the field each one is about.
          if (isApiError(error) && message.startsWith('An account with this email already exists')) setError('email', { message });
          else if (isApiError(error) && message.startsWith('Use a password with at least')) setError('password', { message });
          else setError('root', { message });
        },
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

      <GlassCard radius={26} style={styles.card}>
        <AuthFieldRow icon="person" paddingHorizontal={18} minHeight={68}>
          <Controller
            control={control}
            name="name"
            render={({ field }) => (
              <TextInput
                accessibilityLabel="Full name"
                placeholder="Full name"
                placeholderTextColor={theme.colors.placeholder}
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                textContentType="name"
                autoComplete="name"
                returnKeyType="next"
                style={[inputText(theme.typography.body), styles.input, { color: theme.colors.ink }]}
              />
            )}
          />
        </AuthFieldRow>

        <AuthFieldDivider />

        <AuthFieldRow icon="envelope" paddingHorizontal={18} minHeight={68}>
          <Controller
            control={control}
            name="email"
            render={({ field }) => (
              <TextInput
                accessibilityLabel="Email address"
                placeholder="Email address"
                placeholderTextColor={theme.colors.placeholder}
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
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

        <AuthFieldRow icon="lock" paddingHorizontal={18} minHeight={68}>
          <Controller
            control={control}
            name="password"
            render={({ field }) => (
              <RevealablePasswordField
                title="Password"
                autoComplete="new-password"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                returnKeyType="next"
              />
            )}
          />
        </AuthFieldRow>

        <AuthFieldDivider />

        <AuthFieldRow icon="checkmark.shield" paddingHorizontal={18} minHeight={68}>
          <Controller
            control={control}
            name="confirmation"
            render={({ field }) => (
              <RevealablePasswordField
                title="Confirm password"
                autoComplete="new-password"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
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

      {/* .padding(.vertical, 28) closes the column. */}
      <View style={styles.bottomInset} />
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
});
