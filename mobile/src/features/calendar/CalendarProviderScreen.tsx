import { useQueryClient } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { TaskSymbol } from '../../components/TaskSymbol';
import { Text } from '../../components/Text';
import { withAlpha } from '../../components/CalendarParts';
import { displayName, lastSyncedDescription } from '../../lib/calendarConnections';
import { deviceTimeZone, LEGAL_LINKS } from '../../lib/profileSettings';
import { useBlockDismiss } from '../../lib/useBlockDismiss';
import { useMinuteTick } from '../../lib/useMinuteTick';
import { queryKeys } from '../../query/keys';
import { CONNECTED_STATUS_UNLOADED, connectionsState, useCalendarConnections, useConnectCalendar } from '../../query/useCalendar';
import { useSession } from '../../store/session';
import { providerAccent, providerArt, providerConnected, providerConnections, providerPageCopy, type CalendarConnectProvider, type ProviderStep } from './calendarProviders';
import { CONNECT_ART } from './connectArt';
import { CONNECT_INK, ConnectSurface } from './ConnectSurface';
import { requestDeviceCalendarAccess } from './deviceCalendars';
import { useDeviceCalendarAccess } from './useDeviceCalendarAccess';

/**
 * `CalendarProviderConnectionView` (ios/App/CalendarConnectionView.swift:86-277): one provider's page.
 * The progress capsule, the icon, the three numbered steps with their artwork, the privacy label, the
 * connected state with each account's last sync, Connect Now → Connecting… → Done, and the toolbar's
 * Need help? / Cancel.
 *
 * Google and Microsoft share the OAuth flow (`useConnectCalendar`); the phone provider requests the
 * calendar permission and then opens the calendar list. Microsoft's OAuth could not be captured (§23),
 * so its page is built from the source and the Google captures.
 */
