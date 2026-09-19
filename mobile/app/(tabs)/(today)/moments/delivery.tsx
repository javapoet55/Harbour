import Ionicons from '@expo/vector-icons/Ionicons';
import * as Crypto from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import type { ImportantMoment, PlanResponse, WishDeliveryPlan, WishDraft } from '../../../../src/api/moments';
import { TaskActionError } from '../../../../src/actions/errors';
import { SettingsSegments } from '../../../../src/components/SettingsControls';
import { Text } from '../../../../src/components/Text';
import { TodayBackdrop } from '../../../../src/components/TodayShell';
import { ErrorText, IconLabel, MomentCard, MomentPrimary, Secondary, headline, title1 } from '../../../../src/features/moments/components';
import { isoString } from '../../../../src/features/moments/dates';
import { canSendMessage, copyText, openMessages, shareText } from '../../../../src/features/moments/device';
import { capitalized, momentIcon } from '../../../../src/features/moments/domain';
import { findDraft, findPlan, rememberPlan } from '../../../../src/features/moments/handoff';
import { momentsStore, useMoments } from '../../../../src/features/moments/store';
import { WishEmailConfirmation } from '../../../../src/features/moments/WishEmailConfirmation';
import { textStyles, useTheme } from '../../../../src/theme';

const CHANNELS = [
  { id: 'messages', title: 'Messages', icon: 'chatbubble' },
  { id: 'email', title: 'Email', icon: 'mail' },
  { id: 'copy', title: 'Copy', icon: 'copy-outline' },
  { id: 'share', title: 'Share', icon: 'share-outline' },
] as const;

type Timing = 'Now' | 'Schedule' | 'Remind me later';

/**
 * `WishDeliveryView` (ios/App/ImportantMomentsView.swift:374-436): Messages / Email / Copy / Share,
 * and for Messages and Email, Now / Schedule / Remind me later.
 *
 * Messages, Copy and Share happen on THIS phone and are reported back as plan actions — `sent` /
 * `failed` / `cancel`, `copied`, `shared` — while Email is sent by the server. A "now" delivery is
 * scheduled with `sendNow: true` first, so there is a plan to report against.
 */
