import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from './Text';

/**
 * The last line of defence: a rendering error anywhere in the tree shows this instead of a blank
 * screen.
 *
 * WHAT SWIFT SHOWS. SwiftUI cannot recover from a crash, so there is no Swift counterpart to an error
 * boundary. Its only app-wide failure presentation is the alert at `ios/App/RootView.swift:63-65` —
 * title **"Unable to complete request"**, the message, and a single **OK** — so that is the title and
 * shape used here, with OK re-rendering the tree rather than dismissing an alert over a screen that
 * is, in this case, not there.
 *
 * Nothing else is invented: no error reporting service, no stack trace, no "restart the app".
 *
 * This is a class because React offers no hook equivalent of `componentDidCatch`. It cannot use
 * `useTheme`, so its colours are the light palette's own values; a crashed tree cannot be trusted to
 * provide a theme context.
 */
type Props = { children: ReactNode; onError?: (error: Error, info: ErrorInfo) => void };
type State = { error: Error | null };

export class RootErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Development builds already print the red screen; this keeps the component stack with it.
    if (__DEV__) console.error('[nexdo] render error', error, info.componentStack);
    this.props.onError?.(error, info);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <View style={styles.screen} testID="root-error-boundary">
        <Text accessibilityRole="header" style={styles.title}>
          Unable to complete request
        </Text>
        <Text style={styles.message}>{error.message.length > 0 ? error.message : 'Please try again.'}</Text>
        <Pressable
          accessibilityLabel="OK"
          accessibilityRole="button"
          onPress={() => this.setState({ error: null })}
          style={styles.button}
          testID="root-error-ok"
        >
          <Text style={styles.buttonLabel}>OK</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, backgroundColor: '#FFFFFF' },
  title: { fontSize: 20, lineHeight: 25, fontWeight: '700', color: '#080F2E', textAlign: 'center' },
  message: { fontSize: 15, lineHeight: 20, color: '#575C80', textAlign: 'center' },
  button: { minHeight: 44, paddingHorizontal: 32, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#3D29F0' },
  buttonLabel: { fontSize: 17, lineHeight: 22, color: '#FFFFFF' },
});