export function CalendarProviderScreen({
  provider,
  onBack,
  onHelp,
  onChooseCalendars,
  testID = 'calendar-provider-page',
}: {
  provider: CalendarConnectProvider;
  onBack: () => void;
  onHelp: () => void;
  onChooseCalendars: () => void;
  testID?: string;
}) {
  const copy = providerPageCopy(provider);
  const accent = providerAccent(provider);
  const device = provider === 'apple';
  const queryClient = useQueryClient();
  const connect = useConnectCalendar();
  const connectionsQuery = useCalendarConnections();
  const { connections } = connectionsState(connectionsQuery);
  const access = useDeviceCalendarAccess();
  const now = useMinuteTick();
  const zone = deviceTimeZone();

  const [connecting, setConnecting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const cancelled = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // `.navigationBarBackButtonHidden(connecting)` and `.interactiveDismissDisabled(connecting)`.
  useBlockDismiss(connecting, { parent: true });

  const connected = device ? access.allowed : confirmed || providerConnected(provider, connections, false);
  const muted = withAlpha(CONNECT_INK, 0.7);

  /** `beginConnection()` (`:225-268`). */
  const beginConnection = async () => {
    if (connecting) return;
    setConnecting(true);
    setFailure(null);
    setStatus(null);
    cancelled.current = false;
    const owner = useSession.getState().profile?.id ?? null;
    const stillMine = () => mounted.current && !cancelled.current && useSession.getState().profile?.id === owner;
    try {
      if (device) {
        const granted = await requestDeviceCalendarAccess();
        if (!stillMine()) return;
        const decision = await access.refresh();
        if (!stillMine()) return;
        if (!granted || decision !== 'allow') {
          setFailure(copy.accessNeeded);
          return;
        }
        setStatus(copy.accessAllowed);
        onChooseCalendars();
        return;
      }
      const result = await connect.mutateAsync({ provider });
      if (!stillMine()) return;
      if (result.kind === 'cancelled') {
        setStatus(copy.browserCancelled);
        return;
      }
      if (result.kind === 'failed') {
        setFailure(result.message);
        return;
      }
      setConfirmed(true);
      // `if !(await model.loadCalendarConnections())` — the list could not be reloaded after connecting.
      if (queryClient.getQueryState(queryKeys.calendar.connections())?.error) setStatus(CONNECTED_STATUS_UNLOADED);
    } catch (cause) {
      if (!stillMine()) return;
      setFailure(device ? copy.accessUnavailable : cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (mounted.current && !cancelled.current) setConnecting(false);
    }
  };

  /** `cancelConnection()` (`:270-275`): the toolbar Cancel, and leaving the page (`onDisappear`). */
  const cancelConnection = () => {
    if (!connecting) return;
    cancelled.current = true;
    if (Platform.OS === 'ios') {
      try {
        void WebBrowser.dismissAuthSession();
      } catch {
        // No session open: the token request was still in flight.
      }
    }
    setConnecting(false);
    setStatus(copy.cancelled);
  };
  useEffect(() => () => void (cancelled.current = true), []);

  const primaryAction = () => {
    if (connecting) return;
    if (connected) {
      if (device) onChooseCalendars();
      else onBack();
      return;
    }
    void beginConnection();
  };

  const primaryTitle = connecting ? copy.connecting : connected ? copy.done : copy.connectNow;

  return (
    <ConnectSurface
      accent={accent}
      backHidden={connecting}
      onBack={onBack}
      testID={testID}
      trailing={connecting ? { title: copy.cancel, onPress: cancelConnection, testID: 'calendar-connect-cancel' } : { title: copy.needHelp, onPress: onHelp, testID: 'calendar-connect-help' }}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.column}>
          <View style={[styles.progressTrack, { backgroundColor: withAlpha(accent, 0.15) }]}>
            <View style={[styles.progressFill, { backgroundColor: accent, width: connected ? 100 : 30 }]} testID="calendar-connect-progress" />
          </View>
          <Image resizeMode="contain" source={CONNECT_ART[providerArt(provider)]} style={styles.icon} />
          <View style={styles.heading}>
            <Text accessibilityRole="header" style={styles.title}>
              {copy.title}
            </Text>
            <Text style={[styles.subtitle, { color: muted }]}>{copy.subtitle}</Text>
          </View>

          <View style={styles.steps}>
            {copy.steps.map((step, index) => (
              <View key={step.title}>
                {index > 0 ? <View style={styles.divider} /> : null}
                <Step accent={accent} muted={muted} number={index + 1} provider={provider} step={step} allowAccess={copy.allowAccess} />
              </View>
            ))}
          </View>

          <View style={[styles.privacy, { backgroundColor: withAlpha(accent, 0.06) }]}>
            <TaskSymbol color={muted} name="lock.shield.fill" size={16} />
            <Text style={[styles.footnote, styles.grow, { color: muted }]}>{copy.privacy}</Text>
          </View>

          {connected ? (
            <View style={styles.connected}>
              <View style={styles.badge} testID="calendar-connect-success">
                <TaskSymbol color="#34C759" name="checkmark.circle.fill" size={17} />
                <Text style={[styles.body, { color: '#34C759' }]}>{copy.connected}</Text>
              </View>
              <Text style={[styles.footnote, styles.center, { color: CONNECT_INK }]}>{copy.connectedFootnote}</Text>
              {providerConnections(provider, connections).map((connection) => (
                <View key={connection.id} style={styles.account} testID={`calendar-connect-account-${connection.id}`}>
                  <Text style={[styles.subheadline, styles.bold, { color: CONNECT_INK }]}>{displayName(connection)}</Text>
                  <Text style={[styles.caption, { color: CONNECT_INK }]}>{lastSyncedDescription(connection, now, zone)}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {connected && !device ? (
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: connecting }} disabled={connecting} onPress={() => void beginConnection()} style={styles.textButton} testID="calendar-connect-another">
              <Text style={[styles.body, { color: CONNECT_INK, opacity: connecting ? 0.45 : 1 }]}>{copy.connectAnother}</Text>
            </Pressable>
          ) : null}
          {failure ? (
            <Text style={[styles.footnote, styles.center, { color: '#FF3B30' }]} testID="calendar-connect-error">
              {failure}
            </Text>
          ) : null}
          {status ? (
            <Text accessibilityLiveRegion="polite" style={[styles.footnote, styles.center, { color: CONNECT_INK }]} testID="calendar-connect-status">
              {status}
            </Text>
          ) : null}
          {device && access.denied ? (
            <Pressable accessibilityRole="button" onPress={() => void Linking.openSettings()} style={styles.textButton} testID="calendar-connect-open-settings">
              <Text style={[styles.body, { color: '#007AFF' }]}>{copy.openSettings}</Text>
            </Pressable>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: connecting }}
            disabled={connecting}
            onPress={primaryAction}
            style={[styles.primary, { backgroundColor: device ? '#000000' : '#007AFF' }]}
            testID={`calendar-connect-${provider}`}
          >
            {connecting ? <ActivityIndicator color="#FFFFFF" /> : null}
            <Text style={styles.primaryText}>{primaryTitle}</Text>
          </Pressable>
          <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(LEGAL_LINKS.privacyPolicy)} style={styles.textButton} testID="calendar-connect-learn-more">
            <Text style={[styles.footnote, styles.underline, { color: CONNECT_INK }]}>{copy.learnMore}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </ConnectSurface>
  );
}

/** `step(_:title:detail:)` (`:185-206`). */
function Step({ accent, muted, number, provider, step, allowAccess }: { accent: string; muted: string; number: number; provider: CalendarConnectProvider; step: ProviderStep; allowAccess: string }) {
  return (
    <View style={styles.step} testID={`calendar-connect-step-${number}`}>
      <View style={[styles.stepBadge, { backgroundColor: withAlpha(accent, 0.1) }]}>
        <Text style={[styles.stepNumber, { color: accent }]}>{number}</Text>
      </View>
      <View style={styles.stepText}>
        <Text style={[styles.subheadline, styles.bold, { color: CONNECT_INK }]}>{step.title}</Text>
        <Text style={[styles.footnote, { color: muted }]}>{step.detail}</Text>
      </View>
      {step.art === 'allowAccess' ? (
        // The phone provider uses the calendar permission, not a sign-in (`:194-199`).
        <View accessibilityElementsHidden importantForAccessibility="no" style={styles.allowAccess}>
          <Image resizeMode="contain" source={CONNECT_ART[providerArt(provider)]} style={styles.allowIcon} />
          <Text style={[styles.allowText, { color: CONNECT_INK }]}>{allowAccess}</Text>
        </View>
      ) : (
        <Image accessibilityElementsHidden importantForAccessibility="no" resizeMode="contain" source={CONNECT_ART[step.art]} style={styles.stepArt} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 40, alignItems: 'center' },
  column: { width: '100%', maxWidth: 560, gap: 20, alignItems: 'center' },
  grow: { flex: 1 },
  progressTrack: { width: 100, height: 4, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2 },
  icon: { width: 66, height: 66, marginTop: 10 },
  heading: { gap: 8, alignSelf: 'stretch' },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700', textAlign: 'center', color: CONNECT_INK },
  subtitle: { fontSize: 15, lineHeight: 21, textAlign: 'center' },
  steps: { alignSelf: 'stretch', borderRadius: 24, backgroundColor: 'rgba(255, 255, 255, 0.87)' },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 18, backgroundColor: 'rgba(60, 60, 67, 0.29)' },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 18 },
  stepBadge: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  stepNumber: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  stepText: { flex: 1, gap: 7 },
  stepArt: { width: 68, height: 76 },
  allowAccess: { width: 62, height: 70, alignItems: 'center', justifyContent: 'center', gap: 5 },
  allowIcon: { width: 32, height: 32 },
  allowText: { fontSize: 10, lineHeight: 12, fontWeight: '500', textAlign: 'center' },
  privacy: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 16, borderRadius: 20 },
  connected: { alignSelf: 'stretch', alignItems: 'center', gap: 12 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  account: { alignItems: 'center', gap: 4 },
  textButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  primary: { alignSelf: 'stretch', minHeight: 52, borderRadius: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryText: { fontSize: 17, lineHeight: 22, fontWeight: '600', color: '#FFFFFF' },
  body: { fontSize: 17, lineHeight: 22 },
  subheadline: { fontSize: 15, lineHeight: 20 },
  footnote: { fontSize: 13, lineHeight: 18 },
  caption: { fontSize: 12, lineHeight: 16 },
  bold: { fontWeight: '700' },
  center: { textAlign: 'center' },
  underline: { textDecorationLine: 'underline' },
});
