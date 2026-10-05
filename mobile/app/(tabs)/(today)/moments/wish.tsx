import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '../../../../src/components/Text';
import { TodayBackdrop } from '../../../../src/components/TodayShell';
import { BorderedButton, ErrorText, MomentCard, MomentPrimary, MomentSheet } from '../../../../src/features/moments/components';
import { momentLabel } from '../../../../src/features/moments/dates';
import { canSendMessage, copyText, openMessages } from '../../../../src/features/moments/device';
import { capitalized, composerPlanAction, HISTORY_STATUSES, momentForPlan, planDate, planEditable, planStatusLabel } from '../../../../src/features/moments/domain';
import { DateField, FormButton, FormRow, FormScroll, FormSection, FormText, LabeledValue } from '../../../../src/features/moments/form';
import { findPlan } from '../../../../src/features/moments/handoff';
import { momentsStore, useMomentList, useMoments } from '../../../../src/features/moments/store';
import { WishEmailConfirmation } from '../../../../src/features/moments/WishEmailConfirmation';
import { textStyles, useTheme } from '../../../../src/theme';

/**
 * `WishPlanView` (ios/App/ImportantMomentsView.swift:519-583): one wish's delivery, always read back
 * from the latest snapshot (`current`). Edit Schedule, "Review & Open Messages" for a Messages wish
 * awaiting you, "Send email now", Retry for a failed automatic email, and Cancel behind a
 * confirmation; for a "Check Sent mail" email, "I found it in Sent mail" / "It wasn't sent"; for a
 * delivered wish, Copy message and Reuse next year.
 *
 * `confirmation` is the form Schedule Wish pushes: "Wish scheduled" and the calendar tick.
 */
