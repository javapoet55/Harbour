import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from 'zustand';

import type { WishDeliveryPlan } from '../../api/moments';
import { withAlpha } from '../../components/SignInBackdrop';
import { Text } from '../../components/Text';
import { FixedScheme, textStyles } from '../../theme';
import { MomentConfetti, systemColors } from './components';
import { momentLabel } from './dates';
import { canSendMessage, openMessages } from './device';
import { composerPlanAction, planDate, type ManagedRecipient } from './domain';
import { DateField } from './form';
import { deliveryMessage, isDirty, occasionType, recipientChannel, reviewHeading, selectedRecipients, type ManageModel } from './manageModel';
import { momentsStore } from './store';

/**
 * `FestivalScheduleReview`, `ScheduleRecipientEditor` and `FestivalScheduleSuccess`
 * (ios/App/ManageFestivalView.swift:348-634), Phase 12.
 *
 * Swift draws all three in `ScheduleDesign`'s FIXED light colours (`:389-393`), whatever the phone's
 * mode, so they sit in a `FixedScheme scheme="light"` here: the shared date pill and fields inside
 * resolve the light palette too.
 *
 * Send Now sends approved email at once from the connected account and opens Messages for each phone
 * recipient, where the person still taps Send — Nexdo never sends a Messages wish by itself.
 */

/** `ScheduleDesign` (:389-393). */
export const SCHEDULE_INK = '#0F1729'; // Color(red: 0.06, green: 0.09, blue: 0.16)
export const SCHEDULE_SECONDARY = '#63738C'; // Color(red: 0.39, green: 0.45, blue: 0.55)
export const SCHEDULE_BACKGROUND = '#F7FAFF'; // Color(red: 0.97, green: 0.98, blue: 1)
const BLUE = systemColors.blue;

/** `ScheduleWishCard` (:398-414): the occasion's emoji beside the wish. */
export function ScheduleWishCard({ heading, message, occasion }: { heading: string; message: string; occasion: string }) {
  const emoji = occasion === 'birthday' ? '🎂' : occasion === 'anniversary' ? '💐' : occasion === 'getWellSoon' ? '🌷' : '🎉';
  return (
    <View style={[styles.wishCard, { borderColor: withAlpha(systemColors.purple, 0.08) }]} testID="schedule-wish-card">
      <LinearGradient colors={[withAlpha(systemColors.purple, 0.06), withAlpha(systemColors.pink, 0.04)]} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
      <View accessible={false} importantForAccessibility="no-hide-descendants" style={[styles.emoji, { backgroundColor: withAlpha(systemColors.purple, 0.05) }]}>
        <Text style={styles.emojiText}>{emoji}</Text>
      </View>
      <View style={styles.grow}>
        <Text style={[styles.headline, { color: SCHEDULE_INK }]} testID="schedule-wish-heading">
          {heading}
        </Text>
        <Text style={[textStyles.subheadline, { color: SCHEDULE_SECONDARY }]}>{message}</Text>
      </View>
    </View>
  );
}

/** `ScheduleActionStyle` (:415-427): primary blue, secondary outlined blue, or the four-colour gradient. */
function ActionButton({
  title,
  onPress,
  kind = 'primary',
  disabled = false,
  testID,
  onWrap,
}: {
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'gradient';
  disabled?: boolean;
  testID?: string;
  /** Called when the title needs more than one line at the width it was given. */
  onWrap?: () => void;
}) {
  const secondary = kind === 'secondary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.action, secondary && { borderWidth: 1, borderColor: withAlpha(BLUE, 0.25) }, (pressed || disabled) && styles.pressed]}
      testID={testID}
    >
      <LinearGradient
        colors={secondary ? [withAlpha(BLUE, 0.04), withAlpha(BLUE, 0.06)] : kind === 'gradient' ? [systemColors.cyan, BLUE, systemColors.purple, systemColors.pink] : [BLUE, BLUE]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
      <Text onTextLayout={onWrap ? (event) => event.nativeEvent.lines.length > 1 && onWrap() : undefined} style={[styles.headline, { color: secondary ? BLUE : '#FFFFFF' }]}>
        {title}
      </Text>
    </Pressable>
  );
}

/**
 * A `.sheet` in the schedule design: inline title, a trailing text button or close mark, the light
 * `ScheduleDesign` background. iOS 26's page sheet on iOS; on Android the same rounded shape over a
 * dimmed page, as `MomentSheet` draws it.
 */
