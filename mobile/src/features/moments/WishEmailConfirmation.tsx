import { ScrollView, StyleSheet } from 'react-native';

import { Text } from '../../components/Text';
import { textStyles, useTheme } from '../../theme';
import { MomentPrimary, MomentSheet } from './components';
import { LabeledValue } from './form';

/**
 * `WishEmailConfirmation` (ios/App/ImportantMomentsView.swift:596-613): From, To, the subject and the
 * message, then "Send email". Cancel is the cancellation action.
 *
 * Not captured on iOS (it needs a connected Gmail account), so this is built from source only.
 */
export function WishEmailConfirmation({
  visible,
  account,
  recipient,
  subject,
  message,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  account: string;
  recipient: string;
  subject: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const theme = useTheme();
  return (
    <MomentSheet visible={visible} title="Confirm email" onRequestClose={onCancel} left={{ title: 'Cancel', onPress: onCancel, testID: 'email-cancel' }} testID="email-confirmation">
      <ScrollView contentContainerStyle={styles.content}>
        <LabeledValue label="From" value={account} />
        <LabeledValue label="To" value={recipient} />
        <Text style={[textStyles.title2, styles.bold, { color: theme.colors.label }]}>{subject}</Text>
        <Text style={[textStyles.body, { color: theme.colors.label }]}>{message}</Text>
        <MomentPrimary title="Send email" onPress={onConfirm} testID="email-send" />
      </ScrollView>
    </MomentSheet>
  );
}

const styles = StyleSheet.create({
  content: { padding: 24, gap: 20 },
  bold: { fontWeight: '700' },
});
