import Ionicons from '@expo/vector-icons/Ionicons';
import { zodResolver } from '@hookform/resolvers/zod';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardAvoidingView, KeyboardAwareScrollView, NexdoLogoMark, RevealablePasswordField, Text } from '../../src/components';
import { withAlpha } from '../../src/components/SignInBackdrop';
import { useSecureScreen } from '../../src/features/bugReport/coordinator';
import { signupChallenge } from '../../src/lib/signupChallenge';
import { accountExists, useSignUp } from '../../src/query/useAuth';
import { MAX_PASSWORD_BYTES, signUpSchema, utf8Length, type SignUpValues } from '../../src/schemas/auth';
import { androidBar, brand, inputText, textStyles, useTheme } from '../../src/theme';

/**
 * Port of `SignUpView` (ios/App/RootView.swift:618-797), redesigned in Phase 14 (8e171aa, afe0430,
 * a80c206, 8592a0a): no title, the NexDo header, a card of captioned fields, and Create Account pinned in a
 * bar above "Already have an account? Sign In". Captures `sign-up-v4`, `-scrolled`, `-keyboard`, `-filled`,
 * `-passwords-mismatch`, `sign-up-existing-account-alert`.
 *
 * Server failures still show as ONE message under the card (`localError`). An existing account is not a
 * failure: leaving the email field, or creating, asks `account-exists`, and a yes (or register's 409) asks
 * "Account already exists" and offers the password reset.
 */

export const EXISTING_ACCOUNT_TITLE = 'Account already exists';
export const EXISTING_ACCOUNT_MESSAGE = 'We already have an account with this email address. Do you want to reset the password?';

const BUTTON_GRADIENT = [brand.nexdoBlue, brand.nexdoIndigo, brand.nexdoPurple] as const;

/**
 * Android stacks a second dialog on the first, where Swift's one `isPresented` flag cannot, so at most one
 * "Account already exists" is up. Module state is enough: only one Create Account sheet exists at a time.
 */
const existingAccountAlert = { open: false };

/** Test seam: forget an alert a test left up. */
export function resetExistingAccountAlert() {
  existingAccountAlert.open = false;
}

/** `.alert("Account already exists")` (:728-737), with **No** and **Yes, reset password**. */
function presentExistingAccount(onReset: () => void) {
  if (existingAccountAlert.open) return;
  existingAccountAlert.open = true;
  const close = () => {
    existingAccountAlert.open = false;
  };
  Alert.alert(
    EXISTING_ACCOUNT_TITLE,
    EXISTING_ACCOUNT_MESSAGE,
    [
      { text: 'No', style: 'cancel', onPress: close },
      {
        text: 'Yes, reset password',
        onPress: () => {
          close();
          onReset();
        },
      },
    ],
    { cancelable: true, onDismiss: close },
  );
}

