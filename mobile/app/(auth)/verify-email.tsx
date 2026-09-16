import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, TextInput, View } from 'react-native';

import {
  AuthFieldRow,
  AuthScreen,
  GlassCard,
  GradientButton,
  SignInFieldIcon,
  Text,
} from '../../src/components';
import { useResendVerification, useVerifyEmail } from '../../src/query/useAuth';
import { isCodeComplete, sanitizeCode } from '../../src/schemas/auth';
import { systemText, textStyles, useTheme } from '../../src/theme';
import type { PendingVerification } from '../../src/query/useAuth';

/** `EmailVerificationView.resendCooldown` (ios/App/RootView.swift:686). Client-side: the server has none. */
export const RESEND_COOLDOWN_SECONDS = 60;

/** The opening message per reason (ios/App/RootView.swift:688-699). */
export function initialMessages(email: string, reason: PendingVerification['reason']): { message?: string; errorMessage?: string } {
  switch (reason) {
    case 'codeNotSent':
      return { errorMessage: 'We couldn’t send your verification code. Send a new code to try again.' };
    case 'signInRequiresVerification':
      return { message: 'Verify your email to sign in. Send a new code if you don’t have one from the last 24 hours.' };
    case 'codeSent':
    default:
      return { message: `We sent a six-digit code to ${email}. It expires in 24 hours.` };
  }
}

/**
 * Port of `EmailVerificationView` (ios/App/RootView.swift:674-819).
 *
 * One field that accepts a paste, not six boxes — Swift uses a single `TextField` with
 * `.textContentType(.oneTimeCode)`, and every keystroke is filtered through `VerificationCode.sanitized`.
 */
export default function VerifyEmail() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ email?: string; reason?: string }>();
  const email = params.email ?? '';
  const reason = (params.reason as PendingVerification['reason'] | undefined) ?? 'codeSent';

  const verify = useVerifyEmail();
  const resend = useResendVerification();

  const [code, setCode] = useState('');
  // Lazy initialisers, so the opening message is computed once, as `init(pending:showsCancel:)` does.
  const [message, setMessage] = useState<string | undefined>(() => initialMessages(email, reason).message);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(() => initialMessages(email, reason).errorMessage);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const working = verify.isPending || resend.isPending;
  // RootView.swift:790 `canVerify`.
  const canVerify = !working && isCodeComplete(code);

  // Stands in for `TimelineView(.periodic(from: .now, by: 1))` around the resend button.
  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setInterval(() => setSecondsLeft((current) => Math.max(0, current - 1)), 1000);
    return () => clearInterval(timer);
  }, [secondsLeft]);

  const submit = () => {
    if (!canVerify) return;
    // RootView.swift:797 `codeFocused = false` while verifying.
    Keyboard.dismiss();
    setErrorMessage(undefined);
    setMessage(undefined);
    verify.mutate(
      { email, code },
      {
        onSuccess: () => router.replace('/today'),
        // TODO(phase2-decision): the server gives no distinct "too many attempts" code. After five
        // wrong codes (MAX_CODE_ATTEMPTS in src/server/account-auth.ts:11 — five, not the ten the brief
        // assumed) it returns the same 400, whose message already reads "... Send a new code and try
        // again.". That message is the lockout state; there is nothing else to key a separate UI off.
        onError: (error) => setErrorMessage(error.message),
      },
    );
  };

  const sendNewCode = () => {
    if (working || secondsLeft > 0) return;
    setErrorMessage(undefined);
    setMessage(undefined);
    resend.mutate(
      { email },
      {
        onSuccess: (serverMessage) => {
          setMessage(serverMessage);
          setSecondsLeft(RESEND_COOLDOWN_SECONDS);
          setCode('');
        },
        onError: (error) => setErrorMessage(error.message),
      },
    );
  };

  return (
    <AuthScreen contentStyle={styles.column}>
      <SignInFieldIcon name="envelope.badge" />

      <Text style={[styles.title, { color: theme.colors.ink }]}>Verify your email</Text>
      <Text style={[styles.body, styles.intro, { color: theme.colors.secondary }]}>
        Enter the six-digit code we emailed to {email}.
      </Text>

      <GlassCard radius={26} style={styles.card}>
        <AuthFieldRow icon="number" paddingHorizontal={18} minHeight={72}>
          <TextInput
            accessibilityLabel="Verification code"
            placeholder="6-digit code"
            placeholderTextColor={theme.colors.placeholder}
            value={code}
            // RootView.swift:726-729: non-digits are stripped and the value is capped at six.
            onChangeText={(value) => setCode(sanitizeCode(value))}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            autoFocus
            returnKeyType="go"
            onSubmitEditing={submit}
            style={[styles.codeInput, { color: theme.colors.ink }]}
            testID="verification-code"
          />
        </AuthFieldRow>
      </GlassCard>

      {message ? (
        <Text accessibilityLiveRegion="polite" style={[styles.footnote, styles.message, { color: theme.colors.secondary }]}>
          {message}
        </Text>
      ) : null}
      {errorMessage ? (
        <Text accessibilityLiveRegion="polite" style={[styles.footnote, styles.error, { color: theme.colors.danger }]}>
          {errorMessage}
        </Text>
      ) : null}

      <GradientButton
        title={verify.isPending ? 'Verifying…' : 'Verify Email'}
        onPress={submit}
        disabled={!canVerify}
        minHeight={60}
        style={styles.verifyButton}
        testID="verify-submit"
      />

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: working || secondsLeft > 0 }}
        disabled={working || secondsLeft > 0}
        onPress={sendNewCode}
        style={styles.resend}
        testID="resend-code"
      >
        <Text
          style={[
            styles.resendLabel,
            { color: working || secondsLeft > 0 ? theme.colors.secondary : theme.colors.tint },
          ]}
        >
          {secondsLeft > 0 ? `Send a new code in ${secondsLeft}s` : 'Send a new code'}
        </Text>
      </Pressable>

      <View style={styles.bottomInset} />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  column: { paddingHorizontal: 28, paddingTop: 28, alignItems: 'stretch' },
  title: { ...systemText(34), fontWeight: '700', marginTop: 18 },
  body: textStyles.body,
  intro: { marginTop: 8 },
  card: { marginTop: 28 },
  // .font(.title2.monospacedDigit().weight(.semibold))
  codeInput: { flex: 1, ...textStyles.title2, fontWeight: '600', fontVariant: ['tabular-nums'], paddingVertical: 0 },
  footnote: textStyles.footnote,
  message: { marginTop: 12 },
  error: { marginTop: 8 },
  verifyButton: { marginTop: 20 },
  // .frame(maxWidth: .infinity, minHeight: 44).padding(.top, 12)
  resend: { minHeight: 44, marginTop: 12, alignItems: 'center', justifyContent: 'center' },
  resendLabel: { ...textStyles.subheadline, fontWeight: '600' },
  bottomInset: { height: 28 },
});
