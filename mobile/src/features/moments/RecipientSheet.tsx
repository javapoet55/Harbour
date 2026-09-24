import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { withAlpha } from '../../components/SignInBackdrop';
import { Text } from '../../components/Text';
import { androidChip, androidChipScroll, brand, textStyles, useTheme } from '../../theme';
import { MomentSheet } from './components';
import { recipientProblem, sameEmail, samePhone, type RecipientDraft } from './domain';
import { FormButton, FormField, FormRow, FormScroll, FormSection, FormText } from './form';

/**
 * What the sheet opens with. `choices` are the picked contact's numbers and emails (already deduped by
 * `contactChoice`); they appear as quick choices under a field when the contact has more than one.
 */
export type RecipientSheetRequest = {
  mode: 'add' | 'edit';
  draft: RecipientDraft;
  choices: { phones: string[]; emails: string[] } | null;
};

/**
 * Add or edit one recipient (Android): Name, Phone and Email, pre-filled from the picked contact and
 * always editable. Create Moment's Recipients list and Manage Moment's Add Contact, Enter recipient
 * manually and Edit recipient all use it.
 *
 * As on iOS (`RecipientSheet.swift`, 94a2ecd), "Add" / "Save" is always enabled: pressing it with a
 * missing or invalid field, or a person already in `others`, shows why under the fields instead of
 * closing, and the message clears as soon as a field changes.
 */
export function RecipientSheet({
  request,
  others,
  onCancel,
  onSubmit,
}: {
  request: RecipientSheetRequest | null;
  others: RecipientDraft[];
  onCancel: () => void;
  onSubmit: (draft: RecipientDraft) => void;
}) {
  return (
    <MomentSheet visible={request !== null} title="" onRequestClose={onCancel} right={{ title: 'Cancel', onPress: onCancel, testID: 'recipient-sheet-cancel' }} testID="recipient-sheet">
      {/* Keyed on the person, so every opening starts from its own values. */}
      {request ? <RecipientForm key={`${request.mode}:${request.draft.key}`} request={request} others={others} onSubmit={onSubmit} /> : null}
    </MomentSheet>
  );
}

function RecipientForm({ request, others, onSubmit }: { request: RecipientSheetRequest; others: RecipientDraft[]; onSubmit: (draft: RecipientDraft) => void }) {
  const theme = useTheme();
  const [name, setName] = useState(request.draft.name);
  const [phone, setPhone] = useState(request.draft.phone);
  const [email, setEmail] = useState(request.draft.email);
  const [problem, setProblem] = useState<string | null>(null);
  const editing = request.mode === 'edit';
  // `.onChange(of: [draft.name, draft.phone, draft.email]) { issue = nil }`
  const edit = (set: (value: string) => void) => (value: string) => {
    set(value);
    setProblem(null);
  };

  const submit = () => {
    const next = { ...request.draft, name: name.trim(), phone: phone.trim(), email: email.trim() };
    const issue = recipientProblem(next, others);
    setProblem(issue);
    if (!issue) onSubmit(next);
  };

  const choices = (values: string[], current: string, same: (a: string, b: string) => boolean, pick: (value: string) => void, label: string, testID: string) =>
    values.length > 1 ? (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" {...androidChipScroll(16)} testID={testID}>
        {values.map((value, index) => {
          const selected = same(value, current);
          return (
            <Pressable
              key={`${index}:${value}`}
              accessibilityRole="button"
              accessibilityLabel={`${label} ${value}`}
              accessibilityState={{ selected }}
              onPress={() => pick(value)}
              style={[
                styles.chip,
                androidChip,
                selected
                  ? { backgroundColor: withAlpha(brand.nexdoIndigo, 0.12), borderColor: theme.colors.link }
                  : { backgroundColor: theme.colors.surface, borderColor: withAlpha(brand.nexdoIndigo, 0.16) },
              ]}
              testID={`${testID}-${index}`}
            >
              <Text style={[textStyles.subheadline, { color: selected ? theme.colors.link : theme.colors.label }]}>{value}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    ) : null;

  return (
    <FormScroll>
      <Text style={[textStyles.largeTitle, styles.bold, styles.title, { color: theme.colors.label }]}>{editing ? 'Edit Recipient' : 'Add Recipient'}</Text>
      <FormSection footer="Add a phone number, an email, or both.">
        <FormRow>
          <FormField placeholder="Name" value={name} onChangeText={edit(setName)} autoCapitalize="words" testID="recipient-sheet-name" />
        </FormRow>
        <FormRow>
          <View style={styles.stack}>
            <FormField placeholder="Phone" keyboardType="phone-pad" value={phone} onChangeText={edit(setPhone)} testID="recipient-sheet-phone" />
            {choices(request.choices?.phones ?? [], phone, samePhone, edit(setPhone), 'Use phone', 'recipient-sheet-phone-choice')}
          </View>
        </FormRow>
        <FormRow last>
          <View style={styles.stack}>
            <FormField placeholder="Email" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} value={email} onChangeText={edit(setEmail)} testID="recipient-sheet-email" />
            {choices(request.choices?.emails ?? [], email, sameEmail, edit(setEmail), 'Use email', 'recipient-sheet-email-choice')}
          </View>
        </FormRow>
      </FormSection>
      {problem ? (
        <View style={styles.note}>
          <FormText tone="danger" testID="recipient-sheet-error">
            {problem}
          </FormText>
        </View>
      ) : null}
      <FormSection>
        <FormRow last>
          <FormButton title={editing ? 'Save' : 'Add'} onPress={submit} testID="recipient-sheet-submit" />
        </FormRow>
      </FormSection>
    </FormScroll>
  );
}

const styles = StyleSheet.create({
  bold: { fontWeight: '700' },
  title: { marginHorizontal: 16, marginTop: 4 },
  stack: { gap: 8 },
  chip: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, justifyContent: 'center' },
  note: { marginHorizontal: 32, marginTop: 12 },
});
