import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from 'zustand';

import type { ImportantMoment } from '../../api/moments';
import { GlassCircle } from '../../components/PushedHeader';
import { ClockField } from '../../components/SettingsControls';
import { withAlpha } from '../../components/SignInBackdrop';
import { Text } from '../../components/Text';
import { brand, textStyles, useTheme } from '../../theme';
import { BorderedButton, caption, headline, IconLabel, KeyboardDoneBar, MomentCard, MomentSheet, systemColors, title1 } from './components';
import { connectState, connectStatusLabel, createMomentConnectModel, isDirty, isVerified, type ConnectOperation } from './connectCall';
import { FormButton, FormField, FormRow, FormScroll, FormSection, FormToggle, genericZoneName, ZonePicker } from './form';
import { momentsStore } from './store';

/**
 * "Connect me on the day" (ios/App/MomentConnectCall.swift:166-305), on Manage Moment's Schedule step:
 * on the moment's day the SERVER calls you and, if you say yes, bridges you to the recipient, who sees
 * your own verified number. Built on Windows' part 1 model (`connectCall.ts`); every request goes
 * through the moments store, so an answer after a sign-out is dropped.
 *
 * Nothing here places a call by itself: "Call me to verify" asks Twilio to ring YOUR number, and
 * "Connect now" (only on the day) asks the server to start the call.
 */

/** `name(_:)` (:179-182): the recipient's first name, else the moment's title. */
function recipientName(moment: ImportantMoment): string {
  const first = moment.firstName.trim();
  return first === '' ? moment.title : first;
}

const request = <R,>(operation: ConnectOperation, input: unknown) => momentsStore.getState().request<R>(operation, input);