function LightSheet({
  visible,
  title,
  onClose,
  trailing,
  footer,
  background = SCHEDULE_BACKGROUND,
  children,
  testID,
  onClosed,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  /** Called once the hidden sheet has gone: iOS's `onDismiss`, after the slide; Android has none, and its dialog is gone once the hide is committed. */
  onClosed?: () => void;
  trailing?: { title?: string; close?: boolean; onPress: () => void; disabled?: boolean; testID: string };
  footer?: ReactNode;
  background?: string;
  children: ReactNode;
  testID: string;
}) {
  const insets = useSafeAreaInsets();
  const android = Platform.OS === 'android';
  const shown = useRef(visible);
  useEffect(() => {
    if (android && shown.current && !visible) onClosed?.();
    shown.current = visible;
  }, [android, visible, onClosed]);
  return (
    <Modal animationType="slide" onDismiss={android ? undefined : onClosed} onRequestClose={onClose} presentationStyle={android ? undefined : 'pageSheet'} statusBarTranslucent transparent={android} visible={visible}>
      <FixedScheme scheme="light">
        {android ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.dim]} /> : null}
        <View style={[styles.sheet, { backgroundColor: background, marginTop: android ? insets.top + 8 : 0 }, android && styles.sheetShape]} testID={testID}>
          <View style={styles.sheetBar}>
            <View style={styles.sheetSide} />
            <Text style={[styles.sheetTitle, { color: SCHEDULE_INK }]}>{title}</Text>
            <View style={[styles.sheetSide, styles.trailing]}>
              {trailing ? (
                <Pressable accessibilityRole="button" accessibilityLabel={trailing.close ? 'Close editor' : trailing.title} disabled={trailing.disabled} hitSlop={8} onPress={trailing.onPress} testID={trailing.testID}>
                  {trailing.close ? (
                    <Ionicons name="close-circle" size={26} color={withAlpha(SCHEDULE_SECONDARY, 0.6)} />
                  ) : (
                    <Text style={[textStyles.body, { color: trailing.disabled ? withAlpha(BLUE, 0.4) : BLUE }]}>{trailing.title}</Text>
                  )}
                </Pressable>
              ) : null}
            </View>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.sheetContent, { paddingBottom: footer ? 20 : 20 + insets.bottom }]}>
            {children}
          </ScrollView>
          {footer ? <View style={[styles.footer, { paddingBottom: 12 + insets.bottom }]}>{footer}</View> : null}
        </View>
      </FixedScheme>
    </Modal>
  );
}

/** `delivery(_:)` (:568-570). */
function deliveryLine(model: ManageModel, recipient: ManagedRecipient): string {
  const state = model.getState();
  const channel = recipientChannel(state, recipient);
  if (channel === 'email') return state.settings.automatic[recipient.key] === true ? 'Email · Automatic send' : 'Email · Will be sent by you';
  return channel === 'messages' ? 'Messages · Will be sent by you' : 'Copy / Share · Will be sent by you';
}

/** `reviewRow(…)` (:571-581). */
function ReviewRow({ icon, color, label, value, detail, onEdit, disabled, testID }: { icon: keyof typeof Ionicons.glyphMap; color: string; label: string; value: string; detail: string; onEdit: () => void; disabled: boolean; testID: string }) {
  return (
    <View style={styles.reviewRow}>
      <View style={[styles.reviewIcon, { backgroundColor: withAlpha(color, 0.08) }]}>
        <Ionicons name={icon} size={24} color={color} />
      </View>
      <View style={styles.grow}>
        <Text style={[styles.caption, { color: SCHEDULE_SECONDARY }]}>{label}</Text>
        <Text style={[textStyles.subheadline, styles.bold, { color: SCHEDULE_INK }]}>{value}</Text>
        <Text style={[styles.caption, { color: SCHEDULE_SECONDARY }]}>{detail}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onEdit} style={[styles.edit, { backgroundColor: withAlpha(BLUE, 0.07) }, disabled && styles.pressed]} testID={testID}>
        <Text style={[textStyles.subheadline, styles.bold, { color: BLUE }]}>Edit</Text>
      </Pressable>
    </View>
  );
}

