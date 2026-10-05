import { useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { isValidRecipient, type TaskActionRecipient } from '../lib/actionNeeded';
import { androidGroup, androidSeparator } from '../theme/androidForm';
import { useTheme } from '../theme';
import { Text } from './Text';

/**
 * The "Contact details" sheet on the Nexdo Action screen (ios/App/TaskActionView.swift:270-290): a
 * `Form` of Name, Phone number and Email, Cancel and Save in the toolbar. Save stays disabled until
 * `TaskActionRecipient.isValid`; the caption explains why while it is.
 *
 * Mount it when it opens: the fields start from `initial`, as Swift refills them on every
 * "Enter contact details" tap (`:180-183`).
 */
export function ActionContactDetailsSheet({
  visible,
  initial,
  onCancel,
  onSave,
}: {
  visible: boolean;
  initial: TaskActionRecipient;
  onCancel: () => void;
  /** The trimmed details. */
  onSave: (recipient: TaskActionRecipient) => void;
}) {
  const theme = useTheme({ elevated: true });
  const [name, setName] = useState(initial.name);
  const [phone, setPhone] = useState(initial.phone);
  const [email, setEmail] = useState(initial.email);

  const valid = isValidRecipient({ name, phone, email });
  const field = [styles.field, { color: theme.colors.ink }];

  return (
    <Modal
      animationType="slide"
      onRequestClose={onCancel}
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined}
      visible={visible}
    >
      <SafeAreaView edges={Platform.OS === 'ios' ? ['left', 'right', 'bottom'] : ['top', 'left', 'right', 'bottom']} style={[styles.fill, { backgroundColor: theme.colors.groupedBackground }]}>
        <View style={styles.navBar}>
          <Pressable accessibilityRole="button" hitSlop={8} onPress={onCancel} testID="contact-details-cancel">
            <Text style={[styles.body, { color: theme.colors.link }]}>Cancel</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !valid }}
            disabled={!valid}
            hitSlop={8}
            onPress={() => onSave({ name: name.trim(), phone: phone.trim(), email: email.trim() })}
            testID="contact-details-save"
          >
            <Text style={[styles.body, styles.semibold, { color: valid ? theme.colors.link : theme.colors.placeholder }]}>Save</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* `.navigationTitle("Contact details")` with no `.inline`: a large title over the form
              (`task-action-contact-details`), not a bar title. */}
          <Text accessibilityRole="header" style={[styles.largeTitle, { color: theme.colors.label }]}>
            Contact details
          </Text>
          {/* A `Form` section: one inset card, rows split by hairlines. */}
          <View style={[styles.group, { backgroundColor: theme.colors.surface }, androidGroup(theme)]}>
            <TextInput
              accessibilityLabel="Name"
              onChangeText={setName}
              placeholder="Name"
              placeholderTextColor={theme.colors.placeholder}
              style={field}
              testID="contact-details-name"
              value={name}
            />
            <View style={[styles.separator, { backgroundColor: theme.colors.separator }, androidSeparator(theme)]} />
            <TextInput
              accessibilityLabel="Phone number"
              keyboardType="phone-pad"
              onChangeText={setPhone}
              placeholder="Phone number"
              placeholderTextColor={theme.colors.placeholder}
              style={field}
              testID="contact-details-phone"
              value={phone}
            />
            <View style={[styles.separator, { backgroundColor: theme.colors.separator }, androidSeparator(theme)]} />
            <TextInput
              accessibilityLabel="Email"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder="Email"
              placeholderTextColor={theme.colors.placeholder}
              style={field}
              testID="contact-details-email"
              value={email}
            />
            {!valid ? (
              <>
                <View style={[styles.separator, { backgroundColor: theme.colors.separator }, androidSeparator(theme)]} />
                <Text style={[styles.caption, { color: theme.colors.ink }]} testID="contact-details-invalid">
                  Enter a name and a valid phone number or email address.
                </Text>
              </>
            ) : null}
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { fontSize: 17, lineHeight: 22 },
  semibold: { fontWeight: '600' },
  caption: { fontSize: 12, lineHeight: 16, paddingHorizontal: 16, paddingVertical: 12 },
  navBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 },
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: '700', marginBottom: 8 },
  content: { padding: 20, paddingTop: 0 },
  group: { borderRadius: 12, overflow: 'hidden' },
  field: { fontSize: 17, minHeight: 44, paddingHorizontal: 16, paddingVertical: 11 },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 16 },
});
