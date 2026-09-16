import { useEffect, useState } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';

export type AppleCredential = {
  authorizationCode: string;
  rawNonce: string;
  givenName?: string;
  familyName?: string;
};

export type AppleSignInButtonProps = {
  onCredential: (credential: AppleCredential) => void;
  /** Shown for anything except the person cancelling, matching `handleApple` in Swift. */
  onError: (message: string) => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * Port of the `SignInWithAppleButton` block in `SignInView` (ios/App/RootView.swift:392–405) and
 * `handleApple` (RootView.swift:449–469).
 *
 * The nonce handling matches Swift exactly: a raw UUID is kept, its SHA-256 hex digest goes to Apple
 * in the request, and the RAW value is what the server receives to check against the token.
 *
 * Renders nothing unless `AppleAuthentication.isAvailableAsync()` resolves true, so Android and any
 * iOS version without Sign in with Apple simply do not show it. The Android web fallback is a later
 * phase (docs/IOS_TO_REACT_NATIVE.md section 8).
 */
export function AppleSignInButton({ onCredential, onError, disabled = false, style }: AppleSignInButtonProps) {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let active = true;
    AppleAuthentication.isAvailableAsync()
      .then((value) => {
        if (active) setAvailable(value);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  if (!available) return null;

  const start = async () => {
    // RootView.swift:393–396: a fresh nonce per attempt; Apple receives only its digest.
    const rawNonce = Crypto.randomUUID();
    const nonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
        nonce,
      });
      if (!credential.authorizationCode) {
        onError('Apple did not return a complete authorization. Please try again.');
        return;
      }
      onCredential({
        authorizationCode: credential.authorizationCode,
        rawNonce,
        // Apple sends the name only on the very first authorization, exactly as on iOS.
        givenName: credential.fullName?.givenName ?? undefined,
        familyName: credential.fullName?.familyName ?? undefined,
      });
    } catch (error) {
      // RootView.swift:467: a cancellation is silent.
      if (error instanceof Error && 'code' in error && error.code === 'ERR_REQUEST_CANCELED') return;
      onError('Apple sign-in was not completed. Please try again.');
    }
  };

  return (
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
      buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
      cornerRadius={18}
      onPress={disabled ? () => undefined : start}
      style={[styles.button, style]}
    />
  );
}

const styles = StyleSheet.create({
  // .frame(maxWidth: .infinity, minHeight: 58) with a 18pt corner radius.
  // `alignSelf: 'stretch'`, not `width: '100%'`: with a horizontal margin from the caller, a
  // percentage width resolves against the parent and the margin then pushes the button off-screen.
  button: { alignSelf: 'stretch', height: 58 },
});
