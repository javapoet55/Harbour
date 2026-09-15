import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';
import { z } from 'zod';

import { createApiClient, endpoints, isApiError, type Exchange } from '../../src/api';
import { Button, Card, Screen, Text, TextField } from '../../src/components';
import { getApiUrl } from '../../src/config';
import { queryKeys } from '../../src/query/keys';
import { useTheme } from '../../src/theme';

// Phase 1 risk gate: does the `harbor_session` cookie from POST /api/auth/login persist in Expo Go
// across a force-quit, and is it sent with later requests? Test procedure: mobile/README.md.
// TODO: remove or hide behind __DEV__ before the first TestFlight build.

const signInSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
});
type SignInForm = z.infer<typeof signInSchema>;

type LogEntry = Exchange & { at: Date; id: number };

export default function SessionCheck() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [log, setLog] = useState<LogEntry[]>([]);
  const [result, setResult] = useState<{ label: string; text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState<'signIn' | 'me' | 'signOut' | null>(null);

  // A separate client instance so every request made from this screen is logged. Cookies are shared
  // process-wide by the native networking stack, so this tests the same session the app uses.
  const client = useMemo(
    () =>
      createApiClient({
        baseUrl: getApiUrl(),
        onExchange: (exchange) => setLog((entries) => [{ ...exchange, at: new Date(), id: Date.now() + Math.random() }, ...entries].slice(0, 30)),
      }),
    [],
  );

  const { control, handleSubmit, formState } = useForm<SignInForm>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  });

  async function run(kind: 'signIn' | 'me' | 'signOut', label: string, action: () => Promise<unknown>) {
    setBusy(kind);
    try {
      const data = await action();
      setResult({ label, ok: true, text: JSON.stringify(data, null, 2) });
    } catch (error) {
      const text = isApiError(error)
        ? `ApiError status=${error.status} code=${error.code ?? '-'}\n${error.message}`
        : String(error);
      setResult({ label, ok: false, text });
    } finally {
      setBusy(null);
      // Keep the root session gate in step with whatever just happened.
      if (kind !== 'me') void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
    }
  }

  const signIn = handleSubmit(({ email, password }) => run('signIn', 'Sign in', () => endpoints.login(email, password, client)));

  return (
    <Screen scroll edges={['left', 'right', 'bottom']}>
      <Text variant="caption" tone="secondary">
        API: {client.baseUrl}
      </Text>

      <Card style={{ gap: theme.spacing.md }}>
        <Controller
          control={control}
          name="email"
          render={({ field }) => (
            <TextField
              label="Email"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="username"
              error={formState.errors.email?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="password"
          render={({ field }) => (
            <TextField
              label="Password"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              secureTextEntry
              autoComplete="current-password"
              textContentType="password"
              error={formState.errors.password?.message}
            />
          )}
        />
        <Button title="Sign in" onPress={signIn} loading={busy === 'signIn'} disabled={busy !== null && busy !== 'signIn'} />
      </Card>

      <View style={[styles.row, { gap: theme.spacing.sm }]}>
        <Button
          style={styles.flex}
          title="Who am I"
          variant="secondary"
          loading={busy === 'me'}
          disabled={busy !== null && busy !== 'me'}
          onPress={() => run('me', 'Who am I', () => endpoints.me(client))}
        />
        <Button
          style={styles.flex}
          title="Sign out"
          variant="secondary"
          loading={busy === 'signOut'}
          disabled={busy !== null && busy !== 'signOut'}
          onPress={() => run('signOut', 'Sign out', () => endpoints.logout(client))}
        />
      </View>

      {result ? (
        <Card style={{ gap: theme.spacing.xs }}>
          <Text variant="caption" tone={result.ok ? 'tint' : 'danger'}>
            {result.label}: {result.ok ? 'succeeded' : 'failed'}
          </Text>
          <Text variant="mono" selectable>
            {result.text}
          </Text>
        </Card>
      ) : null}

      <View style={[styles.row, styles.between]}>
        <Text variant="title">Request log</Text>
        <Button title="Clear" variant="ghost" onPress={() => setLog([])} />
      </View>
      <Text variant="caption" tone="secondary">
        The session cookie is HTTP-only. Whether “Set-Cookie” is visible to JavaScript does not decide the test; “Who am
        I” returning your profile after a force-quit does.
      </Text>
      {log.length === 0 ? <Text tone="secondary">No requests yet.</Text> : null}
      {log.map((entry) => (
        <Card key={entry.id} style={{ gap: theme.spacing.xxs }}>
          <Text variant="mono">
            {entry.at.toLocaleTimeString()} {entry.method} {entry.path}
          </Text>
          <Text variant="mono" tone={entry.status !== null && entry.status < 400 ? 'ink' : 'danger'}>
            status {entry.status ?? 'none'} · Set-Cookie visible: {entry.setCookieVisible ? 'yes' : 'no'} · {entry.durationMs} ms
          </Text>
          {entry.error ? (
            <Text variant="mono" tone="danger">
              {entry.error}
            </Text>
          ) : null}
          {entry.bodyText ? (
            <Text variant="mono" tone="secondary" numberOfLines={6}>
              {entry.bodyText}
            </Text>
          ) : null}
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  between: { justifyContent: 'space-between' },
  flex: { flex: 1 },
});