export function MomentConnectSection({ moments }: { moments: ImportantMoment[] }) {
  const theme = useTheme();
  const ids = moments.map((moment) => moment.id).join(',');
  const [model] = useState(() => createMomentConnectModel({ request }, moments.map((moment) => moment.id)));
  const state = useStore(model);
  const [verifying, setVerifying] = useState(false);
  const [verifyKey, setVerifyKey] = useState(0);
  const [guide, setGuide] = useState(false);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstName = moments[0] ? recipientName(moments[0]) : 'They';

  // `.task` and `.onChange(of: moments.map(\.id))`: load for the selected recipients' moments.
  useEffect(() => {
    void model.getState().load(ids === '' ? [] : ids.split(','));
  }, [model, ids]);
  useEffect(() => () => {
    if (previewTimer.current) clearTimeout(previewTimer.current);
  }, []);

  // `.alert("Connect me on the day")` for every error and notice, with OK.
  useEffect(() => {
    const message = state.error ?? state.notice;
    if (message === null) return;
    Alert.alert('Connect me on the day', message, [
      {
        text: 'OK',
        style: 'cancel',
        onPress: () => {
          model.getState().setError(null);
          model.getState().setNotice(null);
        },
      },
    ]);
  }, [model, state.error, state.notice]);

  /** `schedulePreview(_:)` (:290-297): ask the server for the preview 350 ms after the last edit. */
  const schedulePreview = (id: string) => {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => void model.getState().refreshPreview(id), 350);
  };

  const verified = isVerified(state.status);
  return (
    <View style={styles.section} testID="connect-section">
      <Text style={[textStyles.title2, styles.bold, { color: theme.colors.label }]}>Connect me on the day</Text>
      <Text style={[textStyles.subheadline, { color: theme.colors.secondaryLabel }]}>
        Nexdo calls you at the time you choose and, if you say yes, connects you so you can wish them yourself. They see your own number.
      </Text>
      {state.status && !state.status.available ? (
        <MomentCard testID="connect-unavailable">
          <IconLabel icon="call-outline" title="Connect calls aren’t available yet." />
        </MomentCard>
      ) : state.status ? (
        <>
          {/* `callerIDCard` (:209-227) */}
          <MomentCard testID="connect-caller-id">
            {verified && state.status.callerId ? (
              <View style={styles.row}>
                <Ionicons name="shield-checkmark" size={20} color={systemColors.green} />
                <View style={styles.grow}>
                  <Text style={[headline, { color: theme.colors.label }]}>Your number is verified</Text>
                  <Text style={[caption, { color: theme.colors.secondaryLabel }]}>{`${firstName} will see ${state.status.callerId.phone}`}</Text>
                </View>
                <Pressable accessibilityRole="button" hitSlop={6} onPress={() => openVerify(setVerifyKey, setVerifying)} testID="connect-change-number">
                  <Text style={[textStyles.body, { color: theme.colors.link }]}>Change</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <IconLabel icon="shield-checkmark-outline" title={`Verify your number first so ${firstName} sees it’s you.`} style={textStyles.subheadline} size={15} />
                <View style={styles.leading}>
                  <BorderedButton prominent title="Verify my number" onPress={() => openVerify(setVerifyKey, setVerifying)} testID="connect-verify-number" />
                </View>
              </>
            )}
          </MomentCard>
          {moments.map((moment) => {
            const momentState = connectState(state.status, moment.id);
            const draft = state.drafts[moment.id];
            const name = recipientName(moment);
            if (!momentState || !draft) {
              return (
                <MomentCard key={moment.id} testID={`connect-moment-${moment.id}`}>
                  <Text style={[headline, { color: theme.colors.label }]}>{name}</Text>
                  <Text style={[caption, { color: theme.colors.secondaryLabel }]}>Save this moment first to set up a connect call.</Text>
                </MomentCard>
              );
            }
            const preview = state.previews[moment.id];
            const noPhone = momentState.recipientPhone == null;
            return (
              <MomentCard key={moment.id} testID={`connect-moment-${moment.id}`}>
                {/*
                  `.disabled(!model.verified || state.recipientPhone == nil || state.passed)` (:237). Swift gives
                  a reason for the last two only; an unverified number has none at the switch — the card above
                  says to verify. Kept as Swift draws it (§22 "For the team").
                */}
                <FormToggle
                  label={`Connect me to ${name}`}
                  value={draft.enabled}
                  disabled={!verified || noPhone || momentState.passed}
                  onValueChange={(enabled) => {
                    model.getState().setDraft(moment.id, { ...draft, enabled });
                    schedulePreview(moment.id);
                  }}
                  testID={`connect-toggle-${moment.id}`}
                />
                {noPhone ? (
                  <Text style={[caption, { color: systemColors.orange }]} testID={`connect-no-phone-${moment.id}`}>
                    {`Add ${name}’s phone number with its country code (for example +91 98765 43210) to use this.`}
                  </Text>
                ) : momentState.passed ? (
                  <Text style={[caption, { color: theme.colors.secondaryLabel }]} testID={`connect-passed-${moment.id}`}>
                    This moment has already passed.
                  </Text>
                ) : null}
                {draft.enabled ? (
                  <>
                    <ClockField
                      hourCycle="h12"
                      variant="formRow"
                      label="Call time"
                      value={draft.time}
                      onChange={(time) => {
                        model.getState().setDraft(moment.id, { ...draft, time });
                        schedulePreview(moment.id);
                      }}
                      testID={`connect-time-${moment.id}`}
                    />
                    <View style={styles.row}>
                      <Text style={[textStyles.body, styles.grow, { color: theme.colors.label }]}>Time zone</Text>
                      <ZonePicker
                        hideLabel
                        value={draft.timeZone}
                        onChange={(timeZone) => {
                          model.getState().setDraft(moment.id, { ...draft, timeZone });
                          schedulePreview(moment.id);
                        }}
                        format={genericZoneName}
                        testID={`connect-zone-${moment.id}`}
                      />
                    </View>
                    {preview ? (
                      <>
                        <Text style={[caption, { color: theme.colors.secondaryLabel }]} testID={`connect-preview-${moment.id}`}>
                          {`On ${name}’s day, Nexdo calls you at ${preview.recipientLocal} their time (${preview.userLocal} your time) and connects you. ${name} sees your number.`}
                        </Text>
                        {!preview.userOk ? (
                          <IconLabel icon="warning" title={`That’s ${preview.userLocal} for you. Choose a time between 8:00 AM and 9:30 PM your time.`} color={theme.colors.danger} style={caption} size={12} />
                        ) : !preview.recipientOk ? (
                          <IconLabel icon="moon" title={`That’s ${preview.recipientLocal} for ${name}.`} color={systemColors.orange} style={caption} size={12} />
                        ) : null}
                      </>
                    ) : null}
                  </>
                ) : null}
                {isDirty(state, moment.id) ? (
                  <View style={styles.leading}>
                    <BorderedButton
                      prominent
                      title={draft.enabled ? 'Save call time' : 'Turn off connect call'}
                      disabled={state.busy || (draft.enabled && preview?.userOk === false)}
                      onPress={() => void model.getState().save(moment.id)}
                      testID={`connect-save-${moment.id}`}
                    />
                  </View>
                ) : null}
                <Pressable accessibilityRole="button" onPress={() => setGuide(true)} style={styles.howItWorks} testID={`connect-how-it-works-${moment.id}`}>
                  <Ionicons name="help-circle-outline" size={17} color={theme.colors.link} />
                  <Text style={[textStyles.subheadline, styles.semibold, { color: theme.colors.link }]}>How it works</Text>
                </Pressable>
                {momentState.lastCall ? (
                  <Text style={[caption, { color: theme.colors.secondaryLabel }]}>{`Last call (${momentState.lastCall.date}): ${connectStatusLabel(momentState.lastCall.status)}`}</Text>
                ) : null}
                {momentState.isToday && verified && !noPhone ? (
                  <Pressable accessibilityRole="button" disabled={state.busy} onPress={() => void model.getState().connectNow(moment.id)} style={styles.howItWorks} testID={`connect-now-${moment.id}`}>
                    <Ionicons name="call" size={17} color={theme.colors.link} />
                    <Text style={[textStyles.body, { color: theme.colors.link }]}>Connect now</Text>
                  </Pressable>
                ) : null}
              </MomentCard>
            );
          })}
        </>
      ) : (
        <ActivityIndicator style={styles.loading} testID="connect-loading" />
      )}
      <CallerIDVerificationSheet key={`verify-${verifyKey}`} model={model} visible={verifying} onClose={() => setVerifying(false)} />
      <MomentCallingGuide visible={guide} onClose={() => setGuide(false)} />
    </View>
  );
}