export default function SignUp() {
  // Password fields: a bug report opened here would take no screenshot (BugReportCoordinator.swift:55-59).
  useSecureScreen();
  // `presentation: 'modal'`, so the dark backgrounds elevate (see useTheme).
  const theme = useTheme({ elevated: true });
  const insets = useSafeAreaInsets();
  const android = Platform.OS === 'android';
  // The field being edited: Android borders its box in the focus accent (docs/android-polish.md §11).
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const blurField = (name: string) => setFocusedField((current) => (current === name ? null : current));
  const signUp = useSignUp();

  const {
    control,
    handleSubmit,
    setError,
    clearErrors,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { name: '', email: '', password: '', confirmation: '' },
    mode: 'onSubmit',
  });

  const [name, email, password, confirmation] = useWatch({ control, name: ['name', 'email', 'password', 'confirmation'] });
  // `checkingSignup` (:595): account-exists, the security check and registering. Since Phase 14 the button
  // says "Creating Account…" for all of it (`model.busy || checkingSignup`, :698-700).
  const [checking, setChecking] = useState(false);
  const working = checking || signUp.isPending;
  // `canCreate` (:752-754).
  const canCreate = !working && name.trim().length > 0 && email.includes('@') && password.length > 0 && utf8Length(password) <= MAX_PASSWORD_BYTES && password === confirmation;

  // The inline footnote slot: a schema message, or whatever the server said.
  const inlineError = errors.confirmation?.message ?? errors.password?.message ?? errors.email?.message ?? errors.name?.message ?? errors.root?.message;

  /**
   * **Yes, reset password** clears both passwords and opens Reset password over this sheet with the
   * address filled in (`PasswordResetView(initialEmail: existingEmail ?? email)`).
   */
  const showExistingAccount = (address: string) =>
    presentExistingAccount(() => {
      setValue('password', '');
      setValue('confirmation', '');
      router.push({ pathname: '/reset-password', params: { email: address } });
    });

  /**
   * `checkEmail()` (:759-769), when the email field loses focus: a trimmed, lowercased address with an "@",
   * not while creating. The answer counts only if the field still holds that address. A failure is
   * silent: "Creation retries the check and presents actionable errors."
   */
  const checkEmail = () => {
    const submitted = getValues('email').trim().toLowerCase();
    if (!submitted.includes('@') || checking) return;
    accountExists(submitted)
      .then((exists) => {
        if (exists && getValues('email').trim().toLowerCase() === submitted) showExistingAccount(submitted);
      })
      .catch(() => undefined);
  };

  /**
   * `create()` (:771-796): account-exists, then the security check, then register, all under
   * `checkingSignup`. An existing account (either answer) asks the alert; anything else shows its text.
   */
  const submit = handleSubmit(async (values) => {
    clearErrors('root');
    setChecking(true);
    try {
      if (await accountExists(values.email)) {
        showExistingAccount(values.email);
        return;
      }
      const turnstileToken = await signupChallenge();
      const result = await signUp.mutateAsync({ name: values.name, email: values.email, password: values.password, turnstileToken });
      if (result.kind === 'accountExists') {
        showExistingAccount(result.email);
        return;
      }
      // A server without email verification signs in at registration; the gate takes over.
      if (result.kind === 'signedIn') return;
      const { pending } = result;
      router.push({ pathname: '/verify-email', params: { email: pending.email, reason: pending.reason, ...(pending.verificationProof ? { verificationProof: pending.verificationProof } : {}) } });
    } catch (error) {
      // "Security check cancelled. Tap Create Account to try again.", or the server's own text.
      setError('root', { message: error instanceof Error ? error.message : String(error) });
    } finally {
      setChecking(false);
    }
  });

  const fieldProps = (fieldName: keyof SignUpValues, onBlur: () => void) => ({
    onFocus: () => setFocusedField(fieldName),
    onBlur: () => {
      onBlur();
      blurField(fieldName);
    },
  });

  return (
    <View style={[styles.fill, { backgroundColor: theme.colors.groupedBackground }]}>
      {/* `LinearGradient(colors: [.nexdoBlue.opacity(0.07), .clear, .nexdoPurple.opacity(0.06)], .topLeading → .bottomTrailing)` */}
      <LinearGradient
        colors={[withAlpha(brand.nexdoBlue, 0.07), withAlpha(brand.nexdoIndigo, 0), withAlpha(brand.nexdoPurple, 0.06)]}
        end={{ x: 1, y: 1 }}
        pointerEvents="none"
        start={{ x: 0, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
      <KeyboardAvoidingView behavior="padding" style={styles.fill}>
        <KeyboardAwareScrollView
          contentContainerStyle={styles.scroll}
          keyboardDismissMode={android ? 'on-drag' : 'interactive'}
          keyboardShouldPersistTaps="handled"
          testID="sign-up-scroll"
        >
          <View style={styles.column}>
            {/* `VStack(spacing: 12)`: the mark and "NexDo", then the line under them. */}
            <View style={styles.brandBlock}>
              <View accessibilityLabel="NexDo" accessible style={styles.brandRow}>
                <NexdoLogoMark height={54} width={64} />
                <Text style={[styles.largeTitle, { color: theme.colors.ink }]}>NexDo</Text>
              </View>
              <Text style={[textStyles.subheadline, styles.centered, { color: theme.colors.secondary }]}>Less on your mind. More done in your day.</Text>
            </View>

            <View style={styles.titleBlock}>
              <Text accessibilityRole="header" style={[styles.title, styles.centered, { color: theme.colors.ink }]}>
                Create your account
              </Text>
              <Text style={[textStyles.body, styles.centered, { color: theme.colors.secondary }]}>Your tasks, plans, and everyday life — together.</Text>
            </View>

            <View
              style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: withAlpha(brand.nexdoIndigo, 0.1) }, android ? styles.cardAndroid : styles.cardShadow]}
              testID="sign-up-card"
            >
              <SignupField focused={focusedField === 'name'} icon="person-outline" title="Full name">
                <Controller
                  control={control}
                  name="name"
                  render={({ field }) => (
                    <TextInput
                      underlineColorAndroid="transparent"
                      accessibilityLabel="Full name"
                      placeholder="Your name"
                      placeholderTextColor={theme.colors.placeholder}
                      value={field.value}
                      onChangeText={field.onChange}
                      {...fieldProps('name', field.onBlur)}
                      textContentType="name"
                      autoComplete="name"
                      returnKeyType="next"
                      style={[inputText(theme.typography.body), styles.input, { color: theme.colors.ink }]}
                    />
                  )}
                />
              </SignupField>

              <SignupField focused={focusedField === 'email'} icon="mail-outline" title="Email address">
                <Controller
                  control={control}
                  name="email"
                  render={({ field }) => (
                    <TextInput
                      underlineColorAndroid="transparent"
                      accessibilityLabel="Email address"
                      placeholder="you@example.com"
                      placeholderTextColor={theme.colors.placeholder}
                      value={field.value}
                      onChangeText={field.onChange}
                      {...fieldProps('email', () => {
                        field.onBlur();
                        // `.onChange(of: emailFocused) { if !focused { checkEmail() } }` (:727)
                        checkEmail();
                      })}
                      keyboardType="email-address"
                      textContentType="username"
                      autoComplete="email"
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="next"
                      style={[inputText(theme.typography.body), styles.input, { color: theme.colors.ink }]}
                      testID="sign-up-email"
                    />
                  )}
                />
              </SignupField>

              <SignupField focused={focusedField === 'password'} icon="lock-closed-outline" title="Password">
                <Controller
                  control={control}
                  name="password"
                  render={({ field }) => (
                    <RevealablePasswordField
                      title="Password"
                      autoComplete="new-password"
                      value={field.value}
                      onChangeText={field.onChange}
                      {...fieldProps('password', field.onBlur)}
                      returnKeyType="next"
                    />
                  )}
                />
              </SignupField>

              <SignupField focused={focusedField === 'confirmation'} icon="shield-checkmark-outline" title="Confirm password">
                <Controller
                  control={control}
                  name="confirmation"
                  render={({ field }) => (
                    <RevealablePasswordField
                      title="Confirm password"
                      autoComplete="new-password"
                      value={field.value}
                      onChangeText={field.onChange}
                      {...fieldProps('confirmation', field.onBlur)}
                      returnKeyType="go"
                      onSubmitEditing={() => {
                        if (canCreate) void submit();
                      }}
                    />
                  )}
                />
              </SignupField>
            </View>

            {/* `Label(…, systemImage: "lock.shield")`, footnote, secondary. */}
            <View style={styles.policy}>
              <Ionicons color={theme.colors.secondary} name="shield-half-outline" size={14} style={styles.policyIcon} />
              <Text style={[textStyles.footnote, styles.policyText, { color: theme.colors.secondary }]}>We protect your password and never store a readable copy.</Text>
            </View>

            {inlineError ? (
              <Text accessibilityLiveRegion="polite" style={[textStyles.footnote, { color: theme.colors.danger }]} testID="sign-up-error">
                {inlineError}
              </Text>
            ) : null}
          </View>
        </KeyboardAwareScrollView>

        {/* `.safeAreaInset(edge: .bottom)` with `.background(.regularMaterial)` (:695-725). */}
        <View style={[styles.bar, { backgroundColor: theme.colors.barSurface, paddingBottom: 8 + insets.bottom }, androidBar(theme)]} testID="sign-up-bar">
          <View style={styles.barColumn}>
            <Pressable
              accessibilityLabel={working ? 'Creating Account…' : 'Create Account'}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canCreate, busy: working }}
              disabled={!canCreate}
              onPress={() => void submit()}
              testID="sign-up-submit"
            >
              {canCreate || working ? (
                <LinearGradient colors={BUTTON_GRADIENT} end={{ x: 1, y: 0.5 }} start={{ x: 0, y: 0.5 }} style={styles.button}>
                  <ButtonLabel color={theme.colors.onTint} working={working} />
                </LinearGradient>
              ) : (
                <View style={[styles.button, { backgroundColor: theme.colors.tertiaryFill }]} testID="sign-up-submit-disabled">
                  <ButtonLabel color={theme.colors.secondary} working={false} />
                </View>
              )}
            </Pressable>
            <Pressable
              accessibilityLabel="Already have an account? Sign In"
              accessibilityRole="button"
              accessibilityState={{ disabled: working }}
              disabled={working}
              onPress={() => router.back()}
              style={styles.signIn}
              testID="sign-up-sign-in"
            >
              <Text style={[textStyles.subheadline, { color: theme.colors.secondary }]}>
                Already have an account? <Text style={[textStyles.subheadline, { color: theme.colors.link }]}>Sign In</Text>
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

