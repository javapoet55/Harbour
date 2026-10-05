import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';
import { shoppingEmailApi, type ShoppingEmailSnapshot } from '../../../../src/api/shopping';
import { KeyboardAwareScrollView } from '../../../../src/components/keyboard';
import { Text } from '../../../../src/components/Text';
import { connectGmail, EMAIL_CONNECT_FAILED } from '../../../../src/features/moments/device';
import { useShopping } from '../../../../src/features/shopping/store';
import { useTheme } from '../../../../src/theme';

const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export default function ShoppingEmailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const list = useShopping(s => s.lists.find(l => l.id === id));
  const { colors } = useTheme();
  const [snapshot, setSnapshot] = useState<ShoppingEmailSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [day, setDay] = useState(6);
  const [time, setTime] = useState('10:00');
  const [zone, setZone] = useState(list?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [consent, setConsent] = useState(false);
  const load = useCallback(async () => {
    try {
      const value = await shoppingEmailApi.get(id); setSnapshot(value); setError('');
      if (value.schedule) {
        const s = value.schedule; setCustomerPhone(s.customerPhone || ''); setName(s.recipientName); setEmail(s.recipient); setDay(s.weekday); setZone(s.timeZone);
        setTime(`${String(s.hour).padStart(2, '0')}:${String(s.minute).padStart(2, '0')}`);
      }
      setConsent(false);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load schedule.'); }
    finally { setLoading(false); }
  }, [id]);
  // Synchronize with the backend; load only updates state after its asynchronous request.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);
  const validTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
  let validZone = true; try { new Intl.DateTimeFormat('en', { timeZone: zone }); } catch { validZone = false; }
  const ready = !loading && !busy && !!snapshot?.available && snapshot.account?.status === 'connected';
  const normalizedPhone = customerPhone.replace(/[\s().-]/g, '');
  const validPhone = /^\+[1-9]\d{7,14}$/.test(normalizedPhone);
  const valid = validPhone && ready && consent && name.trim().length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && validTime && validZone;
  const act = async (operation: 'save' | 'pause' | 'connect') => {
    setBusy(true); setError(''); setNotice('');
    try {
      if (operation === 'connect') {
        const { url } = await shoppingEmailApi.connect(id);
        const ticket = await connectGmail(url);
        if (!ticket) throw new Error(EMAIL_CONNECT_FAILED);
        await shoppingEmailApi.confirmGmail(ticket);
        await load(); setNotice('Gmail connected. Review and save your schedule.');
      } else {
        const value = operation === 'pause' ? await shoppingEmailApi.pause(id) : await shoppingEmailApi.save(id, {
          customerPhone: normalizedPhone, recipient: email.trim(), recipientName: name.trim(), timeZone: zone, weekday: day,
          hour: Number(time.split(':')[0]), minute: Number(time.split(':')[1]), consent: true,
        });
        setSnapshot(value); setConsent(false); setNotice(operation === 'pause' ? 'Weekly emails paused.' : 'Weekly email scheduled.');
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to update schedule.'); }
    finally { setBusy(false); }
  };
  const card = [styles.card, { backgroundColor: colors.secondaryBackground }];
  const field = [styles.field, { color: colors.label, backgroundColor: colors.fieldSurface, borderColor: colors.fieldBorder }];
  const label = [styles.label, { color: colors.label }];
  const secondary = { color: colors.secondaryLabel };
  const button = (title: string, onPress: () => void, disabled = false) => <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[styles.button, { backgroundColor: disabled ? colors.fieldSurface : '#6041D9' }]}><Text style={{ color: disabled ? colors.secondaryLabel : '#FFFFFF', fontWeight: '700' }}>{title}</Text></Pressable>;
  const dateLabel = (value: string) => new Date(value).toLocaleString(undefined, { timeZone: snapshot?.schedule?.timeZone || 'UTC', dateStyle: 'medium', timeStyle: 'short' });
  return <View style={{ flex: 1, backgroundColor: colors.groupedBackground }}>
    <Stack.Screen options={{ title: 'Schedule email' }} />
    <KeyboardAwareScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <LinearGradient colors={['#4C3BC9', '#873DE0']} style={styles.hero}>
        <Ionicons name="mail-outline" size={32} color="white" />
        <Text style={styles.title}>Your list. Delivered weekly.</Text>
        <Text style={styles.heroText}>Send groceries to your store manager, even when NexDo is closed.</Text>
        <Text style={styles.heroText}>{list?.title || 'Shopping List'}</Text>
      </LinearGradient>
      {loading ? <ActivityIndicator accessibilityLabel="Loading email schedule" /> : <>
        <View style={card}><Text style={label}>01 · Sending account</Text>
          <Text>{snapshot?.account?.email || 'Connect your Gmail account'}</Text>
          <Text style={secondary}>{snapshot?.account?.status === 'connected' ? 'Connected · emails come from your account' : 'Securely authorize Gmail to send your list.'}</Text>
          {button(snapshot?.account?.status === 'connected' ? 'Reconnect Gmail' : 'Connect Gmail', () => void act('connect'), busy || !snapshot?.available)}
          {snapshot && !snapshot.available && <Text style={secondary}>Weekly email is not available on this server yet.</Text>}
        </View>
        <View style={card}><Text style={label}>02 · Store manager</Text>
          <Text>Recipient name</Text><TextInput accessibilityLabel="Recipient name" value={name} onChangeText={setName} maxLength={100} style={field} editable={!busy} placeholder="e.g. Alex" placeholderTextColor={colors.secondaryLabel} />
          <Text>Email address</Text><TextInput accessibilityLabel="Recipient email" value={email} onChangeText={setEmail} maxLength={254} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} style={field} editable={!busy} placeholder="manager@store.com" placeholderTextColor={colors.secondaryLabel} />
        </View>
        <View style={card}><Text style={label}>Your contact number</Text>
          <Text style={secondary}>The store will use this number for pickup updates and questions. It will be included in your email.</Text>
          <TextInput accessibilityLabel="Your phone number" value={customerPhone} onChangeText={setCustomerPhone} keyboardType="phone-pad" textContentType="telephoneNumber" placeholder="+1 415 555 0123" placeholderTextColor={colors.secondaryLabel} style={field} editable={!busy} />
          {!validPhone && <Text style={secondary}>Enter your phone number with country code, for example +1.</Text>}
        </View>
        <View style={card}><Text style={label}>03 · Weekly delivery</Text>
          <View style={styles.days}>{days.map((d, i) => <Pressable key={d} accessibilityRole="radio" accessibilityLabel={d} accessibilityState={{ selected: day === i }} disabled={busy} onPress={() => setDay(i)} style={[styles.day, { backgroundColor: day === i ? '#6041D9' : colors.fieldSurface }]}><Text style={{ color: day === i ? 'white' : colors.label }}>{d.slice(0, 3)}</Text></Pressable>)}</View>
          <Text>Time (24-hour format)</Text><TextInput accessibilityLabel="Delivery time" value={time} onChangeText={setTime} placeholder="10:00" keyboardType="numbers-and-punctuation" style={field} editable={!busy} />
          {!validTime && <Text style={secondary}>Enter a time such as 10:00 or 18:30.</Text>}
          <Text>Timezone</Text><TextInput accessibilityLabel="Delivery timezone" value={zone} onChangeText={setZone} autoCapitalize="none" autoCorrect={false} style={field} editable={!busy} />
          {!validZone && <Text style={secondary}>Enter a valid timezone, such as America/Los_Angeles.</Text>}
          <Text style={secondary}>Every {days[day]} at {time}. Daylight saving is handled automatically. Sending may take a few minutes.</Text>
        </View>
        <View style={card}><Text style={label}>Email preview</Text><Text style={secondary}>Only checked items are included when the email runs. Unchecked items are excluded. If nothing is checked, the email is skipped.</Text>
          <Text>Hi {name.trim() || 'there'},</Text><Text>Here is my shopping list:</Text>
          {list?.items.filter(i => i.checked).slice(0, 5).map(i => <Text key={i.id}>• {i.name} — {i.quantity}{i.size ? ` · ${i.size}` : ''}{i.notes ? ` (${i.notes})` : ''}</Text>)}
          {!list?.items.some(i => i.checked) && <Text style={secondary}>Check items in your shopping list to include them here.</Text>}
          {(list?.items.filter(i => i.checked).length || 0) > 5 && <Text style={secondary}>All other checked items will also be included.</Text>}
          <Text>Please let me know about availability and any substitutions.</Text>
        </View>
        <View style={card}><View style={styles.consent}><Text style={{ flex: 1 }}>I authorize NexDo to email this list to this recipient automatically each week.</Text><Switch accessibilityLabel="Authorize automatic weekly email" value={consent} onValueChange={setConsent} disabled={busy} /></View>
          <Text style={secondary}>A recurring list’s schedule follows the next shopping trip. You can pause future sends; submitted emails cannot be recalled.</Text>
          {button(busy ? 'Saving…' : 'Save weekly schedule', () => void act('save'), !valid)}
          {snapshot?.schedule?.enabled && button('Pause weekly emails', () => void act('pause'), busy)}
        </View>
        {snapshot?.schedule && <View style={card}><Text style={label}>{snapshot.schedule.enabled ? 'Schedule active' : 'Schedule paused'}</Text><Text>To: {snapshot.schedule.recipient}</Text>
          {snapshot.schedule.enabled && <Text>Next: {dateLabel(snapshot.schedule.nextRunAt)} · {snapshot.schedule.timeZone}</Text>}
          <Text style={label}>Recent emails</Text>{snapshot.schedule.runs.length === 0 && <Text style={secondary}>No emails sent yet.</Text>}
          {snapshot.schedule.runs.map(run => <View key={run.id}><Text>{run.status.toUpperCase()} · {dateLabel(run.dueAt)}</Text><Text style={secondary}>{run.detail}</Text></View>)}
          <Text style={secondary}>Sent means Gmail accepted the email, not that the store confirmed an order.</Text>
        </View>}
      </>}
      {!!notice && <Text accessibilityRole="alert" style={label}>{notice}</Text>}
      {!!error && <View style={card}><Text accessibilityRole="alert" style={{ color: colors.label }}>{error}</Text>{button('Reload schedule', () => { setLoading(true); void load(); }, busy)}</View>}
    </KeyboardAwareScrollView>
  </View>;
}
const styles = StyleSheet.create({
  content: { padding: 18, paddingBottom: 48, gap: 16 }, hero: { borderRadius: 24, padding: 24, gap: 12 },
  title: { fontSize: 26, fontWeight: '800', color: 'white' }, heroText: { fontSize: 16, lineHeight: 23, color: 'white' },
  card: { padding: 18, borderRadius: 20, gap: 12 }, label: { fontSize: 17, fontWeight: '700' },
  field: { borderWidth: 1, borderRadius: 12, padding: 13, fontSize: 16, minHeight: 48 },
  button: { minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', padding: 12 },
  days: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, day: { minWidth: 54, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  consent: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