export const MESSAGES_UNAVAILABLE = 'Messages is not available on this device. No greeting has been sent.';
/** Send Now with Messages unavailable: the recipients set to Messages that were left out. */
export function messagesUnavailableFor(names: string[]): string {
  return `Messages is not available on this device. No greeting has been sent to ${names.join(', ')}.`;
}
export const MESSAGES_FAILED = 'Messages could not send this greeting. Use Continue Send Now to try again.';

/** The Send Now notice (`:564`): what went out, and that Messages still waits for you. */
export function sendNowNotice(plans: WishDeliveryPlan[]): string {
  const emails = plans.filter((plan) => plan.channel === 'email');
  const sent = emails.filter((plan) => plan.status === 'SENT').length;
  return `${sent} email${sent === 1 ? '' : 's'} sent. ${emails.length > sent ? 'Some emails are pending or failed; check Scheduled wishes for their status. ' : ''}Messages still requires you to tap Send.`;
}

/**
 * `FestivalScheduleReview` (:428-610): the date and every recipient, each editable, before Confirm
 * Schedule — or Send Now, which asks once more ("Send now") and then sends.
 */
export function ScheduleReviewSheet({ model, visible, onClose, onClosed }: { model: ManageModel; visible: boolean; onClose: () => void; onClosed?: () => void }) {
  const state = useStore(model);
  // `@State` copies taken when the sheet opens; the parent re-keys the sheet on each opening.
  const [date, setDate] = useState(state.sendDate);
  const [recipients, setRecipients] = useState<ManagedRecipient[]>(() => selectedRecipients(state));
  const [editingDate, setEditingDate] = useState(false);
  const [dateDraft, setDateDraft] = useState(state.sendDate);
  const [recipientDraft, setRecipientDraft] = useState<ManagedRecipient | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [stacked, setStacked] = useState(false);
  const stack = () => setStacked(true);
  const [showAll, setShowAll] = useState(false);
  const [sendNowConfirmation, setSendNowConfirmation] = useState(false);
  const [sendNowStarted, setSendNowStarted] = useState(false);
  /** "Send email & open Messages" was tapped: the send starts once its sheet has closed. */
  const sendAfterClose = useRef(false);
  const [immediateNotice, setImmediateNotice] = useState<string | null>(null);
  const [openedAt] = useState(() => Date.now());
  const composing = useRef(false);
  const type = occasionType(state);

  const close = () => {
    model.getState().setError(null);
    onClose();
  };

  /** Writes the edited recipients back into the model, as `saveRecipient(_:replacing:)` does. */
  const applyRecipients = () => {
    for (const recipient of recipients) {
      const old = model.getState().recipients.find((item) => item.key === recipient.key);
      if (old && (old.name !== recipient.name || old.phone !== recipient.phone || old.email !== recipient.email)) model.getState().saveRecipient(recipient);
    }
  };

  /** The approval or save Confirm and Send Now both need first. `false` stops the action. */
  const prepare = async (): Promise<boolean> => {
    applyRecipients();
    if (model.getState().settings.approvedAt == null) await model.getState().approve();
    else if (isDirty(model.getState())) await model.getState().save();
    if (model.getState().needsScheduleConfirmation) {
      onClose();
      return false;
    }
    return model.getState().error === null;
  };

  /** `confirm()` (:596-609). */
  const confirm = async () => {
    setSubmitting(true);
    try {
      model.getState().setError(null);
      model.getState().setSendDate(date);
      if (!(await prepare())) return;
      await model.getState().schedule();
      if (model.getState().scheduleCompleted) onClose();
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * One Messages composer per waiting plan, in turn (`messageQueue`, :524-537). A verified send is
   * recorded `sent`, a composer error shows Swift's message. ANDROID: the SMS intent cannot say what
   * happened, so that is recorded `opened`, as Choose Delivery does (device.ts).
   */
  const composeQueue = async (queue: WishDeliveryPlan[]) => {
    if (composing.current) return;
    composing.current = true;
    try {
      for (const plan of queue) {
        const outcome = await openMessages(plan.recipient, plan.body);
        if (outcome === 'failed') model.getState().setError(MESSAGES_FAILED);
        const action = composerPlanAction(outcome);
        try {
          if (action === 'sent' || action === 'opened') await momentsStore.getState().planAction(plan, action);
          await momentsStore.getState().refresh();
        } catch (error) {
          model.getState().setError(error instanceof Error ? error.message : String(error));
        }
      }
    } finally {
      composing.current = false;
    }
  };

  /**
   * `sendNow()` (:545-567). Android ahead of iOS: Swift refuses everyone when Messages is unavailable and
   * any recipient has a phone. Here only the recipients whose channel is Messages need it; the rest are
   * still sent, and nothing opens the composer on a device that has none.
   */
  const sendNow = async () => {
    const messagesAvailable = !recipients.some((recipient) => recipient.phone !== '') || (await canSendMessage());
    const skipped = messagesAvailable ? [] : recipients.filter((recipient) => recipient.phone !== '' && recipientChannel(model.getState(), recipient) === 'messages');
    if (skipped.length > 0 && skipped.length === recipients.length) {
      model.getState().setError(MESSAGES_UNAVAILABLE);
      return;
    }
    setSubmitting(true);
    let plans: WishDeliveryPlan[] | null = null;
    try {
      model.getState().setError(null);
      if (!sendNowStarted && !(await prepare())) return;
      setSendNowStarted(true);
      plans = await model.getState().sendImmediately(skipped.map((recipient) => recipient.key));
      if (!plans) return;
      setImmediateNotice(sendNowNotice(plans));
      if (skipped.length > 0) model.getState().setError(messagesUnavailableFor(skipped.map((recipient) => recipient.name)));
    } finally {
      setSubmitting(false);
    }
    if (messagesAvailable) await composeQueue(plans.filter((plan) => plan.channel === 'messages' && plan.status === 'AWAITING_CONFIRMATION'));
  };

  const visibleRecipients = showAll ? recipients : recipients.slice(0, 2);
  const first = recipients[0];
  return (
    <>
      <LightSheet
        visible={visible}
        title=""
        onClose={() => !submitting && close()}
        trailing={{ title: 'Cancel', onPress: close, disabled: submitting, testID: 'review-cancel' }}
        onClosed={onClosed}
        testID="schedule-review"
      >
        <View style={styles.reviewBody} pointerEvents={submitting ? 'none' : 'auto'}>
          <Text style={[textStyles.largeTitle, styles.bold, { color: SCHEDULE_INK }]}>Review schedule</Text>
          <Text style={[textStyles.body, { color: SCHEDULE_SECONDARY }]}>Let’s make sure everything looks good.</Text>
          {first ? <ScheduleWishCard heading={reviewHeading(state, first)} message={deliveryMessage(state, first)} occasion={type} /> : null}
          <ReviewRow
            icon="calendar-outline"
            color={systemColors.purple}
            label="Scheduled for"
            value={momentLabel(date, state.zone)}
            detail={state.zone}
            disabled={sendNowStarted}
            onEdit={() => {
              setDateDraft(date);
              setEditingDate(true);
            }}
            testID="review-edit-date"
          />
          {visibleRecipients.map((recipient) => (
            <ReviewRow
              key={recipient.key}
              icon="person-outline"
              color={BLUE}
              label="Recipient"
              value={recipient.name}
              detail={deliveryLine(model, recipient)}
              disabled={sendNowStarted}
              onEdit={() => setRecipientDraft(recipient)}
              testID={`review-edit-recipient-${recipient.key}`}
            />
          ))}
          {recipients.length > 2 ? (
            <Pressable accessibilityRole="button" accessibilityValue={{ text: showAll ? 'Expanded' : 'Collapsed' }} onPress={() => setShowAll(!showAll)} style={styles.showMore} testID="review-show-recipients">
              <Text style={[textStyles.body, { color: BLUE }]}>{showAll ? 'Show less' : 'Show more…'}</Text>
            </Pressable>
          ) : null}
          {recipients.some((recipient) => recipientChannel(state, recipient) === 'messages') ? (
            <View style={[styles.info, { backgroundColor: withAlpha(systemColors.purple, 0.05) }]}>
              <Ionicons name="notifications-outline" size={24} color={systemColors.purple} />
              <Text style={[styles.footnote, styles.grow, { color: SCHEDULE_SECONDARY }]}>
                At the scheduled time, we’ll remind you to open the prepared wish and tap Send in Messages. Nexdo does not send Messages automatically.
              </Text>
            </View>
          ) : null}
          {state.error ? (
            <Text style={[textStyles.body, { color: systemColors.red }]} testID="review-schedule-error">
              {state.error}
            </Text>
          ) : null}
          {immediateNotice ? (
            <Text style={[textStyles.body, { color: SCHEDULE_SECONDARY }]} testID="review-send-now-notice">
              {immediateNotice}
            </Text>
          ) : null}
          {submitting ? <ActivityIndicator /> : null}
          {sendNowStarted ? (
            <>
              <ActionButton title="Continue Send Now" onPress={() => setSendNowConfirmation(true)} testID="review-continue-send-now" />
              <ActionButton title="Done" kind="secondary" onPress={close} testID="review-done" />
            </>
          ) : (
            // `ViewThatFits`: side by side, or stacked when they do not fit. It measures each button at its
            // ideal (one-line) width, so a label that has to wrap at half the row means "does not fit".
            <View style={[styles.deliveryButtons, stacked && styles.deliveryStacked]} testID="review-delivery-buttons">
              <View style={[styles.deliveryButton, stacked && styles.deliveryButtonStacked]}>
                <ActionButton title="Send Now" kind="secondary" onPress={() => setSendNowConfirmation(true)} disabled={submitting} testID="review-send-now" onWrap={stack} />
              </View>
              <View style={[styles.deliveryButton, stacked && styles.deliveryButtonStacked]}>
                <ActionButton title={submitting ? 'Confirming…' : 'Confirm Schedule'} kind="gradient" onPress={() => void confirm()} disabled={submitting} testID="wish-primary" onWrap={stack} />
              </View>
            </View>
          )}
        </View>
      </LightSheet>

      {/* `editingDate` (:489-494): the date and time, no earlier than now. */}
      <LightSheet visible={editingDate} title="Edit date & time" onClose={() => setEditingDate(false)} background="#FFFFFF" trailing={{ close: true, onPress: () => setEditingDate(false), testID: 'review-date-close' }} testID="review-date-sheet">
        <View style={styles.editor}>
          <DateField includeTime label="Date and time" value={dateDraft} onChange={setDateDraft} zone={state.zone} minimum={openedAt} testID="review-date" />
          <ActionButton
            title="Done"
            onPress={() => {
              setDate(dateDraft);
              setEditingDate(false);
            }}
            testID="review-date-done"
          />
          <ActionButton title="Cancel" kind="secondary" onPress={() => setEditingDate(false)} testID="review-date-cancel" />
        </View>
      </LightSheet>

      {recipientDraft ? (
        <ScheduleRecipientEditor
          recipient={recipientDraft}
          delivery={deliveryLine(model, recipientDraft)}
          onDone={(updated) => {
            setRecipients((current) => current.map((recipient) => (recipient.key === updated.key ? updated : recipient)));
            setRecipientDraft(null);
          }}
          onCancel={() => setRecipientDraft(null)}
        />
      ) : null}

      {/* `sendNowConfirmation` (:501-523): who gets what, before anything is sent. */}
      <LightSheet
        visible={sendNowConfirmation}
        title="Send now"
        onClose={() => setSendNowConfirmation(false)}
        background="#FFFFFF"
        trailing={{ title: 'Cancel', onPress: () => setSendNowConfirmation(false), testID: 'send-now-cancel' }}
        // Android ahead of iOS: Swift starts `sendNow()` while this sheet is still dismissing (:501-536), so
        // the Messages composer can collide with it. The send starts once the sheet has closed.
        onClosed={() => {
          if (!sendAfterClose.current) return;
          sendAfterClose.current = false;
          void sendNow();
        }}
        footer={
          <ActionButton
            title="Send email & open Messages"
            onPress={() => {
              sendAfterClose.current = true;
              setSendNowConfirmation(false);
            }}
            testID="send-now-confirm"
          />
        }
        testID="send-now-sheet"
      >
        <View style={styles.reviewBody}>
          <Text style={[textStyles.body, { color: SCHEDULE_SECONDARY }]}>Email is sent now where an address is saved. Messages opens for you to tap Send. Missing channels are skipped.</Text>
          {recipients.map((recipient) => (
            <View key={recipient.key} style={[styles.sendNowCard, { backgroundColor: withAlpha(BLUE, 0.04) }]} testID={`send-now-${recipient.key}`}>
              <Text style={[styles.headline, { color: SCHEDULE_INK }]}>{recipient.name}</Text>
              {recipient.email !== '' ? (
                <View style={styles.inline}>
                  <Ionicons name="mail-outline" size={17} color={SCHEDULE_INK} />
                  <Text style={[textStyles.body, { color: SCHEDULE_INK }]}>{recipient.email}</Text>
                </View>
              ) : null}
              {recipient.phone !== '' ? (
                <View style={styles.inline}>
                  <Ionicons name="call-outline" size={17} color={SCHEDULE_INK} />
                  <Text style={[textStyles.body, { color: SCHEDULE_INK }]}>{recipient.phone}</Text>
                </View>
              ) : null}
              <Text style={[textStyles.subheadline, { color: SCHEDULE_SECONDARY }]}>{deliveryMessage(state, recipient)}</Text>
            </View>
          ))}
        </View>
      </LightSheet>
    </>
  );
}

/** `ScheduleRecipientEditor` (:611-634): the recipient's name, phone and email for this schedule. */
function ScheduleRecipientEditor({ recipient, delivery, onDone, onCancel }: { recipient: ManagedRecipient; delivery: string; onDone: (updated: ManagedRecipient) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState(recipient);
  const icon: keyof typeof Ionicons.glyphMap = delivery.startsWith('Messages') ? 'chatbubble' : delivery.startsWith('Email') ? 'mail' : 'share-outline';
  return (
    <LightSheet visible title="Edit recipient" onClose={onCancel} background="#FFFFFF" trailing={{ close: true, onPress: onCancel, testID: 'review-recipient-close' }} testID="review-recipient-sheet">
      <View style={styles.editor}>
        <View style={styles.inline}>
          <Ionicons name="person-outline" size={30} color={BLUE} />
          <TextInput accessibilityLabel="Recipient name" onChangeText={(name) => setDraft({ ...draft, name })} placeholder="Recipient name" placeholderTextColor={withAlpha(SCHEDULE_SECONDARY, 0.7)} style={[styles.field, styles.grow]} testID="review-recipient-name" value={draft.name} />
        </View>
        <TextInput accessibilityLabel="Phone number" keyboardType="phone-pad" onChangeText={(phone) => setDraft({ ...draft, phone })} placeholder="Phone number" placeholderTextColor={withAlpha(SCHEDULE_SECONDARY, 0.7)} style={styles.field} testID="review-recipient-phone" value={draft.phone} />
        <TextInput accessibilityLabel="Email address" autoCapitalize="none" keyboardType="email-address" onChangeText={(email) => setDraft({ ...draft, email })} placeholder="Email address" placeholderTextColor={withAlpha(SCHEDULE_SECONDARY, 0.7)} style={styles.field} testID="review-recipient-email" value={draft.email} />
        <View style={styles.inline}>
          <Ionicons name={icon} size={17} color={SCHEDULE_SECONDARY} />
          <Text style={[textStyles.body, { color: SCHEDULE_SECONDARY }]}>{delivery}</Text>
        </View>
        <ActionButton title="Done" onPress={() => onDone(draft)} disabled={draft.name.trim() === ''} testID="review-recipient-done" />
        <ActionButton title="Cancel" kind="secondary" onPress={onCancel} testID="review-recipient-cancel" />
      </View>
    </LightSheet>
  );
}

/**
 * `FestivalScheduleSuccess` (:348-387): the green check, "Schedule confirmed!", how each wish goes out
 * and when, the first wish, and Done. No Back: the navigation bar's back button is hidden. Confetti for
 * birthdays, anniversaries and festivals — not Get Well Soon.
 */
export function ScheduleSuccess({
  occasion,
  plans,
  wish,
  done,
}: {
  occasion: string;
  plans: Pick<WishDeliveryPlan, 'automaticDelivery' | 'channel' | 'scheduledAtUTC' | 'timeZoneID'>[];
  wish: { heading: string; message: string } | null;
  done: () => void;
}) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const summaries = [
    ...new Set(
      plans.map((plan) =>
        plan.automaticDelivery
          ? 'Will send automatically by email'
          : plan.channel === 'messages'
            ? 'We’ll remind you, the sender, to tap Send in Messages'
            : 'We’ll remind you, the sender, to deliver your wish',
      ),
    ),
  ].sort();
  // Android ahead of iOS: Swift sorts the formatted labels (:359-361), so "10 Oct" came before "6 Oct"; these
  // are in time order.
  const times = [...new Set([...plans].sort((a, b) => planDate(a) - planDate(b)).map((plan) => momentLabel(planDate(plan), plan.timeZoneID)))];
  return (
    <FixedScheme scheme="light">
      <View style={[styles.fill, { backgroundColor: SCHEDULE_BACKGROUND }]} onLayout={(event) => setSize(event.nativeEvent.layout)} testID="schedule-success">
        {/* The bar sits on the page's own colour, as Swift's inline bar over `ScheduleDesign.background`;
            the stack's default showed the Moments backdrop above it as a grey band. */}
        <Stack.Screen
          options={{
            title: 'Schedule confirmed',
            headerBackVisible: false,
            headerLeft: () => null,
            headerRight: undefined,
            gestureEnabled: false,
            headerStyle: { backgroundColor: SCHEDULE_BACKGROUND },
            headerShadowVisible: false,
          }}
        />
        <ScrollView contentContainerStyle={styles.success}>
          <View style={[styles.check, { backgroundColor: withAlpha(systemColors.green, 0.08) }]}>
            <Ionicons name="checkmark-circle" size={92} color={systemColors.green} />
          </View>
          <Text style={[styles.title1, styles.bold, { color: SCHEDULE_INK }]}>Schedule confirmed!</Text>
          <View style={styles.summary}>
            {summaries.map((summary) => (
              <Text key={summary} style={[textStyles.body, styles.center, { color: SCHEDULE_SECONDARY }]}>
                {summary}
              </Text>
            ))}
            {times.map((time) => (
              <Text key={time} style={[textStyles.body, styles.bold, styles.center, { color: SCHEDULE_INK }]} testID="schedule-confirmed-date">
                {time}
              </Text>
            ))}
            <Text style={[textStyles.subheadline, styles.center, { color: SCHEDULE_SECONDARY }]} testID="festival-confirmation-recipients">{`For all ${plans.length} selected contact${plans.length === 1 ? '' : 's'}`}</Text>
          </View>
          {wish ? <ScheduleWishCard heading={wish.heading} message={wish.message} occasion={occasion} /> : null}
          <ActionButton title="Done" onPress={done} testID="wish-primary" />
        </ScrollView>
        {['birthday', 'anniversary', 'festival'].includes(occasion) ? <MomentConfetti width={size.width} height={size.height} /> : null}
      </View>
    </FixedScheme>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flex: 1 },
  bold: { fontWeight: '700' },
  center: { textAlign: 'center' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  caption: { fontSize: 12, lineHeight: 16 },
  footnote: { fontSize: 13, lineHeight: 18 },
  title1: { fontSize: 28, lineHeight: 34 },
  pressed: { opacity: 0.7 },
  dim: { backgroundColor: 'rgba(0, 0, 0, 0.35)' },
  sheet: { flex: 1, overflow: 'hidden' },
  sheetShape: { borderTopLeftRadius: 38, borderTopRightRadius: 38 },
  sheetBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6, minHeight: 56 },
  sheetSide: { width: 72 },
  trailing: { alignItems: 'flex-end' },
  sheetTitle: { flex: 1, textAlign: 'center', fontSize: 17, lineHeight: 22, fontWeight: '600' },
  sheetContent: { padding: 20 },
  footer: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: 'rgba(255, 255, 255, 0.92)' },
  reviewBody: { gap: 18 },
  // `ScheduleWishCard`: emoji 48 in a 64×80 tile, 16 padding, 20 corners.
  wishCard: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 16, borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  emoji: { width: 64, height: 80, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  emojiText: { fontSize: 48, lineHeight: 58 },
  // `ScheduleActionStyle`: `.headline`, 16 vertical, 18 corners.
  action: { minHeight: 54, borderRadius: 18, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, paddingHorizontal: 12 },
  reviewRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, backgroundColor: '#FFFFFF' },
  reviewIcon: { width: 44, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  edit: { padding: 12, borderRadius: 12 },
  showMore: { minHeight: 44, justifyContent: 'center' },
  info: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, borderRadius: 16 },
  deliveryButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  deliveryStacked: { flexDirection: 'column', flexWrap: 'nowrap' },
  deliveryButtonStacked: { flexGrow: 0, flexBasis: 'auto' },
  deliveryButton: { flexGrow: 1, flexBasis: 150 },
  editor: { gap: 18 },
  field: { borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(60, 60, 67, 0.29)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 8, fontSize: 17, color: SCHEDULE_INK, backgroundColor: '#FFFFFF' },
  sendNowCard: { gap: 8, padding: 16, borderRadius: 16 },
  success: { padding: 24, gap: 24, alignItems: 'stretch' },
  check: { width: 132, height: 132, borderRadius: 66, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginTop: 32 },
  summary: { gap: 8, alignItems: 'center' },
});
