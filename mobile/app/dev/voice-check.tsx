import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { endpoints, getApi, isApiError } from '../../src/api';
import { Button, Card, LoadingView, Screen, Text } from '../../src/components';
import { useMe } from '../../src/query/useMe';
import { useTheme } from '../../src/theme';
import { createNativeDriver, isWebRtcAvailable } from '../../src/voice/nativeDriver';
import { VoiceSession, type VoiceLatency, type VoiceLogEntry, type VoiceStatus } from '../../src/voice/session';

// PHASE 0 PROOF OF CONCEPT: live voice over WebRTC against the existing backend. Needs the development build.
// Test procedure: mobile/README.md, "Voice proof of concept". Protocol: mobile/docs/voice-protocol.md.
// TODO: remove or hide behind __DEV__ before the first TestFlight build.

type LogRow = VoiceLogEntry & { id: number };
type MeCheck = { state: 'pending' } | { state: 'ok'; text: string } | { state: 'failed'; text: string };

export default function VoiceCheck() {
  const theme = useTheme();
  const me = useMe();
  const available = isWebRtcAvailable();
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [latency, setLatency] = useState<VoiceLatency>({});
  const [log, setLog] = useState<LogRow[]>([]);
  const [meCheck, setMeCheck] = useState<MeCheck>({ state: 'pending' });
  const sessionRef = useRef<VoiceSession | null>(null);
  const logId = useRef(0);

  // Re-confirms the cookie session in this build (dev builds keep cookies separately from Expo Go).
  useEffect(() => {
    let cancelled = false;
    endpoints
      .me()
      .then(({ user }) => !cancelled && setMeCheck({ state: 'ok', text: `200, signed in as ${user.email}` }))
      .catch((error: unknown) => {
        if (cancelled) return;
        const text = isApiError(error) ? `${error.status} ${error.code ?? ''} ${error.message}`.trim() : String(error);
        setMeCheck({ state: 'failed', text });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => () => sessionRef.current?.stop(), []);

  const session = () => {
    sessionRef.current ??= new VoiceSession({
      api: getApi(),
      driver: createNativeDriver(),
      onStatus: setStatus,
      onLatency: setLatency,
      onLog: (entry) => setLog((rows) => [{ ...entry, id: ++logId.current }, ...rows].slice(0, 300)),
    });
    return sessionRef.current;
  };

  const footer = (
    <Card style={{ gap: theme.spacing.xxs }}>
      <Text variant="caption" tone="secondary">
        GET /api/me on mount
      </Text>
      <Text variant="mono" tone={meCheck.state === 'failed' ? 'danger' : 'ink'}>
        {meCheck.state === 'pending' ? 'checking…' : meCheck.text}
      </Text>
    </Card>
  );

  if (me.isPending) return <LoadingView />;

  if (!me.data) {
    return (
      <Screen scroll edges={['left', 'right', 'bottom']}>
        <Card style={{ gap: theme.spacing.md }}>
          <Text variant="title">Sign in first</Text>
          <Text tone="secondary">
            {me.isError ? me.error.message : 'The voice check needs a signed-in session. Sign in on the session check, then come back.'}
          </Text>
          <Button title="Open session check" onPress={() => router.push('/dev/session-check')} />
        </Card>
        {footer}
      </Screen>
    );
  }

  const busy = status === 'starting' || status === 'connected';

  return (
    <Screen scroll edges={['left', 'right', 'bottom']}>
      {!available ? (
        <Card style={{ gap: theme.spacing.xs }}>
          <Text variant="title" tone="danger">
            WebRTC is not in this build
          </Text>
          <Text tone="secondary">Expo Go cannot run live voice. Install the development build and run `npx expo start --dev-client`.</Text>
        </Card>
      ) : null}

      <Card style={{ gap: theme.spacing.md }}>
        <Text tone="secondary">Signed in as {me.data.email}</Text>
        <View style={[styles.row, { gap: theme.spacing.md }]}>
          {/* TODO(phase0-decision): the Swift app stores AI and voice consent on the device; the PoC asks each time. */}
          <Switch value={consent} onValueChange={setConsent} disabled={busy} accessibilityLabel="Allow voice sharing" />
          <Text style={styles.flex}>Share my voice and task data with OpenAI for this conversation</Text>
        </View>
        <Text variant="title">Status: {status}</Text>
        <View style={[styles.row, { gap: theme.spacing.sm }]}>
          <Button
            style={styles.flex}
            title="Start"
            loading={status === 'starting'}
            disabled={!available || !consent || busy}
            onPress={() => {
              setLog([]);
              void session().start();
            }}
          />
          <Button style={styles.flex} title="Stop" variant="secondary" disabled={status === 'idle'} onPress={() => session().stop()} />
        </View>
      </Card>

      <Card style={{ gap: theme.spacing.xxs }}>
        <Text variant="caption" tone="secondary">
          Latency
        </Text>
        <Text variant="mono">Start → data channel open: {formatMs(latency.channelOpenMs)}</Text>
        <Text variant="mono">Start → session.created: {formatMs(latency.sessionCreatedMs)}</Text>
        <Text variant="mono">End of speech → first audio back: {formatMs(latency.lastReplyMs)}</Text>
      </Card>

      <View style={[styles.row, styles.between]}>
        <Text variant="title">Event log</Text>
        <Button title="Clear" variant="ghost" onPress={() => setLog([])} />
      </View>
      {log.length === 0 ? <Text tone="secondary">No events yet.</Text> : null}
      {log.map((row) => (
        <Text key={row.id} variant="mono" tone={row.kind === 'error' ? 'danger' : row.kind === 'tool' || row.kind === 'latency' ? 'tint' : 'ink'}>
          {new Date(row.at).toLocaleTimeString()} [{row.kind}] {row.message}
        </Text>
      ))}

      {footer}
    </Screen>
  );
}

function formatMs(value?: number) {
  return value === undefined ? '—' : `${value} ms`;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  between: { justifyContent: 'space-between' },
  flex: { flex: 1 },
});
