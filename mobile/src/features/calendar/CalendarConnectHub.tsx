import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { TaskSymbol } from '../../components/TaskSymbol';
import { Text } from '../../components/Text';
import { withAlpha } from '../../components/CalendarParts';
import { connectionsState, useCalendarConnections } from '../../query/useCalendar';
import {
  CALENDAR_CONNECT_PROVIDERS,
  HUB_COPY,
  providerArt,
  providerConnected,
  providerHubCaption,
  providerNeedsReconnect,
  providerTitle,
  type CalendarConnectProvider,
} from './calendarProviders';
import { CONNECT_ART } from './connectArt';
import { CONNECT_INK, CONNECT_LINK, CONNECT_PURPLE, ConnectSurface } from './ConnectSurface';
import { useDeviceCalendarAccess } from './useDeviceCalendarAccess';

/**
 * `CalendarConnectionView` (ios/App/CalendarConnectionView.swift:5-73): the Connect Your Calendar hub.
 * Fixed light over a purple gradient; the hero; one card per provider with its connected state; the
 * connection-list error with Retry; the privacy label. Loads `/api/calendar/connections` on appear.
 *
 * Android: the phone provider reads "Phone calendar" / "Connect your phone’s calendars" (§33).
 */

/** `Color(red: 0.02, green: 0.42, blue: 0.20)`: the Connected label. */
const CONNECTED_GREEN = '#056B33';
const ORANGE = '#FF9500';

export function CalendarConnectHub({ onBack, onProvider, testID = 'calendar-connect-hub' }: { onBack: () => void; onProvider: (provider: CalendarConnectProvider) => void; testID?: string }) {
  const connectionsQuery = useCalendarConnections();
  const { connections, error } = connectionsState(connectionsQuery);
  const access = useDeviceCalendarAccess();
  const muted = withAlpha(CONNECT_INK, 0.7);

  return (
    <ConnectSurface accent={CONNECT_PURPLE} onBack={onBack} testID={testID}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.column}>
          <Image accessibilityElementsHidden importantForAccessibility="no" resizeMode="contain" source={CONNECT_ART.hero} style={styles.hero} />
          <View style={styles.heading}>
            <Text accessibilityRole="header" style={styles.title}>
              {HUB_COPY.title}
            </Text>
            <Text style={[styles.subtitle, { color: muted }]}>{HUB_COPY.subtitle}</Text>
          </View>
          <View style={styles.cards}>
            {CALENDAR_CONNECT_PROVIDERS.map((provider) => {
              const connected = providerConnected(provider, connections, access.allowed);
              const reconnect = !connected && providerNeedsReconnect(provider, connections);
              return (
                <Pressable
                  accessibilityRole="button"
                  key={provider}
                  onPress={() => onProvider(provider)}
                  style={styles.card}
                  testID={`calendar-provider-${provider}`}
                >
                  <Image resizeMode="contain" source={CONNECT_ART[providerArt(provider)]} style={styles.icon} />
                  <View style={styles.cardText}>
                    <Text style={styles.cardTitle}>{providerTitle(provider)}</Text>
                    <Text style={[styles.caption, { color: muted }]}>{providerHubCaption(provider)}</Text>
                    {connected ? (
                      <View style={styles.badge} testID={`calendar-provider-${provider}-connected`}>
                        <TaskSymbol color={CONNECTED_GREEN} name="checkmark.circle.fill" size={13} />
                        <Text style={[styles.caption, styles.medium, { color: CONNECTED_GREEN }]}>{HUB_COPY.connected}</Text>
                      </View>
                    ) : reconnect ? (
                      <View style={styles.badge} testID={`calendar-provider-${provider}-reconnect`}>
                        <TaskSymbol color={ORANGE} name="exclamationmark.circle" size={13} />
                        <Text style={[styles.caption, { color: ORANGE }]}>{HUB_COPY.needsReconnect}</Text>
                      </View>
                    ) : null}
                  </View>
                  <TaskSymbol color={CONNECT_INK} name="chevron.right" size={17} />
                </Pressable>
              );
            })}
          </View>
          {error ? (
            <>
              <Text style={[styles.footnote, styles.error]} testID="calendar-connect-hub-error">
                {error}
              </Text>
              <Pressable accessibilityRole="button" onPress={() => void connectionsQuery.refetch()} style={styles.retry} testID="calendar-connect-hub-retry">
                <Text style={[styles.body, { color: CONNECT_LINK }]}>{HUB_COPY.retry}</Text>
              </Pressable>
            </>
          ) : null}
          <View style={styles.privacy}>
            <TaskSymbol color={muted} name="lock.shield.fill" size={20} />
            <View style={styles.privacyText}>
              <Text style={[styles.subheadline, styles.bold, { color: muted }]}>{HUB_COPY.privacyTitle}</Text>
              <Text style={[styles.footnote, { color: muted }]}>{HUB_COPY.privacyDetail}</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </ConnectSurface>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 22, paddingBottom: 40, alignItems: 'center' },
  column: { width: '100%', maxWidth: 560, gap: 24 },
  hero: { alignSelf: 'center', height: 180, width: 184, marginVertical: 12 },
  heading: { gap: 10 },
  title: { fontSize: 34, lineHeight: 41, fontWeight: '700', textAlign: 'center', color: CONNECT_INK },
  subtitle: { fontSize: 15, lineHeight: 21, textAlign: 'center' },
  cards: { gap: 12 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 18, borderRadius: 24, backgroundColor: 'rgba(255, 255, 255, 0.85)' },
  icon: { width: 46, height: 46 },
  cardText: { flex: 1, gap: 5 },
  cardTitle: { fontSize: 17, lineHeight: 22, fontWeight: '600', color: CONNECT_INK },
  caption: { fontSize: 12, lineHeight: 16 },
  medium: { fontWeight: '500' },
  bold: { fontWeight: '700' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  body: { fontSize: 17, lineHeight: 22 },
  subheadline: { fontSize: 15, lineHeight: 20 },
  footnote: { fontSize: 13, lineHeight: 18 },
  error: { color: '#FF3B30', textAlign: 'center' },
  retry: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  privacy: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10 },
  privacyText: { flex: 1, gap: 5 },
});