export default function WishDetailsScreen() {
  const theme = useTheme();
  const { planId, confirmation } = useLocalSearchParams<{ planId?: string; confirmation?: string }>();
  const moments = useMomentList();
  const error = useMoments((state) => state.error);
  const account = useMoments((state) => state.snapshot?.emailAccount?.email);
  const current = findPlan(planId);
  const [sendEmailNow, setSendEmailNow] = useState(false);
  const [changing, setChanging] = useState(false);
  const [date, setDate] = useState(() => Date.now() + 3_600_000);
  const [openedAt, setOpenedAt] = useState(() => Date.now());
  if (!current) return null;
  const confirming = confirmation === '1';
  const moment = momentForPlan(moments, current);

  const cancel = () =>
    Alert.alert('Cancel this wish?', undefined, [
      { text: 'Cancel wish', style: 'destructive', onPress: () => void momentsStore.getState().perform(() => momentsStore.getState().planAction(current, 'cancel')) },
      { text: 'Cancel', style: 'cancel' },
    ]);

  const reviewAndOpen = async () => {
    if (!(await canSendMessage())) {
      momentsStore.getState().setError('Messages is not available on this device.');
      return;
    }
    const result = await openMessages(current.recipient, current.body);
    const action = composerPlanAction(result);
    if (action) {
      await momentsStore.getState().perform(() => momentsStore.getState().planAction(current, action));
    }
  };

  return (
    <View style={styles.fill}>
      <TodayBackdrop />
      <ScrollView contentContainerStyle={styles.content} testID="wish-details">
        <View style={styles.hero}>
          <Ionicons name={confirming ? 'calendar' : 'gift'} size={76} color={theme.colors.link} />
        </View>
        <Text style={[textStyles.largeTitle, styles.bold, styles.center, { color: theme.colors.label }]} testID="wish-title">
          {confirming && ['SCHEDULED', 'AWAITING_CONFIRMATION'].includes(current.status) ? 'Wish scheduled' : planStatusLabel(current)}
        </Text>
        <Text style={[textStyles.body, styles.center, { color: theme.colors.label }]}>
          {current.status === 'SENT'
            ? 'Your wish was submitted successfully.'
            : current.status === 'CANCELLED'
              ? 'This wish will not be sent.'
              : current.automaticDelivery && current.status === 'SCHEDULED'
                ? 'Approved email will send automatically at the scheduled time.'
                : current.status === 'AWAITING_CONFIRMATION' && current.channel === 'messages'
                  ? 'Your wish and schedule are saved. Open Messages and tap Send when you are ready; Messages wishes are not sent automatically.'
                  : 'Review the delivery status below.'}
        </Text>
        <View style={styles.stretch}>
          <MomentCard>
            <Text style={[textStyles.title2, styles.bold, { color: theme.colors.label }]}>{current.subject}</Text>
            {/* `Label(current.recipient, systemImage:)` (:537): phone.fill, envelope.fill or person.fill. */}
            <View style={styles.label}>
              <Ionicons
                name={current.channel === 'messages' ? 'call' : current.channel === 'email' ? 'mail' : 'person'}
                size={17}
                color={theme.colors.link}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                testID="wish-recipient-icon"
              />
              <Text style={[textStyles.body, styles.labelText, { color: theme.colors.label }]}>{current.recipient}</Text>
            </View>
            <View style={[styles.divider, { backgroundColor: theme.colors.separator }]} />
            <LabeledValue label="Delivery" value={capitalized(current.channel)} />
            <LabeledValue label="Send time" value={momentLabel(planDate(current), current.timeZoneID)} />
            <LabeledValue label="Time zone" value={current.timeZoneID} />
            <LabeledValue label="Reminder" value={current.reminderOffset === 60 ? '1 hour before' : 'At scheduled time'} />
            <LabeledValue label="Repeat" value={current.repeatYearly ? 'Yearly' : 'Once'} />
            <Text style={[textStyles.body, styles.body, { color: theme.colors.label }]}>{current.body}</Text>
            {current.status === 'EXPIRED' ? (
              <ErrorText>This wish expired 24 hours after its scheduled send time because delivery was not confirmed. Create a new wish to send it.</ErrorText>
            ) : current.lastError ? (
              <ErrorText>{current.lastError}</ErrorText>
            ) : null}
          </MomentCard>
        </View>
        {planEditable(current) ? (
          <>
            <BorderedButton
              centered
              title="Edit Schedule"
              onPress={() => {
                const now = Date.now();
                setOpenedAt(now);
                setDate(Math.max(planDate(current), now + 60_000));
                setChanging(true);
              }}
              testID="wish-edit-schedule"
            />
            {current.status === 'AWAITING_CONFIRMATION' && current.channel === 'messages' ? (
              <BorderedButton centered prominent title="Review & Open Messages" onPress={() => void reviewAndOpen()} testID="wish-open-messages" />
            ) : null}
            {current.channel === 'email' ? (
              <Pressable accessibilityRole="button" onPress={() => setSendEmailNow(true)} testID="wish-send-now">
                <Text style={[textStyles.body, { color: theme.colors.link }]}>Send email now</Text>
              </Pressable>
            ) : null}
            {current.status === 'FAILED' && current.automaticDelivery ? (
              <Pressable accessibilityRole="button" onPress={() => void momentsStore.getState().perform(() => momentsStore.getState().planAction(current, 'retry'))} testID="wish-retry">
                <Text style={[textStyles.body, { color: theme.colors.link }]}>Retry after reconnecting</Text>
              </Pressable>
            ) : null}
            <Pressable accessibilityRole="button" onPress={cancel} testID="wish-cancel">
              <Text style={[textStyles.body, { color: theme.colors.danger }]}>Cancel scheduled wish</Text>
            </Pressable>
          </>
        ) : null}
        {current.status === 'UNCERTAIN' ? (
          <>
            {/* :557-561 — a secondary footnote, a `.bordered` "found it", and a plain "wasn't sent". */}
            <Text style={[textStyles.footnote, styles.center, { color: theme.colors.secondaryLabel }]}>Check the Sent folder in Gmail, then tell Nexdo what happened.</Text>
            <BorderedButton centered title="I found it in Sent mail" onPress={() => void momentsStore.getState().perform(() => momentsStore.getState().planAction(current, 'sent'))} testID="wish-uncertain-sent" />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="It wasn't sent"
              onPress={() => void momentsStore.getState().perform(() => momentsStore.getState().planAction(current, 'failed'))}
              testID="wish-uncertain-failed"
            >
              <Text style={[textStyles.body, { color: theme.colors.link }]}>It wasn&apos;t sent</Text>
            </Pressable>
          </>
        ) : null}
        {HISTORY_STATUSES.includes(current.status) ? (
          <>
            <Pressable accessibilityRole="button" onPress={() => void copyText(current.body)} testID="wish-copy">
              <Text style={[textStyles.body, { color: theme.colors.link }]}>Copy message</Text>
            </Pressable>
            {moment ? (
              <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/moments/review', params: { id: moment.id } })} testID="wish-reuse">
                <Text style={[textStyles.body, { color: theme.colors.link }]}>Reuse next year</Text>
              </Pressable>
            ) : null}
          </>
        ) : null}
        {error ? <ErrorText testID="wish-error">{error}</ErrorText> : null}
        <View style={styles.stretch}>
          <MomentPrimary title="Done" onPress={() => router.back()} testID="wish-done" />
        </View>
      </ScrollView>

      <WishEmailConfirmation
        visible={sendEmailNow}
        account={account ?? 'No connected account'}
        recipient={current.recipient}
        subject={current.subject}
        message={current.body}
        onCancel={() => setSendEmailNow(false)}
        onConfirm={() => {
          setSendEmailNow(false);
          void momentsStore.getState().perform(() => momentsStore.getState().planAction(current, 'sendNow'));
        }}
      />

      {/* `.sheet(isPresented: $changing)` (:545): a Form titled "Edit Schedule" with Close. */}
      <MomentSheet visible={changing} title="" onRequestClose={() => setChanging(false)} right={{ title: 'Close', onPress: () => setChanging(false), testID: 'wish-edit-close' }} testID="wish-edit-sheet">
        <FormScroll>
          <Text style={[textStyles.largeTitle, styles.bold, styles.sheetTitle, { color: theme.colors.label }]}>Edit Schedule</Text>
          <FormSection>
            <FormRow>
              <DateField includeTime label="New time" value={date} onChange={setDate} zone={current.timeZoneID} minimum={openedAt} testID="wish-new-time" />
            </FormRow>
            <FormRow last={!error}>
              <FormButton
                title="Save schedule"
                onPress={() =>
                  void momentsStore.getState().perform(async () => {
                    await momentsStore.getState().planAction(current, 'reschedule', date);
                    setChanging(false);
                  })
                }
                testID="wish-save-schedule"
              />
            </FormRow>
            {error ? (
              <FormRow last>
                <FormText tone="danger">{error}</FormText>
              </FormRow>
            ) : null}
          </FormSection>
        </FormScroll>
      </MomentSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: 18, gap: 20, alignItems: 'center', paddingBottom: 60 },
  hero: { padding: 20 },
  stretch: { alignSelf: 'stretch' },
  center: { textAlign: 'center' },
  bold: { fontWeight: '700' },
  divider: { height: StyleSheet.hairlineWidth },
  // SwiftUI `Label`: the icon, then the title, centred on one line.
  label: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  labelText: { flexShrink: 1 },
  body: { marginTop: 8 },
  // Just under the sheet's bar (FormScroll's top padding is 3 since UI-parity pass 2).
  sheetTitle: { marginHorizontal: 16, marginTop: 4 },
});
