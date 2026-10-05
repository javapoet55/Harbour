import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, Stack } from 'expo-router';
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { ActivityIndicator, Image, Pressable, RefreshControl, StyleSheet, Switch, TextInput, View, type ImageSourcePropType } from 'react-native';

import { shoppingEmailApi, type GroceryList, type ShoppingEmailSnapshot } from '../../api/shopping';
import { KeyboardAwareScrollView } from '../../components/keyboard';
import { ClockField } from '../../components/SettingsControls';
import { withAlpha } from '../../components/SignInBackdrop';
import { Text } from '../../components/Text';
import { inputText, textStyles, useTheme } from '../../theme';
import { deviceZone, momentDay } from '../moments/dates';
import { connectGmail } from '../moments/device';
import { DateField, knownTimeZones, MenuPicker } from '../moments/form';
import { useAccessibilityTextSize } from '../wellness/useAccessibilityTextSize';
import { remaining } from './model';

/**
 * `ShoppingEmailView` (ios/App/ShoppingEmailView.swift:32-358), "Share List": send the checked items of
 * this list to a store manager every week from the account's Gmail, with the customer's phone number
 * and a preferred pickup time. Reached from Shopping Detail's Schedule Email and Share List's "Weekly
 * email to store manager".
 *
 * The fields are filled from the saved schedule once (`didLoadSchedule`); a reload or a Gmail connection
 * never wipes what is being typed. One reason under the permission toggle says why Save is off.
 *
 * Nothing here sends an email: Save stores the schedule, and the server's worker sends it later.
 */

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const ART: Record<'email' | 'cart' | 'sender' | 'people' | 'calendar' | 'shield' | 'check' | 'plane', ImageSourcePropType> = {
  email: require('../../../assets/share-list/email.png'),
  cart: require('../../../assets/share-list/cart.png'),
  sender: require('../../../assets/share-list/sender.png'),
  people: require('../../../assets/share-list/people.png'),
  calendar: require('../../../assets/share-list/calendar.png'),
  shield: require('../../../assets/share-list/shield.png'),
  check: require('../../../assets/share-list/check.png'),
  plane: require('../../../assets/share-list/plane.png'),
};

/** Swift's fixed colours (:50-52), used in light mode. */
const LIGHT = { ink: '#120F38', muted: '#5C669C', purple: '#6E40FF' };

/** "Email connection cancelled or failed." (:349). */
export const EMAIL_CANCELLED = 'Email connection cancelled or failed.';

/** `normalizedCustomerPhone` (:290-292). */
export const normalizedPhone = (value: string) => value.replace(/[ ().\-\t\n\r]/g, '');

/** `pickupWindow(_:)` (:198-201): "9 AM – 10 AM" … "7 PM – 8 PM". */
export function pickupWindow(hour: number): string {
  const label = (h: number) => `${h > 12 ? h - 12 : h} ${h < 12 ? 'AM' : 'PM'}`;
  return `${label(hour)} – ${label(hour + 1)}`;
}

/** `saveBlocker` (:293-302): the first reason Save is off, or null. */
export function saveBlocker(snapshot: ShoppingEmailSnapshot | null, form: { name: string; recipient: string; phone: string; consent: boolean }): string | null {
  if (!snapshot) return 'Unable to check email setup. Tap Check availability again.';
  if (!snapshot.available) return 'Weekly email is unavailable on this server. Your entries are kept; check availability again after it is enabled.';
  if (snapshot.account?.status !== 'connected') return 'Connect Gmail with email-sending permission before saving. A Calendar connection alone cannot send email.';
  if (form.name.trim() === '') return 'Enter the store manager’s name.';
  if (form.recipient.trim() === '') return 'Enter the store manager’s email address.';
  if (!/^\+[1-9][0-9]{7,14}$/.test(normalizedPhone(form.phone))) return 'Enter your phone number with country code so the store can contact you.';
  if (!form.consent) return 'Turn on permission to authorize weekly emails.';
  return null;
}

/**
 * `displayDate(_:)` (:303-311): an ISO date with fractional seconds, in the SAVED schedule's zone, with
 * the zone named; anything else is shown as it came.
 */
