import * as Clipboard from 'expo-clipboard';
import { randomUUID } from 'expo-crypto';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, Image, Linking, Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IOSSwitch } from '../../components/IOSSwitch';
import { GlassCircle } from '../../components/PushedHeader';
import { StickyFooter } from '../../components/StickyFooter';
import { TaskSymbol } from '../../components/TaskSymbol';
import { Text } from '../../components/Text';
import { useSubmitBugReport } from '../../query/useFeedback';
import { inputText, isAndroid, useTheme } from '../../theme';
import { withAlpha } from '../../components/SignInBackdrop';
import { bugReportDismissed, closeBugReport, setShakeEnabled, useBugReport, type BugReportSession } from './coordinator';
import {
  BUG_DESCRIPTION_LIMIT,
  BUG_FAILURE,
  bugDraftValid,
  bugFailureMessage,
  bugSubmission,
  clampBugDescription,
  includeScreenshot,
  newBugDraft,
  removeScreenshot,
  type BugReportDraft,
} from './model';

/**
 * `BugReportView` (ios/App/BugReportView.swift, d511fef / a13461a / da57b57): the introduction, the
 * "Report app issue" form and the success page, in one full-screen modal over the screen it was opened
 * from (`overFullScreen`, `isModalInPresentation`). The data layer is §32's: `model.ts` for the draft,
 * the frozen retry and the failure messages, `bugReportApi` for the request.
 */

/** `Color(red: 0.39, green: 0.40, blue: 0.95)` (:21). */
export const BUG_ACCENT = '#6366F2';

export const CONSENT = {
  title: 'Include a screenshot?',
  message: 'Capture the app screen behind this report. Review the preview for private information. It will only be uploaded when you tap Send. Never include passwords, keys or tokens.',
};
export const PRESERVED = 'Your report is preserved. Retry sends the same report safely.';
/** The pasteboard item expires after 120 seconds (:173). */
export const COPY_EXPIRY_MS = 120_000;

const ARTWORK = {
  intro: { source: require('../../../assets/bug-report/intro.png'), width: 131, height: 108 },
  success: { source: require('../../../assets/bug-report/success.png'), width: 110, height: 108 },
};

export default function BugReportRoute() {
  const session = useBugReport((state) => state.session);
  // `bugReportDismissed` on the way out, by Close, Done or the system back.
  useEffect(() => () => bugReportDismissed(), []);
  if (!session) return null;
  return <BugReportScreen session={session} onDone={closeBugReport} />;
}