/** A fresh sheet each time it opens (Swift creates the sheet's state anew). */
function openVerify(setKey: (update: (key: number) => number) => void, setVisible: (value: boolean) => void) {
  setKey((key) => key + 1);
  setVisible(true);
}

type ConnectModel = ReturnType<typeof createMomentConnectModel>;

/**
 * `CallerIDVerificationSheet` (MomentConnectCall.swift:306-380): Twilio calls YOUR number and you type
 * the code shown here on its keypad. The status is polled every 3 seconds, at most 60 times, and the
 * polling stops when the sheet closes.
 */
export function CallerIDVerificationSheet({ model, visible, onClose }: { model: ConnectModel; visible: boolean; onClose: () => void }) {
  const theme = useTheme();
  const state = useStore(model);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState(false);
  const polling = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopPolling = () => {
    if (polling.current) clearTimeout(polling.current);
    polling.current = null;
  };
  // `.onDisappear { polling?.cancel() }`
  useEffect(() => {
    if (!visible) stopPolling();
  }, [visible]);
  useEffect(() => stopPolling, []);

  const showVerified = !editing && isVerified(state.status);
  const digits = phone.replace(/\D/g, '').length;

  const start = async () => {
    setFailed(false);
    const number = phone.trim();
    const started = await model.getState().startVerification(number);
    if (started === null) {
      if (isVerified(model.getState().status)) {
        setCode(null);
        setEditing(false);
      }
      return;
    }
    setCode(started);
    stopPolling();
    let attempts = 0;
    const poll = () => {
      polling.current = setTimeout(async () => {
        attempts += 1;
        const status = await model.getState().pollVerification();
        if (polling.current === null) return;
        if (status === 'VERIFIED') {
          setCode(null);
          setEditing(false);
          return;
        }
        if (status === 'FAILED') {
          setFailed(true);
          return;
        }
        if (attempts < 60) poll();
      }, 3000);
    };
    poll();
  };

  return (
    <MomentSheet visible={visible} title="" onRequestClose={onClose} right={{ title: 'Done', onPress: onClose, bold: true, testID: 'caller-id-done' }} testID="caller-id-sheet">
      <FormScroll>
        <Text style={[textStyles.largeTitle, styles.bold, styles.sheetTitle, { color: theme.colors.label }]}>Show my number</Text>
        {code !== null ? (
          <FormSection header="Answer the call from Twilio">
            <FormRow>
              <Text style={[textStyles.body, { color: theme.colors.label }]}>{`Twilio is calling ${phone} now. When asked, type this code on your phone’s keypad:`}</Text>
            </FormRow>
            <FormRow>
              <Text style={[styles.code, { color: theme.colors.label }]} testID="caller-id-code">
                {code.split('').join(' ')}
              </Text>
            </FormRow>
            {failed ? (
              <>
                <FormRow>
                  <IconLabel icon="close-circle" title="That didn’t work. Try again." color={theme.colors.danger} />
                </FormRow>
                <FormRow>
                  <FormButton title="Call me again" onPress={() => void start()} testID="caller-id-again" />
                </FormRow>
              </>
            ) : (
              <FormRow>
                <View style={styles.row}>
                  <ActivityIndicator />
                  <Text style={[textStyles.body, { color: theme.colors.secondaryLabel }]}>Waiting for the call to finish…</Text>
                </View>
              </FormRow>
            )}
            <FormRow last>
              <Text style={[caption, { color: theme.colors.secondaryLabel }]}>The verification call is in English.</Text>
            </FormRow>
          </FormSection>
        ) : showVerified ? (
          <>
            <FormSection>
              <FormRow>
                <IconLabel icon="shield-checkmark" title={`Verified: ${state.status?.callerId?.phone ?? ''}`} color={systemColors.green} />
              </FormRow>
              <FormRow last>
                <Text style={[caption, { color: theme.colors.secondaryLabel }]}>When Nexdo connects you, the person you call sees this number.</Text>
              </FormRow>
            </FormSection>
            <FormSection>
              <FormRow last>
                <FormButton
                  title="Verify a different number"
                  onPress={() => {
                    setEditing(true);
                    setPhone('');
                  }}
                  testID="caller-id-different"
                />
              </FormRow>
            </FormSection>
            <FormSection>
              <FormRow last>
                <FormButton
                  destructive
                  title="Remove my number"
                  onPress={() => {
                    void model
                      .getState()
                      .removeNumber()
                      .then(onClose);
                  }}
                  testID="caller-id-remove"
                />
              </FormRow>
            </FormSection>
          </>
        ) : (
          <>
            <FormSection header="Your mobile number">
              <FormRow>
                <FormField placeholder="+1 650 555 0123" keyboardType="phone-pad" value={phone} onChangeText={setPhone} testID="caller-id-phone" />
              </FormRow>
              <FormRow last>
                <Text style={[caption, { color: theme.colors.secondaryLabel }]}>Include your country code. Twilio will call this number once; you type a 6-digit code to prove it’s yours.</Text>
              </FormRow>
            </FormSection>
            <FormSection>
              <FormRow last>
                <FormButton title="Call me to verify" disabled={state.busy || digits < 8} onPress={() => void start()} testID="caller-id-start" />
              </FormRow>
            </FormSection>
          </>
        )}
      </FormScroll>
      <KeyboardDoneBar />
    </MomentSheet>
  );
}

