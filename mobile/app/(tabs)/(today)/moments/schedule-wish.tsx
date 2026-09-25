import * as Crypto from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import type { ImportantMoment, PlanResponse, WishDeliveryPlan, WishDraft } from '../../../../src/api/moments';
import { Text } from '../../../../src/components/Text';
import { TodayBackdrop } from '../../../../src/components/TodayShell';
import { caption, ErrorText, headline, IconLabel, MomentCard, MomentPrimary, Secondary, title1 } from '../../../../src/features/moments/components';
import { deviceZone, isoString } from '../../../../src/features/moments/dates';
import { capitalized, momentIcon } from '../../../../src/features/moments/domain';
import { DateField, FormToggle, ZonePicker } from '../../../../src/features/moments/form';
import { findDraft, rememberPlan } from '../../../../src/features/moments/handoff';
import { momentsStore, useMoments } from '../../../../src/features/moments/store';
import { textStyles, useTheme } from '../../../../src/theme';

/**
 * `ScheduleWishView` (ios/App/ImportantMomentsView.swift:447-494): the delivery method, the send time
 * and zone, the reminder and repeat toggles, and "Schedule Reminder" / "Schedule Automatic Send", which
 * pushes the new plan's Wish details in its confirmation form.
 *
 * "Send automatically" is email-only and greyed out unless the server reports
 * `automaticEmailEnabled`. The send time is compared against a clock that ticks every second, so a
 * time that lapses while the screen is open disables the button on its own
 * (ImportantMomentsView.swift:464, :496).
 */
export default function ScheduleWishScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ momentId?: string; draftId?: string; channel?: string; recipient?: string }>();
  const [moment] = useState<ImportantMoment | undefined>(() => momentsStore.getState().snapshot?.moments.find((item) => item.id === params.momentId));
  const [draft] = useState<WishDraft | undefined>(() => findDraft(params.draftId));
  const channel = params.channel ?? 'messages';
  const recipient = params.recipient ?? '';
  const busy = useMoments((state) => state.busy);
  const error = useMoments((state) => state.error);
  const snapshot = useMoments((state) => state.snapshot);
  const [date, setDate] = useState(() => Date.now() + 3_600_000);
  // `.onAppear { zone = moment.timeZoneID }`
  const [zone, setZone] = useState(() => moment?.timeZoneID ?? deviceZone());
  const [now, setNow] = useState(() => Date.now());
  const [automatic, setAutomatic] = useState(false);
  const [warning, setWarning] = useState(true);
  const [yearly, setYearly] = useState(false);
  const [key] = useState(() => Crypto.randomUUID());
  const [saved, setSaved] = useState<WishDeliveryPlan | null>(null);

  // `.onReceive(Timer.publish(every:1, ...))` (:496): re-evaluates the disabled state as time passes.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!moment || !draft) return null;
  const automaticEnabled = snapshot?.automaticEmailEnabled === true;

  const schedule = () => {
    // `guard date > Date()` (:488): the time may have lapsed between the last tick and this tap.
    if (date <= Date.now()) {
      momentsStore.getState().setError('Choose a future time.');
      return;
    }
    void momentsStore.getState().perform(async () => {
      if (!automatic || warning) await momentsStore.getState().authorizeNotifications();
      const response = await momentsStore.getState().request<PlanResponse>('schedule', {
        draftID: draft.id,
        channel,
        recipient,
        scheduledAtUTC: isoString(date),
        timeZoneID: zone,
        automaticDelivery: automatic,
        reminderOffset: warning ? 60 : 0,
        repeatYearly: yearly,
        idempotencyKey: key,
        sendNow: false,
        approved: true,
      });
      setSaved(response.plan);
      rememberPlan(response.plan);
      router.push({ pathname: '/moments/wish', params: { planId: response.plan.id, confirmation: '1' } });
    });
  };

  return (
    <View style={styles.fill}>
      <TodayBackdrop />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content} testID="schedule-wish">
        <MomentCard>
          <IconLabel icon={momentIcon(moment.type) as never} title={moment.title} style={[textStyles.title2, styles.bold]} size={22} />
          <Text style={[textStyles.body, { color: theme.colors.label }]}>{moment.nextOccurrence}</Text>
        </MomentCard>
        <Text style={[title1, styles.bold, { color: theme.colors.label }]}>Delivery method</Text>
        <MomentCard>
          <IconLabel icon={channel === 'email' ? 'mail' : 'chatbubble'} title={capitalized(channel)} style={headline} />
          <Text style={[textStyles.body, { color: theme.colors.label }]}>{recipient}</Text>
          <Secondary>{channel === 'messages' ? 'You tap Send at the scheduled time' : (snapshot?.emailAccount?.email ?? 'Connect email in Settings')}</Secondary>
        </MomentCard>
        <Text style={[title1, styles.bold, { color: theme.colors.label }]}>Send date & time</Text>
        <MomentCard>
          <DateField includeTime label="Date and time" value={date} onChange={setDate} zone={zone} minimum={now} testID="schedule-wish-date" />
          <ZonePicker hideLabel value={zone} onChange={setZone} testID="schedule-wish-zone" />
        </MomentCard>
        <MomentCard>
          {channel === 'email' ? (
            <>
              <FormToggle label="Send automatically" value={automatic} onValueChange={setAutomatic} disabled={!automaticEnabled} testID="schedule-wish-automatic" />
              {!automaticEnabled ? (
                <Text style={[caption, { color: theme.colors.label }]} testID="schedule-wish-automatic-note">
                  Automatic delivery needs a connected email account and the server scheduler.
                </Text>
              ) : null}
            </>
          ) : (
            <Text style={[textStyles.body, { color: theme.colors.label }]}>
              We’ll remind you, the sender, to open the prepared wish and tap Send in Messages. Recipients do not need to confirm. Nexdo does not send Messages automatically.
            </Text>
          )}
          <FormToggle label="Notify me 1 hour before" value={warning} onValueChange={setWarning} testID="schedule-wish-warning" />
          <FormToggle label="Repeat yearly" value={yearly} onValueChange={setYearly} testID="schedule-wish-yearly" />
          {!automatic ? (
            <Text style={[caption, { color: theme.colors.secondaryLabel }]}>For yearly Messages wishes, you must tap Send each year. Reopen Nexdo to refresh local reminders.</Text>
          ) : null}
        </MomentCard>
        <MomentCard>
          <Text style={[headline, { color: theme.colors.label }]}>Approved message</Text>
          <Text style={[textStyles.body, { color: theme.colors.label }]}>{draft.body}</Text>
          <Text style={[caption, { color: theme.colors.label }]}>Go back to Review Wish to change the message.</Text>
        </MomentCard>
        <Text style={[caption, { color: theme.colors.secondaryLabel }]}>Allow notifications to receive reminders. Email delivery runs on the server even when Nexdo is closed.</Text>
        {error ? <ErrorText testID="schedule-wish-error">{error}</ErrorText> : null}
        <MomentPrimary
          title={automatic ? 'Schedule Automatic Send' : 'Schedule Reminder'}
          onPress={schedule}
          disabled={busy || saved !== null || date <= now}
          testID="schedule-wish-submit"
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: 18, gap: 18, paddingBottom: 60 },
  bold: { fontWeight: '700' },
});
