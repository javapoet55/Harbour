import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '../../src/components/Text';
import { TodayBackdrop } from '../../src/components/TodayShell';
import { BorderedButton, ErrorText, MomentCard, MomentPrimary, MomentSheet } from '../../src/features/moments/components';
import { momentLabel } from '../../src/features/moments/dates';
import { canSendMessage, copyText, openMessages } from '../../src/features/moments/device';
import { capitalized, HISTORY_STATUSES, momentForPlan, planDate, planEditable, planStatusLabel } from '../../src/features/moments/domain';
import { DateField, FormButton, FormRow, FormScroll, FormSection, FormText, LabeledValue } from '../../src/features/moments/form';
import { findPlan } from '../../src/features/moments/handoff';
import { momentsStore, useMomentList, useMoments } from '../../src/features/moments/store';
import { WishEmailConfirmation } from '../../src/features/moments/WishEmailConfirmation';
import { brand, textStyles, useTheme } from '../../src/theme';

/**
 * `WishPlanView` (ios/App/ImportantMomentsView.swift:495-551): one wish's delivery, always read back
 * from the latest snapshot (`current`). Edit Schedule, "Review & Open Messages" for a Messages wish
 * awaiting you, "Send email now", Retry for a failed automatic email, and Cancel behind a
 * confirmation; for a delivered wish, Copy message and Reuse next year.
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
    if (result !== 'cancelled') {
      await momentsStore.getState().perform(() => momentsStore.getState().planAction(current, result === 'submitted' ? 'sent' : 'failed'));
    }
  };

  return (
    <View style={styles.fill}>
      <TodayBackdrop />
      <ScrollView contentContainerStyle={styles.content} testID="wish-details">
        <View style={styles.hero}>
          <Ionicons name={confirming ? 'calendar' : 'gift'} size={76} color={brand.nexdoIndigo} />
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
                : 'Review the delivery status below.'}
        </Text>
        <View style={styles.stretch}>
          <MomentCard>
            <Text style={[textStyles.title2, styles.bold, { color: theme.colors.label }]}>{current.subject}</Text>
            <Text style={[textStyles.body, { color: theme.colors.label }]}>{current.recipient}</Text>
            <View style={[styles.divider, { backgroundColor: theme.colors.separator }]} />
            <LabeledValue label="Delivery" value={capitalized(current.channel)} />
            <LabeledValue label="Send time" value={momentLabel(planDate(current), current.timeZoneID)} />
            <LabeledValue label="Time zone" value={current.timeZoneID} />
            <LabeledValue label="Reminder" value={current.reminderOffset === 60 ? '1 hour before' : 'At scheduled time'} />
            <LabeledValue label="Repeat" value={current.repeatYearly ? 'Yearly' : 'Once'} />
            <Text style={[textStyles.body, styles.body, { color: theme.colors.label }]}>{current.body}</Text>
            {current.lastError ? <ErrorText>{current.lastError}</ErrorText> : null}
          </MomentCard>
        </View>
        {planEditable(current) ? (
          <>
            <BorderedButton
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
              <BorderedButton prominent title="Review & Open Messages" onPress={() => void reviewAndOpen()} testID="wish-open-messages" />
            ) : null}
            {current.channel === 'email' ? (
              <Pressable accessibilityRole="button" onPress={() => setSendEmailNow(true)} testID="wish-send-now">
                <Text style={[textStyles.body, { color: theme.colors.tint }]}>Send email now</Text>
              </Pressable>
            ) : null}
            {current.status === 'FAILED' && current.automaticDelivery ? (
              <Pressable accessibilityRole="button" onPress={() => void momentsStore.getState().perform(() => momentsStore.getState().planAction(current, 'retry'))} testID="wish-retry">
                <Text style={[textStyles.body, { color: theme.colors.tint }]}>Retry after reconnecting</Text>
              </Pressable>
            ) : null}
            <Pressable accessibilityRole="button" onPress={cancel} testID="wish-cancel">
              <Text style={[textStyles.body, { color: theme.colors.danger }]}>Cancel scheduled wish</Text>
            </Pressable>
          </>
        ) : null}
        {HISTORY_STATUSES.includes(current.status) ? (
          <>
            <Pressable accessibilityRole="button" onPress={() => void copyText(current.body)} testID="wish-copy">
              <Text style={[textStyles.body, { color: theme.colors.tint }]}>Copy message</Text>
            </Pressable>
            {moment ? (
              <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/moments/review', params: { id: moment.id } })} testID="wish-reuse">
                <Text style={[textStyles.body, { color: theme.colors.tint }]}>Reuse next year</Text>
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
  body: { marginTop: 8 },
  sheetTitle: { marginHorizontal: 16, marginTop: -20 },
});