export default function ChooseDeliveryScreen() {
  const theme = useTheme();
  const { momentId, draftId } = useLocalSearchParams<{ momentId?: string; draftId?: string }>();
  const [moment] = useState<ImportantMoment | undefined>(() => momentsStore.getState().snapshot?.moments.find((item) => item.id === momentId));
  const [draft] = useState<WishDraft | undefined>(() => findDraft(draftId));
  const busy = useMoments((state) => state.busy);
  const error = useMoments((state) => state.error);
  const account = useMoments((state) => state.snapshot?.emailAccount?.email);
  const [channel, setChannel] = useState<string>('messages');
  const [timing, setTiming] = useState<Timing>('Now');
  // `.onAppear { if recipient.isEmpty { recipient = moment.phone } }`
  const [recipient, setRecipient] = useState(() => moment?.phone ?? '');
  const [requestID] = useState(() => Crypto.randomUUID());
  const [plan, setPlan] = useState<WishDeliveryPlan | null>(null);
  const [composing, setComposing] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState(false);

  if (!moment || !draft) return null;

  /** `send()` (:426-435), then the composer or share sheet's own completion (`:417-424`). */
  const send = async () => {
    let scheduled: WishDeliveryPlan | null = null;
    await momentsStore.getState().perform(async () => {
      if (channel === 'messages' && !(await canSendMessage())) throw new TaskActionError('unavailable');
      const result = await momentsStore.getState().request<PlanResponse>('schedule', {
        draftID: draft.id,
        channel,
        recipient,
        scheduledAtUTC: isoString(Date.now()),
        timeZoneID: moment.timeZoneID,
        automaticDelivery: channel === 'email',
        reminderOffset: 0,
        repeatYearly: false,
        idempotencyKey: requestID,
        sendNow: true,
        approved: true,
      });
      scheduled = result.plan;
      rememberPlan(result.plan);
      setPlan(result.plan);
      if (channel === 'copy') {
        await copyText(draft.body);
        await momentsStore.getState().planAction(result.plan, 'copied');
      }
    });
    const created = scheduled as WishDeliveryPlan | null;
    if (!created) return;
    if (channel === 'messages') {
      setComposing(true);
      const result = await openMessages(recipient, draft.body);
      setComposing(false);
      await momentsStore.getState().perform(async () => {
        await momentsStore.getState().planAction(created, result === 'submitted' ? 'sent' : result === 'failed' ? 'failed' : 'cancel');
        await momentsStore.getState().refresh();
        const updated = findPlan(created.id);
        if (updated) setPlan(updated);
      });
    }
    if (channel === 'share') {
      setComposing(true);
      const completed = await shareText(draft.body).catch(() => false);
      setComposing(false);
      await momentsStore.getState().perform(() => momentsStore.getState().planAction(created, completed ? 'shared' : 'cancel'));
    }
  };

  const sendsNow = timing === 'Now' || !['messages', 'email'].includes(channel);
  return (
    <View style={styles.fill}>
      <TodayBackdrop />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content} testID="wish-delivery">
        <MomentCard>
          <IconLabel icon={momentIcon(moment.type) as never} title={moment.title} style={[textStyles.title2, styles.bold]} size={22} />
          <Secondary numberOfLines={3}>{draft.body}</Secondary>
        </MomentCard>
        <Text style={[textStyles.largeTitle, styles.bold, { color: theme.colors.label }]}>Send with</Text>
        {CHANNELS.map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityState={{ selected: channel === item.id }}
            onPress={() => {
              setChannel(item.id);
              setRecipient(item.id === 'email' ? moment.email : moment.phone);
            }}
            testID={`delivery-${item.id}`}
          >
            <MomentCard>
              <View style={styles.inline}>
                <Ionicons name={item.icon} size={28} color={theme.colors.tint} />
                <Text style={[textStyles.title3, styles.bold, styles.grow, { color: theme.colors.label }]}>{item.title}</Text>
                <Ionicons name={channel === item.id ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={theme.colors.label} />
              </View>
            </MomentCard>
          </Pressable>
        ))}
        {['messages', 'email'].includes(channel) ? (
          <>
            <TextInput
              accessibilityLabel={channel === 'email' ? 'Recipient email' : 'Recipient phone'}
              autoCapitalize="none"
              keyboardType={channel === 'email' ? 'email-address' : 'phone-pad'}
              onChangeText={setRecipient}
              placeholder={channel === 'email' ? 'Recipient email' : 'Recipient phone'}
              placeholderTextColor={theme.colors.placeholder}
              style={[styles.rounded, { color: theme.colors.label, backgroundColor: theme.colors.surface, borderColor: theme.colors.separator }]}
              testID="delivery-recipient"
              value={recipient}
            />
            <Text style={[title1, styles.bold, { color: theme.colors.label }]}>When</Text>
            <SettingsSegments
              label="When"
              options={(['Now', 'Schedule', 'Remind me later'] as const).map((value) => ({ value, title: value }))}
              value={timing}
              onChange={setTiming}
              testIDPrefix="delivery-when"
            />
          </>
        ) : null}
        <Text style={[textStyles.subheadline, { color: theme.colors.secondaryLabel }]} testID="delivery-note">
          {channel === 'messages'
            ? 'Nexdo opens Messages. You confirm the final send.'
            : channel === 'email'
              ? `From: ${account ?? 'Connect email in Important Moments Settings'}`
              : 'Copying or sharing is recorded separately from sending.'}
        </Text>
        {error ? <ErrorText testID="delivery-error">{error}</ErrorText> : null}
        {busy ? <ActivityIndicator /> : null}
        {!sendsNow ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/moments/schedule-wish', params: { momentId: moment.id, draftId: draft.id, channel, recipient } })}
            style={[styles.prominent, { backgroundColor: theme.colors.tint }]}
            testID="delivery-choose-time"
          >
            <Text style={[headline, styles.centerLabel, { color: '#FFFFFF' }]}>Choose date & time</Text>
          </Pressable>
        ) : (
          <MomentPrimary
            title={channel === 'messages' ? 'Open Messages' : channel === 'email' ? 'Review email & send' : capitalized(channel)}
            onPress={() => (channel === 'email' ? setConfirmEmail(true) : void send())}
            disabled={busy || plan !== null}
            testID="delivery-send"
          />
        )}
        {plan && !composing ? (
          <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/moments/wish', params: { planId: plan.id } })} testID="delivery-status">
            <Text style={[textStyles.body, { color: theme.colors.tint }]}>View delivery status</Text>
          </Pressable>
        ) : null}
      </ScrollView>
      <WishEmailConfirmation
        visible={confirmEmail}
        account={account ?? 'No connected account'}
        recipient={recipient}
        subject={moment.title}
        message={draft.body}
        onCancel={() => setConfirmEmail(false)}
        onConfirm={() => {
          setConfirmEmail(false);
          void send();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: 18, gap: 20, paddingBottom: 60 },
  bold: { fontWeight: '700' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  grow: { flex: 1 },
  rounded: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 5, paddingHorizontal: 7, paddingVertical: 5, fontSize: 17 },
  prominent: { minHeight: 52, borderRadius: 999, justifyContent: 'center' },
  centerLabel: { textAlign: 'center', alignSelf: 'stretch' },
});