/** The guide's fixed light palette (`ink`, MomentConnectCall.swift:384), as Swift draws it in both modes. */
const GUIDE_INK = '#120D3D'; // Color(red: 0.07, green: 0.05, blue: 0.24)
const GUIDE_SECONDARY = 'rgba(60, 60, 67, 0.6)';
/**
 * `Color.nexdoIndigo` as this FIXED-LIGHT guide uses it (`.tint(.nexdoIndigo)`, :437). It never meets a
 * dark background, so the dark-mode `link` rule does not apply — as Wellness's `fixedLightIndigo`.
 */
const GUIDE_INDIGO = brand.nexdoIndigo;
const GUIDE_ART = {
  header: require('../../../assets/moments/calling-header.png'),
  steps: [require('../../../assets/moments/calling-step1.png'), require('../../../assets/moments/calling-step2.png'), require('../../../assets/moments/calling-step3.png')],
};
const GUIDE_STEPS: [string, string][] = [
  ['Set it up', 'Turn on the calling feature, verify your phone number, and choose the call time and time zone.'],
  ['We call you', 'On the selected day, NexDo calls you at the scheduled time. Answer the call and confirm that you’d like to be connected.'],
  ['You’re connected', 'After you say yes, we dial your loved one and connect you. They’ll see your verified phone number.'],
];
const GOOD_TO_KNOW = [
  '• We call you only on the days you choose.',
  '• If you don’t answer or confirm, we won’t call your loved one.',
  '• Your loved one sees your verified phone number.',
  '• You can change or turn off this feature anytime.',
];

/**
 * `MomentCallingGuide` (MomentConnectCall.swift:381-444): "How It Works", a sheet in the guide's own
 * light design. The pictures are `moment-calling-pack`'s regions, cut once into assets/moments/.
 *
 * NOT COPIED: Swift's one-line title truncates to "We call for you on s…" (`moment-calling-guide`); it
 * wraps here (§22 "For the team").
 */
