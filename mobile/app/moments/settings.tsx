import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Alert, Linking, StyleSheet, View } from 'react-native';

import type { ConnectEmailResponse, MomentOK } from '../../src/api/moments';
import { Text } from '../../src/components/Text';
import { connectGmail, contactMomentInput, pickContact } from '../../src/features/moments/device';
import { FormButton, FormLink, FormRow, FormScroll, FormSection, FormText } from '../../src/features/moments/form';
import { momentsStore, reminderStatusText, useMoments } from '../../src/features/moments/store';
import { textStyles, useTheme } from '../../src/theme';

/**
 * `MomentSettingsView` (ios/App/MomentEditor.swift:205-245): the imports, the connected Gmail account,
 * the reminder permission, and "Delete all Important Moments data".
 *
 * The contact import is the SYSTEM PICKER — one person, chosen by the user — never a read of the
 * address book. Its editor opens as a sheet.
 */
export default function MomentSettingsScreen() {
  const theme = useTheme();
  const snapshot = useMoments((state) => state.snapshot);
  const error = useMoments((state) => state.error);
  const busy = useMoments((state) => state.busy);
  const enabling = useMoments((state) => state.enablingReminders);
  const authorization = useMoments((state) => state.reminderAuthorization);
  const statusText = useMoments(reminderStatusText);

  // `.task { await store.prepareDefaultReminders() }`
  useEffect(() => {
    void momentsStore.getState().prepareDefaultReminders();
  }, []);

  const chooseContact = async () => {
    try {
      const contact = await pickContact();
      if (!contact) return;
      const input = await contactMomentInput(contact);
      router.push({ pathname: '/moments/import-editor', params: { imported: JSON.stringify(input) } });
    } catch (caught) {
      momentsStore.getState().setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  const explainContacts = () =>
    Alert.alert(
      'Select one contact',
      'Nexdo will show the selected birthday, first name, phone and email for you to review. Only the details you save will be sent to your Nexdo account.',
      [
        { text: 'Choose contact', onPress: () => void chooseContact() },
        { text: 'Cancel', style: 'cancel' },
      ],
    );

  const connect = () =>
    void momentsStore.getState().perform(async () => {
      const link = await momentsStore.getState().request<ConnectEmailResponse>('connectEmail', {});
      if (!(await connectGmail(link.url))) throw new Error('Email connection cancelled or failed. Try connecting again.');
    });

  const deleteAll = () =>
    Alert.alert('Delete all moments and cancel pending wishes?', undefined, [
      { text: 'Delete all', style: 'destructive', onPress: () => void momentsStore.getState().perform(() => momentsStore.getState().deleteData()) },
      { text: 'Cancel', style: 'cancel' },
    ]);

  const account = snapshot?.emailAccount;
  return (
    <View style={styles.fill} pointerEvents={busy ? 'none' : 'auto'}>
      <FormScroll testID="moments-settings-form">
        <FormSection header="Import only what you choose">
          <FormRow>
            <FormButton title="Choose a contact birthday" onPress={explainContacts} testID="settings-contact" />
          </FormRow>
          <FormRow>
            <FormLink title="Choose calendars and anniversary candidates" onPress={() => router.push('/moments/calendar-import')} testID="settings-calendars" />
          </FormRow>
          <FormRow>
            <FormLink title="Choose festivals" onPress={() => router.push('/moments/festivals')} testID="settings-festivals" />
          </FormRow>
          <FormRow last>
            <FormText caption>No religion or festival preferences are inferred. Imported items require your confirmation before saving.</FormText>
          </FormRow>
        </FormSection>

        <FormSection header="Connected email">
          {account ? (
            <>
              <FormRow>
                <FormText>{account.email}</FormText>
              </FormRow>
              <FormRow>
                <FormText>{account.status}</FormText>
              </FormRow>
              <FormRow>
                <FormButton
                  destructive
                  title="Disconnect email"
                  onPress={() => void momentsStore.getState().perform(() => momentsStore.getState().request<MomentOK>('disconnectEmail', {}).then(() => undefined))}
                  testID="settings-disconnect"
                />
              </FormRow>
            </>
          ) : null}
          <FormRow>
            <FormButton title="Connect / Reconnect Gmail" onPress={connect} disabled={snapshot?.emailConfigured !== true} testID="settings-connect" />
          </FormRow>
          <FormRow last>
            <FormText caption>Authorize sending from your own Gmail account. Scheduled email also requires Nexdo’s backend worker.</FormText>
          </FormRow>
        </FormSection>

        <FormSection header="Notifications">
          <FormRow>
            <View style={styles.inline}>
              <Ionicons name={authorization === 'denied' ? 'notifications-off-outline' : 'notifications-outline'} size={20} color={theme.colors.tint} />
              <Text style={[textStyles.body, styles.grow, { color: theme.colors.label }]} testID="settings-reminder-status">
                {statusText}
              </Text>
            </View>
          </FormRow>
          {enabling ? (
            <FormRow>
              <View style={styles.inline}>
                <ActivityIndicator />
                <FormText tone="secondary">Enabling reminders…</FormText>
              </View>
            </FormRow>
          ) : authorization === 'notDetermined' ? (
            <FormRow>
              <FormButton title="Enable wish reminders" onPress={() => void momentsStore.getState().enableWishReminders()} testID="settings-enable-reminders" />
            </FormRow>
          ) : null}
          <FormRow>
            <FormText caption>Reminders are on by default once you allow iOS notifications. They apply to wishes you schedule; enabling them does not send messages.</FormText>
          </FormRow>
          <FormRow>
            <FormButton title="Open iOS Settings" onPress={() => void Linking.openSettings()} testID="settings-open-settings" />
          </FormRow>
          <FormRow last>
            <FormText caption>Reminders require notifications. Denied or limited Contacts and Calendar access can be changed in iOS Settings.</FormText>
          </FormRow>
        </FormSection>

        <FormSection header="Privacy">
          <FormRow>
            <FormButton destructive title="Delete all Important Moments data" onPress={deleteAll} testID="settings-delete-all" />
          </FormRow>
          <FormRow last>
            <FormText caption>Deletes moments, drafts, delivery history and the connected email credentials. An email already submitted cannot be recalled.</FormText>
          </FormRow>
        </FormSection>
        {error ? (
          <View style={styles.error}>
            <FormText tone="danger" testID="settings-error">
              {error}
            </FormText>
          </View>
        ) : null}
      </FormScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  grow: { flex: 1 },
  error: { marginHorizontal: 32, marginTop: 12 },
});