export function BugReportScreen({ session, onDone }: { session: BugReportSession; onDone: () => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const shakeEnabled = useBugReport((state) => state.shakeEnabled);
  const submit = useSubmitBugReport();
  const [draft, setDraft] = useState<BugReportDraft>(() => newBugDraft(randomUUID));
  const [editing, setEditing] = useState(false);
  const [reference, setReference] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const sending = submit.isPending;
  const sendingRef = useRef(false);
  const { diagnostics } = session;

  // `finish()` (:197): the draft goes with the report.
  const finish = () => {
    setDraft(newBugDraft(randomUUID));
    onDone();
  };

  /** × (:58-62): with text and no reference, confirm first. */
  const close = () => {
    if (sending) return;
    if (draft.description !== '' && reference === null) {
      Alert.alert('Discard this report?', undefined, [
        { text: 'Keep Report', style: 'cancel' },
        { text: 'Discard Report', style: 'destructive', onPress: finish },
      ]);
    } else finish();
  };

  // Android's back: the form's Back chevron, otherwise ×. Never while sending (`.disabled(sending)`).
  // Registered again after every render, so it always sees the current page.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (sendingRef.current) return true;
      if (editing && reference === null) setEditing(false);
      else close();
      return true;
    });
    return () => subscription.remove();
  });

  /** `takeScreenshot()` (:180-183): the capture taken before the report opened, or Swift's refusal. */
  const takeScreenshot = () => {
    if (session.capture.kind !== 'captured') {
      setError(BUG_FAILURE.screenshotUnavailable);
      return;
    }
    const base64 = session.capture.base64;
    setDraft((current) => includeScreenshot(current, base64));
    setError(null);
  };

  const askConsent = () =>
    Alert.alert(CONSENT.title, CONSENT.message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Include Screenshot', onPress: takeScreenshot },
    ]);

  /** `send()` (:184-195): the first request is frozen and every retry resends it. */
  const send = () => {
    if (sendingRef.current) return;
    const submission = bugSubmission(draft, diagnostics);
    if (!submission) return;
    setDraft(submission.draft);
    setError(null);
    sendingRef.current = true;
    submit
      .mutateAsync(submission.input)
      .then((receipt) => {
        setReference(receipt.reference);
        setDraft(newBugDraft(randomUUID));
      })
      .catch((cause: unknown) => setError(bugFailureMessage(cause)))
      .finally(() => {
        sendingRef.current = false;
      });
  };

  /** Copy reference (:172-175): Android has no expiring pasteboard item, so it is cleared after 120 s if still there. */
  const copy = async (ref: string) => {
    await Clipboard.setStringAsync(ref);
    setCopied(true);
    setTimeout(() => {
      void Clipboard.getStringAsync()
        .then((current) => (current === ref ? Clipboard.setStringAsync('') : undefined))
        .catch(() => undefined);
    }, COPY_EXPIRY_MS);
  };

  const formInvalid = reference === null && editing && !bugDraftValid(draft);
  const primaryTitle = reference !== null ? 'Done' : editing ? (error !== null && draft.frozen !== null ? 'Retry Send' : 'Send') : 'Report Bug';
  const primary = () => {
    if (reference !== null) finish();
    else if (editing) send();
    else setEditing(true);
  };
  const frozen = draft.frozen !== null;
  // The preview keeps the screen's shape, inside 145 × 260 (`.scaledToFit().frame(maxWidth: 145, maxHeight: 260)`).
  const aspect = window.height / window.width;
  const previewHeight = Math.min(260, 145 * aspect);
  const previewWidth = previewHeight / aspect;

  return (
    <View style={[styles.fill, { backgroundColor: theme.colors.groupedBackground }]} testID="bug-report">
      <LinearGradient
        colors={[withAlpha(BUG_ACCENT, 0.1), 'transparent', withAlpha(BUG_ACCENT, 0.06)]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View accessibilityElementsHidden={sending} importantForAccessibility={sending ? 'no-hide-descendants' : 'auto'} style={styles.fill}>
        {/* The navigation bar: Back (form only), the inline title, × (:51-63). */}
        <View style={[styles.bar, { paddingTop: insets.top + 8 }]}>
          <View style={styles.barSide}>
            {editing && reference === null ? (
              <Pressable accessibilityLabel="Back" accessibilityRole="button" disabled={sending} hitSlop={6} onPress={() => setEditing(false)} style={{ opacity: sending ? 0.4 : 1 }} testID="bug.back">
                <GlassCircle>
                  <TaskSymbol color={BUG_ACCENT} name="chevron.left" size={22} />
                </GlassCircle>
              </Pressable>
            ) : null}
          </View>
          <Text accessibilityRole="header" numberOfLines={1} style={[styles.headline, styles.barTitle, { color: theme.colors.label }]}>
            {editing && reference === null ? 'Report app issue' : ''}
          </Text>
          <View style={[styles.barSide, styles.trailing]}>
            <Pressable accessibilityLabel="Close" accessibilityRole="button" disabled={sending} hitSlop={6} onPress={close} style={{ opacity: sending ? 0.4 : 1 }} testID="bug.close">
              <GlassCircle>
                <TaskSymbol color={BUG_ACCENT} name="xmark" size={22} />
              </GlassCircle>
            </Pressable>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled">
          <View style={styles.column}>
            {reference !== null ? (
              /* `success(_:)` (:165-178). */
              <View style={[styles.centred, { gap: 24 }]} testID="bug.success">
                <Artwork kind="success" />
                <Text style={[styles.largeTitle, styles.centreText, { color: theme.colors.label }]}>Thanks for helping improve NexDo!</Text>
                <Text style={[styles.body, styles.centreText, { color: theme.colors.label }]}>Your bug report has been received.</Text>
                <View style={[styles.card, styles.referenceCard, { backgroundColor: withAlpha(BUG_ACCENT, 0.09) }]}>
                  <View style={styles.label}>
                    <TaskSymbol color={theme.colors.label} name="checkmark.circle.fill" size={20} />
                    <Text style={[styles.headline, { color: theme.colors.label }]}>Reference ID</Text>
                  </View>
                  <Text selectable style={[styles.mono, { color: theme.colors.label }]} testID="bug.reference">
                    {reference}
                  </Text>
                  <Pressable accessibilityRole="button" onPress={() => void copy(reference)} style={styles.label} testID="bug.copy">
                    <TaskSymbol color={BUG_ACCENT} name="doc.on.doc" size={18} />
                    <Text style={[styles.body, { color: BUG_ACCENT }]}>{copied ? 'Reference copied' : 'Copy reference'}</Text>
                  </Pressable>
                </View>
              </View>
            ) : editing ? (
              /* `form` (:103-150). */
              <View style={{ gap: 18 }} testID="bug.form">
                <Text style={[styles.headline, { color: theme.colors.label }]}>What happened?</Text>
                <Text style={[styles.footnote, { color: theme.colors.secondaryLabel }]}>
                  Tell us about the issue you encountered. Do not include passwords, API keys, tokens or unrelated personal information.
                </Text>
                <TextInput
                  accessibilityLabel="Issue description"
                  editable={!frozen}
                  maxLength={BUG_DESCRIPTION_LIMIT}
                  multiline
                  onChangeText={(value) => setDraft((current) => ({ ...current, description: clampBugDescription(value) }))}
                  style={[
                    inputText(theme.typography.body),
                    styles.editor,
                    { color: theme.colors.label, backgroundColor: theme.colors.background, borderColor: withAlpha(BUG_ACCENT, 0.2) },
                    frozen ? styles.dim : null,
                  ]}
                  testID="bug.description"
                  textAlignVertical="top"
                  value={draft.description}
                />
                <Text style={[styles.caption, styles.trailingText, { color: theme.colors.secondaryLabel }]} testID="bug.count">
                  {`${draft.description.length} / ${BUG_DESCRIPTION_LIMIT}`}
                </Text>
                <View style={styles.toggleRow}>
                  <Text style={[styles.body, styles.grow, { color: theme.colors.label }]}>Include screenshot in report</Text>
                  <IOSSwitch
                    accessibilityLabel="Include screenshot in report"
                    disabled={frozen}
                    onValueChange={(on) => (on ? askConsent() : setDraft((current) => removeScreenshot(current)))}
                    testID="bug.screenshot"
                    value={draft.screenshotConsent}
                  />
                </View>
                {draft.screenshot !== null ? (
                  <View style={styles.screenshotRow} testID="bug.preview">
                    <Image
                      accessibilityLabel="Screenshot preview of original app screen"
                      resizeMode="contain"
                      source={{ uri: `data:image/jpeg;base64,${draft.screenshot}` }}
                      style={{ width: previewWidth, height: previewHeight, borderRadius: 12 }}
                    />
                    <View style={[styles.grow, { gap: 16, opacity: frozen ? 0.4 : 1 }]}>
                      <View style={styles.label}>
                        <TaskSymbol color={theme.colors.success} name="checkmark.circle.fill" size={20} />
                        <Text style={[styles.body, { color: theme.colors.success }]}>Screenshot captured</Text>
                      </View>
                      <Text style={[styles.caption, { color: theme.colors.label }]}>Review for private information before sending.</Text>
                      <Pressable accessibilityRole="button" disabled={frozen} onPress={askConsent} style={styles.label} testID="bug.retake">
                        <TaskSymbol color={BUG_ACCENT} name="arrow.clockwise" size={18} />
                        <Text style={[styles.body, { color: BUG_ACCENT }]}>Retake</Text>
                      </Pressable>
                      <Pressable accessibilityRole="button" disabled={frozen} onPress={() => setDraft((current) => removeScreenshot(current))} style={styles.label} testID="bug.remove">
                        <TaskSymbol color={theme.colors.danger} name="trash" size={18} />
                        <Text style={[styles.body, { color: theme.colors.danger }]}>Remove Screenshot</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <View style={styles.label}>
                    <TaskSymbol color={theme.colors.secondaryLabel} name="iphone" size={14} />
                    <Text style={[styles.footnote, styles.grow, { color: theme.colors.secondaryLabel }]}>Optional. Capture the original app screen, then review it before sending.</Text>
                  </View>
                )}
                {/* `DisclosureGroup("What we’ll include")` (:131-140). */}
                <View style={[styles.card, { backgroundColor: theme.colors.background }]}>
                  <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded((open) => !open)} style={styles.disclosure} testID="bug.include">
                    <Text style={[styles.body, styles.grow, { color: BUG_ACCENT }]}>What we’ll include</Text>
                    <TaskSymbol color={theme.colors.label} name={expanded ? 'chevron.down' : 'chevron.right'} size={16} />
                  </Pressable>
                  {expanded ? (
                    <View style={styles.diagnostics} testID="bug.diagnostics">
                      <Diagnostic label="App version and build" value={`${diagnostics.appVersion} (${diagnostics.buildNumber})`} />
                      <Diagnostic label="Device model" value={diagnostics.deviceModel} />
                      <Diagnostic label="iOS version" value={diagnostics.iosVersion} />
                      <Diagnostic label="Current app screen" value={diagnostics.screen} />
                      <Diagnostic label="Timestamp" value={diagnostics.timestamp} />
                      <Diagnostic label="Anonymous correlation ID" value={diagnostics.correlationID} />
                    </View>
                  ) : null}
                </View>
                <View style={styles.label}>
                  <TaskSymbol color={theme.colors.secondaryLabel} name="checkmark.shield.fill" size={14} />
                  <Text style={[styles.footnote, styles.grow, { color: theme.colors.secondaryLabel }]}>
                    Reports are kept for 90 days and screenshots for 7 days. No full logs or screen recordings are collected.
                  </Text>
                </View>
                <Pressable accessibilityRole="link" onPress={() => void Linking.openURL('mailto:support@nexdoapp.com')} testID="bug.support">
                  <Text style={[styles.body, { color: BUG_ACCENT }]}>Contact support</Text>
                </Pressable>
                {error !== null ? (
                  <View style={{ gap: 6 }}>
                    <Text style={[styles.body, { color: theme.colors.danger }]} testID="bug.error">
                      {error}
                    </Text>
                    {frozen ? <Text style={[styles.footnote, { color: theme.colors.label }]}>{PRESERVED}</Text> : null}
                  </View>
                ) : null}
              </View>
            ) : (
              /* `introduction` (:82-101). */
              <View style={{ gap: 22 }} testID="bug.intro">
                <View style={styles.brandRow}>
                  <LinearGradient colors={['#7C7EF6', BUG_ACCENT]} style={styles.brandIcon}>
                    <TaskSymbol color="#FFFFFF" name="calendar.badge.checkmark" size={28} />
                  </LinearGradient>
                  <View style={[styles.grow, { gap: 4 }]}>
                    <Text style={[styles.title2, { color: theme.colors.label }]}>NexDo</Text>
                    <Text style={[styles.caption, { color: theme.colors.secondaryLabel }]}>Less on your mind, more done in your day.</Text>
                  </View>
                </View>
                <View style={styles.centred}>
                  <Artwork kind="intro" />
                </View>
                <Text style={[styles.largeTitle, styles.centreText, { color: theme.colors.label }]}>Report a bug?</Text>
                <Text style={[styles.body, styles.centreText, { color: theme.colors.secondaryLabel }]}>
                  If something isn’t working correctly, you can report it to help us improve NexDo for everyone.
                </Text>
                <View style={[styles.card, styles.toggleRow, { backgroundColor: theme.colors.background }]}>
                  <TaskSymbol color={theme.colors.label} name="iphone.gen3.radiowaves.left.and.right" size={20} />
                  <Text style={[styles.body, styles.grow, { color: theme.colors.label }]}>Shake iPhone to report a bug</Text>
                  <IOSSwitch accessibilityLabel="Shake iPhone to report a bug" onValueChange={(on) => void setShakeEnabled(on)} testID="bug.shake" value={shakeEnabled} />
                </View>
                <View style={[styles.card, styles.label, { backgroundColor: withAlpha(BUG_ACCENT, 0.09) }]}>
                  <TaskSymbol color={theme.colors.label} name="heart.fill" size={18} />
                  <Text style={[styles.body, styles.grow, { color: theme.colors.label }]}>Thank you! Your feedback helps make NexDo better for everyone.</Text>
                </View>
                <Text style={[styles.title3, styles.centreText, { color: BUG_ACCENT }]}>Together we make NexDo better!</Text>
              </View>
            )}
          </View>
        </ScrollView>

        {/* `.safeAreaInset(edge: .bottom)`: the capsule on a material bar (:37-48). */}
        <StickyFooter background={theme.scheme === 'dark' ? 'rgba(28, 28, 30, 0.94)' : 'rgba(242, 242, 247, 0.94)'}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: sending || formInvalid }}
            disabled={sending || formInvalid}
            onPress={primary}
            style={[styles.primary, { backgroundColor: formInvalid ? '#8E8E93' : BUG_ACCENT }]}
            testID="bug.primary"
          >
            <Text style={[styles.headline, { color: '#FFFFFF' }]}>{primaryTitle}</Text>
          </Pressable>
        </StickyFooter>
      </View>

      {/* "Sending report..." over a dimmed screen (:64-70). */}
      {sending ? (
        <View style={styles.sendingLayer} testID="bug.sending">
          <View style={[styles.sendingCard, { backgroundColor: theme.scheme === 'dark' ? 'rgba(44, 44, 46, 0.94)' : 'rgba(242, 242, 247, 0.94)' }]}>
            <ActivityIndicator color={theme.colors.secondaryLabel} size="large" />
            <Text style={[styles.headline, { color: theme.colors.label }]}>Sending report...</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function Diagnostic({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View>
      <Text style={[styles.subheadlineBold, { color: theme.colors.label }]}>{label}</Text>
      <Text selectable style={[styles.caption, { color: theme.colors.label }]}>
        {value}
      </Text>
    </View>
  );
}

/** `BugArtwork` (:200-211): the pack's region at 1.3×, in a 24-point rounded square. */
function Artwork({ kind }: { kind: 'intro' | 'success' }) {
  const art = ARTWORK[kind];
  return <Image accessible={false} source={art.source} style={{ width: art.width * 1.3, height: art.height * 1.3, borderRadius: 24 }} testID={`bug.artwork.${kind}`} />;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8 },
  barSide: { width: 52 },
  trailing: { alignItems: 'flex-end' },
  barTitle: { flex: 1, textAlign: 'center' },
  scroll: { padding: 20, alignItems: 'center' },
  column: { width: '100%', maxWidth: 650 },
  centred: { alignItems: 'center' },
  centreText: { textAlign: 'center' },
  trailingText: { textAlign: 'right' },
  label: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  card: { padding: 16, borderRadius: 18 },
  referenceCard: { width: '100%', gap: 10, alignItems: 'center' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  brandIcon: { padding: 12, borderRadius: 14 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  screenshotRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  disclosure: { flexDirection: 'row', alignItems: 'center', minHeight: 24 },
  diagnostics: { gap: 10, paddingTop: 12, paddingLeft: 16 },
  editor: { minHeight: 160, padding: 16, borderRadius: 16, borderWidth: 1 },
  dim: { opacity: 0.6 },
  primary: { minHeight: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', padding: 16 },
  sendingLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0, 0, 0, 0.3)' },
  sendingCard: { alignItems: 'center', gap: 20, padding: 32, borderRadius: 24 },
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: '700' },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  title3: { fontSize: 20, lineHeight: 25, fontStyle: 'italic' },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 17, lineHeight: 22 },
  footnote: { fontSize: 13, lineHeight: 18 },
  caption: { fontSize: 12, lineHeight: 16 },
  subheadlineBold: { fontSize: 15, lineHeight: 20, fontWeight: '700' },
  mono: { fontSize: 16, lineHeight: 21, fontFamily: isAndroid() ? 'monospace' : 'Menlo' },
});