export function MomentCallingGuide({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const bottom = useMemo(() => 20 + insets.bottom, [insets.bottom]);
  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined} statusBarTranslucent visible={visible}>
      <View style={styles.guide} testID="calling-guide">
        <LinearGradient colors={[withAlpha(systemColors.blue, 0.13), withAlpha(systemColors.purple, 0.09), '#FFFFFF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <View style={[styles.guideBar, { paddingTop: Platform.OS === 'android' ? insets.top + 8 : 12 }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={6} onPress={onClose} testID="calling-guide-back">
            <GlassCircle scheme="light">
              <Ionicons name="chevron-back" size={24} color={GUIDE_INDIGO} />
            </GlassCircle>
          </Pressable>
          <Text accessibilityRole="header" style={[styles.guideBarTitle, { color: GUIDE_INK }]}>
            How It Works
          </Text>
          <View style={styles.guideBarSpacer} />
        </View>
        <ScrollView contentContainerStyle={[styles.guideContent, { paddingBottom: bottom }]}>
          <View style={styles.guideHeader}>
            <Image accessible={false} resizeMode="contain" source={GUIDE_ART.header} style={styles.guideHeaderArt} />
            <View style={styles.guideHeaderText}>
              <Text style={[title1, styles.bold, { color: GUIDE_INK }]}>We call for you on special days</Text>
              <Text style={[textStyles.body, { color: GUIDE_SECONDARY }]}>NexDo makes the call at the time you choose and connects you with your loved ones.</Text>
            </View>
          </View>
          {GUIDE_STEPS.map(([title, text], index) => (
            <View key={title} style={styles.guideStep} testID={`calling-guide-step-${index + 1}`}>
              <View style={[styles.guideNumber, { backgroundColor: withAlpha(brand.nexdoIndigo, 0.09) }]}>
                <Text style={[textStyles.title3, styles.bold, { color: GUIDE_INDIGO }]}>{String(index + 1)}</Text>
              </View>
              <View style={styles.guideCard}>
                <View style={styles.guideCardText}>
                  <Text style={[textStyles.title3, styles.bold, { color: GUIDE_INK }]}>{title}</Text>
                  <Text style={[textStyles.subheadline, { color: GUIDE_SECONDARY }]}>{text}</Text>
                </View>
                <Image accessible={false} resizeMode="contain" source={GUIDE_ART.steps[index]} style={styles.guideStepArt} />
              </View>
            </View>
          ))}
          <View style={[styles.goodToKnow, { backgroundColor: withAlpha(systemColors.blue, 0.08) }]}>
            <Ionicons name="information-circle" size={26} color={systemColors.blue} />
            <View style={styles.guideCardText}>
              <Text style={[headline, { color: GUIDE_INK }]}>Good to know</Text>
              {GOOD_TO_KNOW.map((line) => (
                <Text key={line} style={[textStyles.subheadline, { color: GUIDE_INK }]}>
                  {line}
                </Text>
              ))}
            </View>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Got it!" onPress={onClose} testID="calling-guide-done">
            <LinearGradient colors={[systemColors.purple, brand.nexdoIndigo]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.guideDone}>
              <Text style={[headline, { color: '#FFFFFF' }]}>Got it!</Text>
            </LinearGradient>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onClose} style={styles.guideBack} testID="calling-guide-settings">
            <Text style={[headline, { color: GUIDE_INK }]}>Back to settings</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  bold: { fontWeight: '700' },
  semibold: { fontWeight: '600' },
  grow: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  leading: { alignItems: 'flex-start' },
  loading: { alignSelf: 'center' },
  howItWorks: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, alignSelf: 'flex-start' },
  sheetTitle: { marginHorizontal: 16, marginTop: 4 },
  code: { fontSize: 40, lineHeight: 48, fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', textAlign: 'center', alignSelf: 'stretch' },
  guide: { flex: 1, backgroundColor: '#FFFFFF' },
  guideBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 6 },
  guideBarTitle: { flex: 1, textAlign: 'center', fontSize: 17, lineHeight: 22, fontWeight: '600' },
  guideBarSpacer: { width: 44 },
  guideContent: { padding: 20, gap: 20 },
  guideHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 16, paddingVertical: 12 },
  guideHeaderArt: { width: 76, height: 76 },
  guideHeaderText: { flex: 1, gap: 10 },
  guideStep: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  guideNumber: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  guideCard: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 18, borderRadius: 24, backgroundColor: 'rgba(255, 255, 255, 0.9)' },
  guideCardText: { flex: 1, gap: 10 },
  guideStepArt: { width: 100, height: 120 },
  goodToKnow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 18, borderRadius: 22 },
  guideDone: { minHeight: 52, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  guideBack: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