export function displayDate(text: string, zone: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+(Z|[+-]\d{2}:\d{2})$/.test(text)) return text;
  const at = Date.parse(text);
  if (Number.isNaN(at)) return text;
  let timeZone = zone;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
  } catch {
    timeZone = deviceZone();
  }
  const date = new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(at));
  const time = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(new Date(at));
  return `${date} at ${time} (${timeZone})`;
}

/** `status.capitalized`. */
const capitalized = (value: string) => value.toLowerCase().replace(/(^|\s)(\S)/g, (_, space: string, letter: string) => space + letter.toUpperCase());

export function EmailScreen({ list }: { list: GroceryList }) {
  const theme = useTheme();
  const large = useAccessibilityTextSize();
  const dark = theme.scheme === 'dark';
  const ink = dark ? theme.colors.ink : LIGHT.ink;
  const muted = dark ? theme.colors.secondary : LIGHT.muted;
  const purple = dark ? theme.colors.link : LIGHT.purple;
  const cardFill = dark ? theme.colors.surface : 'rgba(255, 255, 255, 0.94)';

  const [snapshot, setSnapshot] = useState<ShoppingEmailSnapshot | null>(null);
  const [recipient, setRecipient] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [name, setName] = useState('');
  const [zone, setZone] = useState(deviceZone);
  const [weekday, setWeekday] = useState(6);
  const [time, setTime] = useState('10:00');
  // `pickupDate = Date()`; saved as its day in the phone's calendar (`pickupDateText`, :202-205).
  const [pickupDate, setPickupDate] = useState(() => Date.now());
  const [pickupStartHour, setPickupStartHour] = useState(9);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const didLoadSchedule = useRef(false);

  /** `load()` (:312-329): the schedule seeds the fields the first time only. */
  const load = async () => {
    setBusy(true);
    try {
      const value = await shoppingEmailApi.get(list.id);
      setSnapshot(value);
      const s = value.schedule;
      if (!didLoadSchedule.current && s) {
        if (s.pickupDate && /^\d{4}-\d{2}-\d{2}$/.test(s.pickupDate)) {
          const [y, m, d] = s.pickupDate.split('-').map(Number);
          setPickupDate(new Date(y, m - 1, d, 12).getTime());
        }
        setPickupStartHour(s.pickupStartHour ?? 9);
        setCustomerPhone(s.customerPhone ?? '');
        setRecipient(s.recipient);
        setName(s.recipientName);
        setZone(s.timeZone);
        setWeekday(s.weekday);
        setTime(`${String(s.hour).padStart(2, '0')}:${String(s.minute).padStart(2, '0')}`);
      }
      didLoadSchedule.current = true;
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Request failed.');
    } finally {
      setBusy(false);
    }
  };
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });
  // `.task { await load() }`
  useEffect(() => {
    const timer = setTimeout(() => void loadRef.current(), 0);
    return () => clearTimeout(timer);
  }, []);

  /** `change(_:)` (:330-336). */
  const change = async (run: () => Promise<ShoppingEmailSnapshot>) => {
    setBusy(true);
    try {
      setSnapshot(await run());
      setConsent(false);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Request failed.');
    } finally {
      setBusy(false);
    }
  };

  const blocker = saveBlocker(snapshot, { name, recipient, phone: customerPhone, consent });

  /** `save()` (:337-341). */
  const save = () => {
    if (busy || blocker) return;
    const [hour, minute] = time.split(':').map(Number);
    void change(() =>
      shoppingEmailApi.save(list.id, {
        recipient,
        customerPhone: normalizedPhone(customerPhone),
        recipientName: name,
        timeZone: zone,
        weekday,
        hour: Number.isFinite(hour) ? hour : 10,
        minute: Number.isFinite(minute) ? minute : 0,
        consent: true,
        pickupDate: momentDay(pickupDate, deviceZone()),
        pickupStartHour,
      }),
    );
  };

  /** `connect()` (:342-357). */
  const connect = async () => {
    setBusy(true);
    try {
      const { url } = await shoppingEmailApi.connect(list.id);
      setBusy(false);
      const ticket = await connectGmail(url);
      if (!ticket) {
        setError(EMAIL_CANCELLED);
        return;
      }
      await shoppingEmailApi.confirmGmail(ticket);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Request failed.');
    } finally {
      setBusy(false);
    }
  };

  const card = (title: string, subtitle: string, icon: keyof typeof ART, children: ReactNode, testID?: string) => (
    <View style={[styles.card, { backgroundColor: cardFill, borderColor: withAlpha(purple, 0.06), shadowColor: purple }]} testID={testID}>
      <View style={styles.cardHead}>
        <Image accessible={false} resizeMode="contain" source={ART[icon]} style={styles.cardArt} />
        <View style={[styles.grow, styles.gap3]}>
          <Text style={[styles.headline, { color: ink }]}>{title}</Text>
          <Text style={[styles.caption, { color: muted }]}>{subtitle}</Text>
        </View>
      </View>
      {children}
    </View>
  );
  const field = (title: string, children: ReactNode) => (
    <View style={[styles.field, { borderColor: withAlpha(purple, 0.15) }]}>
      <Text style={[styles.caption, { color: muted }]}>{title}</Text>
      {children}
    </View>
  );
  const note = (text: string) => (
    <View style={styles.note}>
      <Ionicons color={muted} name="information-circle" size={14} />
      <Text style={[styles.caption, styles.grow, { color: muted }]}>{text}</Text>
    </View>
  );
  const input = (value: string, onChange: (next: string) => void, placeholder: string, props: Partial<ComponentProps<typeof TextInput>>) => (
    <TextInput
      editable={!busy}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={theme.colors.placeholder}
      style={[inputText(textStyles.subheadline), styles.input, { color: ink }]}
      value={value}
      {...props}
    />
  );
  const schedule = snapshot?.schedule ?? null;
  const savedZone = schedule?.timeZone ?? zone;
  const checked = list.items.length - remaining(list);

  return (
    <View style={styles.fill}>
      {/* `.navigationTitle("Share List")` (:114). */}
      <Stack.Screen options={{ title: 'Share List' }} />
      <LinearGradient colors={dark ? [theme.colors.groupedBackground, theme.colors.groupedBackground] : ['#F5F7FF', '#F7F2FF']} end={{ x: 1, y: 1 }} start={{ x: 0, y: 0 }} style={StyleSheet.absoluteFill} />
      <KeyboardAwareScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl onRefresh={() => void load()} refreshing={false} />}
        testID="shopping-email"
      >
        <View pointerEvents={busy ? 'none' : 'auto'} style={styles.gap14}>
          {/* `introduction` (:120-138). */}
          <LinearGradient colors={dark ? [theme.colors.surface, theme.colors.surface] : ['#FFFFFF', '#F7F0FF']} end={{ x: 1, y: 1 }} start={{ x: 0, y: 0 }} style={styles.intro}>
            <View style={styles.cardHead}>
              <Image accessible={false} resizeMode="contain" source={ART.email} style={styles.introArt} />
              <View style={[styles.grow, styles.gap7]}>
                <Text style={[styles.eyebrow, { color: purple }]}>WEEKLY SHOPPING EMAIL</Text>
                <Text style={[styles.title3, { color: ink }]}>Send your shopping list automatically</Text>
                <Text style={[textStyles.subheadline, { color: muted }]}>
                  Send checked shopping items to your store manager every week, even when NexDo is closed. Unchecked items are excluded. If nothing is checked, the email is skipped.
                </Text>
              </View>
            </View>
            <View style={[styles.tip, { backgroundColor: withAlpha(purple, 0.06) }]}>
              <Ionicons color="#007AFF" name="bulb" size={15} />
              <Text style={[styles.caption, styles.grow, { color: '#007AFF' }]}>Keep your store in sync. Save time on your weekly shop.</Text>
              <Image accessible={false} resizeMode="contain" source={ART.plane} style={[styles.plane, styles.multiply as object]} />
            </View>
          </LinearGradient>

          {card(
            list.title,
            'Selected list for weekly sharing.',
            'cart',
            <View style={[styles.countPill, { backgroundColor: withAlpha(purple, 0.06) }]}>
              <Text style={[styles.caption, { color: muted }]} testID="shopping-email-count">{`${checked} to send · ${list.items.length} items`}</Text>
            </View>,
          )}

          {/* `senderCard` (:140-159). */}
          {card(
            'Send from',
            'Emails are sent from your connected Gmail account.',
            'sender',
            <>
              {snapshot?.account ? (
                <View style={[styles.account, large && styles.accountColumn, { backgroundColor: withAlpha(purple, 0.05) }]}>
                  <Text style={[textStyles.subheadline, large ? null : styles.grow, { color: ink }]} testID="shopping-email-account">
                    {snapshot.account.email}
                  </Text>
                  <View style={[styles.badge, { backgroundColor: withAlpha('#34C759', 0.09) }]}>
                    <Ionicons color={snapshot.account.status === 'connected' ? '#007A5C' : muted} name={snapshot.account.status === 'connected' ? 'checkmark-circle' : 'alert-circle-outline'} size={13} />
                    <Text style={[styles.caption, styles.medium, { color: snapshot.account.status === 'connected' ? '#007A5C' : muted }]}>{capitalized(snapshot.account.status)}</Text>
                  </View>
                </View>
              ) : null}
              {snapshot && snapshot.account?.status !== 'connected' ? (
                <View style={styles.connectRow}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !snapshot.available }}
                    disabled={!snapshot.available}
                    onPress={() => void connect()}
                    style={styles.grow}
                    testID="shopping-email-connect"
                  >
                    <Text style={[textStyles.subheadline, { color: purple, opacity: snapshot.available ? 1 : 0.45 }]}>Connect / Reconnect Gmail</Text>
                  </Pressable>
                  <Pressable accessibilityLabel="Open Profile calendar settings" accessibilityRole="button" onPress={() => router.push('/account/settings')} style={styles.square44} testID="shopping-email-settings">
                    <Ionicons color={purple} name="settings-outline" size={20} />
                  </Pressable>
                </View>
              ) : null}
              {snapshot?.available === false ? <Text style={[styles.caption, { color: muted }]}>Weekly email is not enabled on this server yet.</Text> : null}
            </>,
          )}

          {card(
            'Store manager',
            'Enter the name and email of the recipient.',
            'people',
            <View style={[large ? styles.column10 : styles.row10]}>
              <View style={large ? null : styles.grow}>{field('Name', input(name, setName, 'Name', { textContentType: 'name', accessibilityLabel: 'Name', testID: 'shopping-email-name' }))}</View>
              <View style={large ? null : styles.grow}>
                {field(
                  'Email',
                  input(recipient, setRecipient, 'Email address', {
                    keyboardType: 'email-address',
                    textContentType: 'emailAddress',
                    autoCapitalize: 'none',
                    autoCorrect: false,
                    accessibilityLabel: 'Email address',
                    testID: 'shopping-email-recipient',
                  }),
                )}
              </View>
            </View>,
          )}

          {card(
            'Your contact number',
            'The store will use this number for pickup updates and questions. It will be included in your email.',
            'sender',
            <>
              {field(
                'Your phone number (required)',
                input(customerPhone, setCustomerPhone, '+1 415 555 0123', { keyboardType: 'phone-pad', textContentType: 'telephoneNumber', accessibilityLabel: 'Your phone number', testID: 'shopping-customer-phone' }),
              )}
              <Text style={[styles.caption, { color: muted }]}>Include your country code, for example +1.</Text>
            </>,
          )}

          {/* `scheduleCard` (:161-196). */}
          {card(
            'Schedule',
            'Choose when to send your list.',
            'calendar',
            <>
              {field(
                'Timezone',
                <MenuPicker
                  accessibilityLabel="Schedule timezone"
                  hideLabel
                  label="Timezone"
                  onChange={setZone}
                  options={knownTimeZones([zone, 'UTC']).map((value) => ({ value, title: value.replaceAll('_', ' ') }))}
                  testID="shopping-email-zone"
                  value={zone}
                />,
              )}
              <View style={[large ? styles.column10 : styles.row10]}>
                <View style={large ? null : styles.grow}>
                  {field(
                    'Repeat',
                    <MenuPicker
                      accessibilityLabel="Repeat weekly on"
                      hideLabel
                      label="Day"
                      onChange={setWeekday}
                      options={DAYS.map((title, value) => ({ value, title }))}
                      testID="shopping-email-weekday"
                      value={weekday}
                    />,
                  )}
                </View>
                <View style={large ? null : styles.grow}>
                  {/* `field("Time") { DatePicker(…).labelsHidden() }`: the same captioned box as Repeat, with the
                      12-hour pill inside it, not the settings-style caption over a bordered field. */}
                  {field('Time', <ClockField hourCycle="h12" label="Time" onChange={setTime} testID="shopping-email-time" value={time} variant="pill" />)}
                </View>
              </View>
              <Text style={[textStyles.subheadline, styles.bold, { color: ink }]}>Preferred pickup time</Text>
              {field('Date', <DateField label="" onChange={setPickupDate} testID="shopping-email-pickup-date" value={pickupDate} zone={deviceZone()} />)}
              {field(
                'Pickup window',
                <MenuPicker
                  accessibilityLabel="Preferred pickup window"
                  hideLabel
                  label="Pickup window"
                  onChange={setPickupStartHour}
                  options={Array.from({ length: 11 }, (_, index) => 9 + index).map((value) => ({ value, title: pickupWindow(value) }))}
                  testID="shopping-email-pickup-window"
                  value={pickupStartHour}
                />,
              )}
              {note('Pickup repeats weekly from the selected date and is a request for the store to confirm.')}
              {note('The time follows this timezone, including daylight saving changes. Sending may take a few minutes. A recurring list follows its next shopping trip.')}
            </>,
          )}

          {/* `permissionCard` (:206-218). */}
          {card(
            'Permission',
            'Allow NexDo to email this list automatically each week.',
            'shield',
            <>
              <View style={styles.toggle}>
                <Text style={[textStyles.subheadline, styles.grow, { color: ink }]}>Authorize weekly emails to this recipient</Text>
                <Switch accessibilityLabel="Authorize weekly emails to this recipient" onValueChange={setConsent} testID="shopping-email-permission" trackColor={{ true: '#007AFF' }} value={consent} />
              </View>
              {note('Saving replaces the schedule. Pause future emails below. An email already submitted cannot be recalled.')}
              {blocker ? (
                <>
                  <Text style={[styles.caption, { color: muted }]} testID="shopping-email-blocker">
                    {blocker}
                  </Text>
                  {snapshot === null || snapshot.available === false ? (
                    <Pressable accessibilityRole="button" onPress={() => void load()} testID="shopping-email-check">
                      <Text style={[textStyles.subheadline, { color: purple }]}>Check availability again</Text>
                    </Pressable>
                  ) : null}
                </>
              ) : null}
            </>,
          )}

          {/* `statusCard(_:)` (:220-231). */}
          {schedule
            ? card(
                'Schedule status',
                schedule.enabled ? 'Your weekly emails are active.' : 'Your weekly emails are paused.',
                'check',
                <View style={[styles.status, { backgroundColor: withAlpha('#34C759', 0.07) }]} testID="shopping-email-status">
                  <View style={styles.inline}>
                    <Ionicons color={schedule.enabled ? '#00805C' : muted} name={schedule.enabled ? 'ellipse' : 'pause-circle-outline'} size={14} />
                    <Text style={[textStyles.subheadline, styles.semibold, { color: schedule.enabled ? '#00805C' : muted }]}>{schedule.enabled ? 'Active' : 'Paused'}</Text>
                  </View>
                  {schedule.enabled ? <Text style={[styles.caption, { color: muted }]}>{`Next run: ${displayDate(schedule.nextRunAt, savedZone)}`}</Text> : null}
                  <View style={[styles.divider, { backgroundColor: theme.colors.separator }]} />
                  <View style={styles.inline}>
                    <Ionicons color={ink} name="mail-outline" size={15} />
                    <Text selectable style={[textStyles.subheadline, { color: ink }]}>{schedule.recipient}</Text>
                  </View>
                </View>,
              )
            : null}

          {error ? (
            <View style={[styles.error, { backgroundColor: dark ? theme.colors.surface : '#FFFFFF' }]} testID="shopping-email-error">
              <Ionicons color={theme.colors.danger} name="alert-circle-outline" size={16} />
              <Text style={[textStyles.subheadline, styles.grow, { color: theme.colors.danger }]}>{error}</Text>
            </View>
          ) : null}

          {/* `actions` (:233-251). */}
          <View style={[large ? styles.column12 : styles.row12]}>
            {schedule?.enabled ? (
              <Pressable accessibilityLabel="Pause weekly emails" accessibilityRole="button" onPress={() => void change(() => shoppingEmailApi.pause(list.id))} style={[styles.action, { backgroundColor: '#FFE6ED' }]} testID="shopping-email-pause">
                <Ionicons color="#D91440" name="pause" size={15} />
                <Text style={[textStyles.subheadline, styles.bold, { color: '#D91440' }]}>Pause emails</Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityLabel={schedule === null ? 'Save schedule' : 'Save changes'}
              accessibilityRole="button"
              accessibilityState={{ disabled: blocker !== null }}
              disabled={blocker !== null}
              onPress={save}
              style={[styles.grow, { opacity: blocker === null ? 1 : 0.45 }]}
              testID="shopping-email-save"
            >
              <LinearGradient colors={[LIGHT.purple, '#5230ED']} end={{ x: 1, y: 0.5 }} start={{ x: 0, y: 0.5 }} style={styles.action}>
                <Ionicons color="#FFFFFF" name="create-outline" size={15} />
                <Text style={[textStyles.subheadline, styles.bold, { color: '#FFFFFF' }]}>{schedule === null ? 'Save schedule' : 'Save changes'}</Text>
              </LinearGradient>
            </Pressable>
          </View>

          {schedule && schedule.runs.length > 0
            ? card(
                'Recent emails',
                'Sent means Gmail accepted the email, not that the store confirmed an order.',
                'sender',
                schedule.runs.map((run) => (
                  <View key={run.id} style={styles.gap4} testID={`shopping-email-run-${run.id}`}>
                    <Text style={[textStyles.subheadline, styles.bold, { color: ink }]}>{capitalized(run.status)}</Text>
                    <Text style={[styles.caption, { color: muted }]}>{displayDate(run.dueAt, savedZone)}</Text>
                    {run.detail ? <Text style={[styles.caption, { color: muted }]}>{run.detail}</Text> : null}
                  </View>
                )),
              )
            : null}
        </View>
      </KeyboardAwareScrollView>
      {busy ? (
        <View pointerEvents="none" style={styles.overlay}>
          <View style={[styles.busy, { backgroundColor: dark ? 'rgba(44, 44, 46, 0.94)' : 'rgba(242, 242, 247, 0.94)' }]} testID="shopping-email-busy">
            <ActivityIndicator />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flex: 1 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bold: { fontWeight: '700' },
  semibold: { fontWeight: '600' },
  medium: { fontWeight: '500' },
  multiply: { mixBlendMode: 'multiply' },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  title3: { fontSize: 20, lineHeight: 25, fontWeight: '700' },
  caption: { fontSize: 12, lineHeight: 16 },
  eyebrow: { fontSize: 11, lineHeight: 13, fontWeight: '600', letterSpacing: 1.5 },
  gap3: { gap: 3 },
  gap4: { gap: 4 },
  gap7: { gap: 7 },
  gap14: { gap: 14 },
  content: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 28 },
  intro: { gap: 16, padding: 18, borderRadius: 24 },
  introArt: { width: 50, height: 50 },
  tip: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14 },
  plane: { width: 48, height: 32 },
  card: { gap: 12, padding: 16, borderRadius: 22, borderWidth: 1, shadowOpacity: 0.035, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 1 },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  cardArt: { width: 42, height: 42 },
  countPill: { alignSelf: 'flex-start', padding: 14, borderRadius: 16 },
  account: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 14 },
  accountColumn: { flexDirection: 'column', alignItems: 'flex-start' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999 },
  connectRow: { flexDirection: 'row', alignItems: 'center' },
  square44: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  field: { gap: 5, padding: 10, borderRadius: 14, borderWidth: 1 },
  input: { minHeight: 24, padding: 0, backgroundColor: 'transparent' },
  row10: { flexDirection: 'row', gap: 10 },
  column10: { gap: 10 },
  row12: { flexDirection: 'row', gap: 12 },
  column12: { gap: 12 },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  status: { gap: 10, padding: 14, borderRadius: 16 },
  divider: { height: StyleSheet.hairlineWidth },
  error: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16, borderRadius: 18 },
  action: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 50, borderRadius: 999 },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  busy: { padding: 18, borderRadius: 16 },
});
