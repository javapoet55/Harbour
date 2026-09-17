import { useState, type Ref } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { inputText, useTheme } from '../theme';

export type RevealablePasswordFieldProps = Omit<TextInputProps, 'secureTextEntry'> & {
  /** Doubles as the placeholder and the accessibility label, as in Swift. */
  title: string;
  /** `.textContentType(.newPassword)` in Swift; sign-in overrides it to `.password`. */
  textContentType?: TextInputProps['textContentType'];
  /** Lets the previous field move focus here, standing in for SwiftUI's `@FocusState`. */
  ref?: Ref<TextInput>;
};

/**
 * Port of `RevealablePasswordField` (ios/App/RootView.swift:642–672): a secure field with an eye
 * toggle. The toggle is a 44x44 `.title3` button in `Color.nexdoSecondary`.
 */
export function RevealablePasswordField({ title, textContentType = 'newPassword', style, ref, ...rest }: RevealablePasswordFieldProps) {
  const theme = useTheme();
  const [visible, setVisible] = useState(false);

  return (
    <View style={styles.row}>
      <TextInput
        // Android draws its own underline drawable behind a TextInput; it showed
        // as a pale hard-edged box inside the glass card.
        underlineColorAndroid="transparent"
        ref={ref}
        accessibilityLabel={title}
        placeholder={title}
        placeholderTextColor={theme.colors.placeholder}
        secureTextEntry={!visible}
        textContentType={textContentType}
        // Revealing a password must not autocapitalise or autocorrect it (RootView.swift:648–650).
        autoCapitalize="none"
        autoCorrect={false}
        style={[inputText(theme.typography.body), styles.input, { color: theme.colors.ink }, style]}
        {...rest}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={visible ? 'Hide password' : 'Show password'}
        onPress={() => setVisible((current) => !current)}
        style={styles.toggle}
      >
        <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={20} color={theme.colors.secondary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // HStack(spacing: 8)
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { flex: 1, paddingVertical: 0 },
  toggle: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