/** The button's content: a spinner and "Creating Account…", or "Create Account" and an arrow. */
function ButtonLabel({ color, working }: { color: string; working: boolean }) {
  return (
    <View style={styles.buttonLabel}>
      {working ? <ActivityIndicator color={color} size="small" /> : null}
      <Text style={[styles.headline, { color }]}>{working ? 'Creating Account…' : 'Create Account'}</Text>
      {working ? null : <Ionicons color={color} name="arrow-forward" size={20} />}
    </View>
  );
}

/**
 * `signupField(_:icon:content:)` (:739-750): a caption over a rounded field with an indigo icon. On Android
 * the icon and the focus border take the accent, which is the brand indigo in light and the readable blue
 * in dark (docs/android-polish.md §6, §7).
 */
function SignupField({ title, icon, focused, children }: { title: string; icon: React.ComponentProps<typeof Ionicons>['name']; focused: boolean; children: ReactNode }) {
  const theme = useTheme({ elevated: true });
  const android = Platform.OS === 'android';
  return (
    <View style={styles.field}>
      <Text accessibilityElementsHidden importantForAccessibility="no" style={[styles.fieldTitle, { color: theme.colors.ink }]}>
        {title}
      </Text>
      <View
        // `nexdoSecondary.opacity(0.15)`: the field hairline, `fieldBorder` in both schemes.
        style={[styles.fieldBox, { backgroundColor: theme.colors.tertiaryGrouped, borderColor: android && focused ? theme.colors.accent : theme.colors.fieldBorder }]}
        testID={`sign-up-field-${icon}`}
      >
        <View style={styles.fieldIcon}>
          <Ionicons color={android ? theme.colors.accent : brand.nexdoIndigo} name={icon} size={20} />
        </View>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // `.padding(.horizontal, 24).padding(.top, 12).padding(.bottom, 24)`, then capped at 560 and centred.
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 24 },
  column: { width: '100%', maxWidth: 560, alignSelf: 'center', gap: 24 },
  brandBlock: { alignItems: 'center', gap: 12 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  largeTitle: { ...textStyles.largeTitle, fontWeight: '700' },
  titleBlock: { alignItems: 'center', gap: 8 },
  // `.font(.title.bold())`
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  centered: { textAlign: 'center' },
  // `VStack(spacing: 18).padding(20)`, radius 28, an indigo hairline and a soft shadow.
  card: { gap: 18, padding: 20, borderRadius: 28, borderWidth: 1 },
  cardShadow: { shadowColor: '#000000', shadowOpacity: 0.04, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
  cardAndroid: { elevation: 1 },
  field: { gap: 8 },
  // `.font(.subheadline.weight(.semibold))`
  fieldTitle: { ...textStyles.subheadline, fontWeight: '600' },
  // `HStack(spacing: 12).padding(.horizontal, 14).padding(.vertical, 14)`, radius 14.
  fieldBox: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, minHeight: 52, borderRadius: 14, borderWidth: 1 },
  fieldIcon: { width: 24, alignItems: 'center' },
  input: { flex: 1, paddingVertical: 14 },
  policy: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  policyIcon: { marginTop: 3 },
  policyText: { flex: 1 },
  // `.padding(.horizontal, 24).padding(.top, 14).padding(.bottom, 8)`
  bar: { paddingHorizontal: 24, paddingTop: 14 },
  barColumn: { width: '100%', maxWidth: 560, alignSelf: 'center', gap: 8 },
  // `.frame(maxWidth: .infinity, minHeight: 56)`, radius 18.
  button: { minHeight: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  buttonLabel: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  signIn: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
