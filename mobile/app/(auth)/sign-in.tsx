import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Alert, Keyboard, Pressable, StyleSheet, TextInput, View } from 'react-native';


import {
  AppleSignInButton,
  useAppleSignInAvailable,
  AuthFieldDivider,
  AuthFieldRow,
  AuthScreen,
  GlassCard,
  GradientButton,
  GradientText,
  NexdoLogoMark,
  RevealablePasswordField,
  SymbolLabel,
  Text,
  type AppleCredential,
} from '../../src/components';
import { useAppleSignIn, useSignIn } from '../../src/query/useAuth';
import { signInSchema, type SignInValues } from '../../src/schemas/auth';
import { useLastSignedIn } from '../../src/store/lastSignedIn';
import { brand, inputText, systemText, textStyles, useTheme } from '../../src/theme';

/**
 * Port of `SignInView` (ios/App/RootView.swift:258-470).
 *
 * Errors follow Swift: `AppModel.error` is presented by the root `.alert("Unable to complete request")`
 * (RootView.swift:62-64), so sign-in has no inline error row of its own.
 */
export default function SignIn() {
  const theme = useTheme();
  const signIn = useSignIn();
  const apple = useAppleSignIn();
  const greetingName = useLastSignedIn((state) => state.value);
  const [passwordField, setPasswordField] = useState<TextInput | null>(null);
  const appleAvailable = useAppleSignInAvailable();

  const { control, handleSubmit, setValue } = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
    mode: 'onSubmit',
  });

  const email = useWatch({ control, name: 'email' });
  const password = useWatch({ control, name: 'password' });
  const busy = signIn.isPending || apple.isPending;
  // RootView.swift:431-433 `canSignIn`: an "@" and a non-empty password, nothing stricter.
  const canSignIn = !busy && email.includes('@') && password.length > 0;

  // TODO(phase2-decision): there is no lockout to show. The brief expected "5 failed logins / 15 min",
  // but src/app/api/auth/login/route.ts and src/server/auth.ts have no attempt counter, no 429 and no
  // Retry-After — a wrong password always returns the same 401. So no countdown and no timed disable
  // are rendered. If a lockout is wanted, it has to be added on the server first.
  const showError = (message: string) => Alert.alert('Unable to complete request', message, [{ text: 'OK' }]);

  const submit = handleSubmit(
    (values) => {
      // RootView.swift:436 `focusedField = nil`: submitting drops focus, so the keyboard goes away
      // and the button's "Signing In…" state is actually visible.
      Keyboard.dismiss();
      // RootView.swift:437-439: the submitted password is cleared from state immediately.
      setValue('password', '');
      signIn.mutate(
        { email: values.email, password: values.password },
        {
          onSuccess: (pending) => {
            if (!pending) return;
            // The server requires the emailed code first. Swift does NOT resend here; the verify
            // screen offers "Send a new code" instead (RootView.swift:696-697).
            router.push({ pathname: '/verify-email', params: { email: pending.email, reason: pending.reason } });
          },
          onError: (error) => showError(error.message),
        },
      );
    },
    // Swift has no inline errors here, so a schema failure surfaces in the same alert.
    (errors) => showError(errors.email?.message ?? errors.password?.message ?? 'Enter your email address and password.'),
  );

  const signInWithApple = (credential: AppleCredential) =>
    apple.mutate(credential, { onError: (error) => showError(error.message) });

  return (
    <AuthScreen topInset>
      {/* Spacer(minLength: 42) */}
      <View style={styles.topSpacer} />

      <View style={styles.center}>
        <NexdoLogoMark width={116} height={84} />
      </View>

      {/* .font(.system(size: 42, weight: .bold, design: .rounded)) with a blue-indigo-magenta fill. */}
      <GradientText
        colors={[brand.nexdoBlue, brand.nexdoIndigo, brand.nexdoMagenta]}
        numberOfLines={2}
        shadow={{ color: 'rgba(61, 41, 240, 0.20)', radius: 12, offsetY: 4 }}
        style={styles.title}
      >
        {greetingName ? `Welcome back, ${greetingName}` : 'Welcome back'}
      </GradientText>

      <Text style={[styles.subtitle, { color: theme.colors.secondary }]}>Your day is clearer with Nexdo.</Text>

      <GlassCard radius={28} style={styles.card}>
        <AuthFieldRow icon="envelope" paddingHorizontal={20} minHeight={72}>
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
                onBlur={field.onBlur}
                keyboardType="email-address"
                textContentType="username"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                submitBehavior="submit"
                onSubmitEditing={() => passwordField?.focus()}
                style={[inputText(theme.typography.body), styles.input, { color: theme.colors.ink }]}
              />
            )}
          />
        </AuthFieldRow>

        <AuthFieldDivider />

        <AuthFieldRow icon="lock" paddingHorizontal={20} minHeight={72}>
          <Controller
            control={control}
            name="password"
            render={({ field }) => (
              <RevealablePasswordField
                ref={setPasswordField}
                title="Password"
                // Sign-in uses .password, not .newPassword, so managers offer the saved credential.
                textContentType="password"
                autoComplete="current-password"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                returnKeyType="go"
                onSubmitEditing={() => submit()}
              />
            )}
          />
        </AuthFieldRow>

        <AuthFieldDivider />

        {/* .font(.subheadline.weight(.medium)), trailing aligned, minHeight 54, .padding(.horizontal, 22) */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Forgot password?"
          onPress={() => router.push({ pathname: '/reset-password', params: { email } })}
          style={styles.forgotRow}
        >
          <Text style={[styles.forgot, { color: theme.colors.link }]}>Forgot password?</Text>
        </Pressable>
      </GlassCard>

      <GradientButton
        title={busy ? 'Signing In…' : 'Sign In'}
        onPress={() => submit()}
        disabled={!canSignIn}
        minHeight={62}
        style={styles.signInButton}
        testID="sign-in-submit"
      />

      {/* HStack(spacing: 12) { Rectangle; Text("OR"); Rectangle } — the rule only makes sense when
          there is something below it to divide from. Apple sign-in never renders on Android, which
          left an "OR" separating the form from empty space. */}
      {appleAvailable ? (
      <View style={styles.orRow}>
        <View style={[styles.rule, { backgroundColor: theme.colors.ruleFaint }]} />
        <Text style={[styles.or, { color: theme.colors.secondary }]}>OR</Text>
        <View style={[styles.rule, { backgroundColor: theme.colors.ruleFaint }]} />
      </View>

      ) : null}

      <AppleSignInButton onCredential={signInWithApple} onError={showError} disabled={busy} style={styles.apple} />

      {/* HStack(spacing: 5) { Text("New to Nexdo?"); Button("Create account") } */}
      <View style={styles.createRow}>
        {/* Unstyled in Swift, so it takes `Color.primary` (.label), not `nexdoInk`. */}
        <Text style={[styles.subheadline, { color: theme.colors.label }]}>New to Nexdo?</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Create account" onPress={() => router.push('/sign-up')}>
          <Text style={[styles.subheadline, { color: theme.colors.link }]}>Create account</Text>
        </Pressable>
      </View>

      {/* Label("...", systemImage: "checkmark.shield") */}
      <SymbolLabel
        icon="shield-checkmark-outline"
        iconSize={13}
        // Measured against Swift: the SF Symbol's advance plus Label spacing comes to 21pt, so the
        // Ionicons box (13) needs 8 to give the title the same width and wrap on the same word.
        spacing={8}
        color={theme.colors.secondary}
        textStyle={styles.footnoteLeading}
        style={styles.assuranceWrap}
      >
        Your password stays on this device only for this sign-in.
      </SymbolLabel>

    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  topSpacer: { height: 42 },
  center: { alignItems: 'center' },
  input: { flex: 1, paddingVertical: 0 },
  title: { ...systemText(42), fontWeight: '700', textAlign: 'center', marginTop: 22 },
  subtitle: { ...textStyles.title3, textAlign: 'center', marginTop: 8 },
  card: { marginHorizontal: 28, marginTop: 42 },
  forgotRow: { minHeight: 54, paddingHorizontal: 22, justifyContent: 'center', alignItems: 'flex-end' },
  forgot: { ...textStyles.subheadline, fontWeight: '500' },
  signInButton: { marginHorizontal: 28, marginTop: 22 },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 36, marginVertical: 22 },
  rule: { flex: 1, height: 1 },
  or: { ...textStyles.subheadline, fontWeight: '600' },
  apple: { marginHorizontal: 28 },
  createRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5, marginTop: 24 },
  subheadline: textStyles.subheadline,
  assuranceWrap: { marginTop: 18, marginBottom: 34, paddingHorizontal: 32 },
  footnoteLeading: textStyles.footnote,
  footnote: { ...textStyles.footnote, textAlign: 'center' },
  devRow: { alignItems: 'center', paddingBottom: 24, gap: 12 },
  devLinks: { alignItems: 'center', gap: 10 },
});
