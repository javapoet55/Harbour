import Ionicons from '@expo/vector-icons/Ionicons';
import { useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, TextInput, View, type KeyboardTypeOptions, type StyleProp, type ViewStyle } from 'react-native';

import { MonthCalendar } from '../../components/MonthCalendar';
import { withAlpha } from '../../components/SignInBackdrop';
import { Text } from '../../components/Text';
import { brand, textStyles, useTheme } from '../../theme';
import { momentDay, momentLabel, momentStartOfDay, sendDayLabel, wallParts, zonedInstant } from './dates';

/**
 * SwiftUI `Form` pieces with the iOS 26 inset-grouped metrics the rest of the app measured (style map
 * §7): 16pt outer inset, 26pt corners, 56pt rows, sentence-case `.body` headers, `.subheadline`
 * footers — and the pickers Moments uses in and out of a `Form`.
 */

export function FormScroll({ children, testID }: { children: ReactNode; testID?: string }) {
  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form} testID={testID}>
      {children}
    </ScrollView>
  );
}

export function FormSection({ children, header, footer, disabled = false, testID }: { children: ReactNode; header?: string; footer?: string; disabled?: boolean; testID?: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.section, disabled && styles.dimmed]} pointerEvents={disabled ? 'none' : 'auto'} testID={testID}>
      {header ? <Text style={[styles.header, { color: theme.colors.secondaryLabel }]}>{header}</Text> : null}
      <View style={[styles.sectionBody, { backgroundColor: theme.colors.surface }]}>{children}</View>
      {footer ? <Text style={[styles.footer, { color: theme.colors.secondaryLabel }]}>{footer}</Text> : null}
    </View>
  );
}

export function FormRow({ children, last = false, style }: { children: ReactNode; last?: boolean; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return <View style={[styles.row, !last && { borderBottomWidth: 1, borderBottomColor: theme.colors.listSeparator }, style]}>{children}</View>;
}

export function FormText({ children, caption = false, tone, testID }: { children: ReactNode; caption?: boolean; tone?: 'secondary' | 'danger'; testID?: string }) {
  const theme = useTheme();
  const color = tone === 'danger' ? theme.colors.danger : tone === 'secondary' ? theme.colors.secondaryLabel : theme.colors.label;
  return (
    <Text style={[caption ? { fontSize: 12, lineHeight: 16 } : textStyles.body, { color }]} testID={testID}>
      {children}
    </Text>
  );
}

export function FormField({
  placeholder,
  value,
  onChangeText,
  keyboardType,
  autoCapitalize,
  autoCorrect,
  multiline = false,
  testID,
  accessibilityLabel,
  align,
  bold = false,
  maxLength,
}: {
  placeholder: string;
  value: string;
  onChangeText: (next: string) => void;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words';
  autoCorrect?: boolean;
  multiline?: boolean;
  testID?: string;
  accessibilityLabel?: string;
  align?: 'left' | 'right';
  bold?: boolean;
  maxLength?: number;
}) {
  const theme = useTheme();
  return (
    <TextInput
      accessibilityLabel={accessibilityLabel ?? placeholder}
      autoCapitalize={autoCapitalize}
      autoCorrect={autoCorrect}
      keyboardType={keyboardType}
      maxLength={maxLength}
      multiline={multiline}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={theme.colors.placeholder}
      returnKeyType={multiline ? 'default' : 'done'}
      style={[styles.input, { color: theme.colors.label, textAlign: align, fontWeight: bold ? '700' : '400' }]}
      testID={testID}
      value={value}
    />
  );
}

export function FormToggle({ label, value, onValueChange, disabled = false, testID }: { label: string; value: boolean; onValueChange: (next: boolean) => void; disabled?: boolean; testID?: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.inline, disabled && styles.dimmed]}>
      <Text style={[textStyles.body, styles.grow, { color: theme.colors.label }]}>{label}</Text>
      <Switch
        accessibilityLabel={label}
        disabled={disabled}
        onValueChange={onValueChange}
        testID={testID}
        thumbColor="#FFFFFF"
        trackColor={{ false: theme.colors.separator, true: theme.colors.tint }}
        value={value}
      />
    </View>
  );
}

export function FormButton({ title, onPress, destructive = false, disabled = false, testID, icon }: { title: string; onPress: () => void; destructive?: boolean; disabled?: boolean; testID?: string; icon?: keyof typeof Ionicons.glyphMap }) {
  const theme = useTheme();
  const color = destructive ? theme.colors.danger : theme.colors.tint;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.inline, disabled && styles.dimmed]}
      testID={testID}
    >
      {icon ? <Ionicons name={icon} size={20} color={color} /> : null}
      <Text style={[textStyles.body, { color }]}>{title}</Text>
    </Pressable>
  );
}

/** A `NavigationLink` row: the title and a chevron. */
export function FormLink({ title, onPress, testID }: { title: string; onPress: () => void; testID?: string }) {
  const theme = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={styles.inline} testID={testID}>
      <Text style={[textStyles.body, styles.grow, { color: theme.colors.label }]}>{title}</Text>
      <Ionicons name="chevron-forward" size={17} color={theme.colors.secondaryLabel} />
    </Pressable>
  );
}

/** `LabeledContent(_:value:)`. */
export function LabeledValue({ label, value, testID }: { label: string; value: string; testID?: string }) {
  const theme = useTheme();
  return (
    <View style={styles.inline} testID={testID}>
      <Text style={[textStyles.body, { color: theme.colors.label }]}>{label}</Text>
      <View style={styles.grow} />
      <Text style={[textStyles.body, styles.value, { color: theme.colors.secondaryLabel }]}>{value}</Text>
    </View>
  );
}

export type PickerOption<T> = { value: T; title: string };

/**
 * A SwiftUI `Picker`: the label, the current choice in the tint, and the choices on tap. `hideLabel`
 * is `.labelsHidden()` — the menu button alone.
 */
export function MenuPicker<T extends string | number>({
  label,
  options,
  value,
  onChange,
  testID,
  hideLabel = false,
  disabled = false,
  accessibilityLabel,
}: {
  label: string;
  options: readonly PickerOption<T>[];
  value: T;
  onChange: (next: T) => void;
  testID: string;
  hideLabel?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const current = options.find((option) => option.value === value);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${accessibilityLabel ?? label}, ${current?.title ?? ''}`}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={[hideLabel ? styles.menuButton : styles.inline, disabled && styles.dimmed]}
        testID={testID}
      >
        {hideLabel ? null : <Text style={[textStyles.body, styles.grow, { color: theme.colors.label }]}>{label}</Text>}
        <Text numberOfLines={1} style={[textStyles.body, styles.value, { color: theme.colors.tint }]}>
          {current?.title ?? ''}
        </Text>
        <Ionicons name="chevron-expand-outline" size={14} color={theme.colors.tint} />
      </Pressable>
      <Modal animationType="fade" onRequestClose={() => setOpen(false)} transparent visible={open}>
        <Pressable onPress={() => setOpen(false)} style={styles.scrim}>
          <View style={[styles.menu, { backgroundColor: theme.colors.surface }]}>
            <ScrollView>
              {options.map((option) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: option.value === value }}
                  key={String(option.value)}
                  onPress={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  style={styles.menuRow}
                  testID={`${testID}-${option.value}`}
                >
                  <Text style={[textStyles.body, styles.grow, { color: theme.colors.ink }]}>{option.title}</Text>
                  {option.value === value ? <Ionicons name="checkmark" size={17} color={theme.colors.tint} /> : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const FALLBACK_ZONES = [
  'Africa/Cairo', 'Africa/Johannesburg', 'Africa/Lagos', 'Africa/Nairobi', 'America/Anchorage', 'America/Argentina/Buenos_Aires',
  'America/Bogota', 'America/Chicago', 'America/Denver', 'America/Halifax', 'America/Los_Angeles', 'America/Mexico_City',
  'America/New_York', 'America/Phoenix', 'America/Sao_Paulo', 'America/St_Johns', 'America/Toronto', 'America/Vancouver',
  'Asia/Bangkok', 'Asia/Colombo', 'Asia/Dhaka', 'Asia/Dubai', 'Asia/Hong_Kong', 'Asia/Jakarta', 'Asia/Jerusalem', 'Asia/Karachi',
  'Asia/Kathmandu', 'Asia/Kolkata', 'Asia/Kuala_Lumpur', 'Asia/Manila', 'Asia/Riyadh', 'Asia/Seoul', 'Asia/Shanghai',
  'Asia/Singapore', 'Asia/Taipei', 'Asia/Tehran', 'Asia/Tokyo', 'Atlantic/Reykjavik', 'Australia/Adelaide', 'Australia/Brisbane',
  'Australia/Melbourne', 'Australia/Perth', 'Australia/Sydney', 'Europe/Amsterdam', 'Europe/Athens', 'Europe/Berlin',
  'Europe/Dublin', 'Europe/Istanbul', 'Europe/Lisbon', 'Europe/London', 'Europe/Madrid', 'Europe/Moscow', 'Europe/Paris',
  'Europe/Rome', 'Europe/Stockholm', 'Europe/Zurich', 'Pacific/Auckland', 'Pacific/Honolulu', 'UTC',
];

/**
 * `TimeZone.knownTimeZoneIdentifiers`. Hermes may not implement `Intl.supportedValuesOf`, in which
 * case a list of the major zones stands in, always including the zone already chosen.
 */
export function knownTimeZones(include: string[] = []): string[] {
  let zones: string[] = [];
  try {
    const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.('timeZone');
    if (supported && supported.length > 0) zones = supported;
  } catch {
    zones = [];
  }
  if (zones.length === 0) zones = FALLBACK_ZONES;
  return [...new Set([...zones, ...include.filter(Boolean)])].sort();
}

/** `Picker("Time zone", selection:)` over every known identifier. */
export function ZonePicker({ value, onChange, testID = 'zone-picker', hideLabel = false, label = 'Time zone', format }: { value: string; onChange: (next: string) => void; testID?: string; hideLabel?: boolean; label?: string; format?: (zone: string) => string }) {
  const options = knownTimeZones([value]).map((zone) => ({ value: zone, title: format ? format(zone) : zone }));
  return <MenuPicker hideLabel={hideLabel} label={label} onChange={onChange} options={options} testID={testID} value={value} />;
}

/** `TimeZone.localizedName(for: .generic, locale: .current)` — "Pacific Time". */
export function genericZoneName(zone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longGeneric' as 'long' }).formatToParts(new Date());
    return parts.find((part) => part.type === 'timeZoneName')?.value ?? zone;
  } catch {
    return zone;
  }
}

/**
 * `DatePicker(_, selection:, in: min..., displayedComponents:)`: the compact field, opening the month
 * grid (and the hour and minute wheels when the time is shown). A pick earlier than `minimum` is
 * raised to it, which is what the bounded SwiftUI picker allows.
 */
export function DateField({
  label,
  value,
  onChange,
  zone,
  minimum,
  includeTime = false,
  disabled = false,
  testID,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  zone: string;
  minimum?: number;
  includeTime?: boolean;
  disabled?: boolean;
  testID: string;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const clamp = (next: number) => (minimum !== undefined && next < minimum ? minimum : next);
  const wall = wallParts(value, zone);
  const setTime = (hour: number, minute: number) => {
    const at = zonedInstant(momentDay(value, zone), hour, minute, zone);
    if (at !== null) onChange(clamp(at));
  };
  const dateText = sendDayLabel(value, zone).replace(/^\w+, /, '');
  const timeText = momentLabel(value, zone).split(' at ')[1] ?? '';
  return (
    <View style={[styles.inline, disabled && styles.dimmed]}>
      <Text style={[textStyles.body, styles.grow, { color: theme.colors.label }]}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${dateText}${includeTime ? `, ${timeText}` : ''}`}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={[styles.datePill, { backgroundColor: withAlpha('#767680', 0.12) }]}
        testID={testID}
      >
        <Text style={[textStyles.body, { color: theme.colors.label }]}>{dateText}</Text>
      </Pressable>
      {includeTime ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`${label} time, ${timeText}`} disabled={disabled} onPress={() => setOpen(true)} style={[styles.datePill, { backgroundColor: withAlpha('#767680', 0.12) }]} testID={`${testID}-time`}>
          <Text style={[textStyles.body, { color: theme.colors.label }]}>{timeText}</Text>
        </Pressable>
      ) : null}
      <Modal animationType="fade" onRequestClose={() => setOpen(false)} transparent visible={open}>
        <Pressable onPress={() => setOpen(false)} style={styles.scrim}>
          <Pressable style={[styles.menu, styles.calendarMenu, { backgroundColor: theme.colors.surface }]}>
            <MonthCalendar
              selected={value}
              timeZone={zone}
              onSelect={(next) => {
                const day = momentDay(next, zone);
                const at = includeTime ? zonedInstant(day, wall.hour, wall.minute, zone) : momentStartOfDay(next, zone);
                onChange(clamp(at ?? next));
              }}
            />
            {includeTime ? (
              <View style={styles.wheels}>
                <Wheel count={24} selected={wall.hour} onSelect={(hour) => setTime(hour, wall.minute)} testIDPrefix={`${testID}-hour`} />
                <Wheel count={60} selected={wall.minute} onSelect={(minute) => setTime(wall.hour, minute)} testIDPrefix={`${testID}-minute`} />
              </View>
            ) : null}
            <Pressable accessibilityRole="button" onPress={() => setOpen(false)} style={styles.menuRow} testID={`${testID}-done`}>
              <Text style={[textStyles.body, { color: theme.colors.tint }]}>Done</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function Wheel({ count, selected, onSelect, testIDPrefix }: { count: number; selected: number; onSelect: (next: number) => void; testIDPrefix: string }) {
  const theme = useTheme();
  return (
    <ScrollView style={styles.wheel}>
      {Array.from({ length: count }, (_, index) => (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: index === selected }}
          key={index}
          onPress={() => onSelect(index)}
          style={styles.wheelRow}
          testID={`${testIDPrefix}-${index}`}
        >
          <Text style={[textStyles.body, { color: index === selected ? theme.colors.tint : theme.colors.ink }]}>{String(index).padStart(2, '0')}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

/** `DisclosureGroup(_:) { … }`: a tint title with a chevron that reveals its content. */
export function Disclosure({ title, children, testID }: { title: string; children: ReactNode; testID?: string }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.disclosure}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={title} onPress={() => setOpen(!open)} style={styles.inline} testID={testID}>
        <Text style={[textStyles.body, styles.grow, { color: theme.colors.label }]}>{title}</Text>
        <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={17} color={brand.nexdoIndigo} />
      </Pressable>
      {open ? <View style={styles.disclosureBody}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  form: { paddingTop: 35, paddingBottom: 60 },
  section: { marginBottom: 0 },
  sectionBody: { marginHorizontal: 16, borderRadius: 26, overflow: 'hidden', marginTop: 8 },
  row: { minHeight: 56, paddingHorizontal: 16, paddingVertical: 12, justifyContent: 'center', gap: 10 },
  header: { ...textStyles.body, marginHorizontal: 32, marginTop: 16 },
  footer: { ...textStyles.subheadline, marginHorizontal: 32, marginTop: 10, marginBottom: 12 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32 },
  grow: { flex: 1 },
  value: { flexShrink: 1 },
  dimmed: { opacity: 0.4 },
  input: { ...textStyles.body, lineHeight: undefined, paddingVertical: 4, minHeight: 32, backgroundColor: 'transparent' },
  menuButton: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingHorizontal: 8 },
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', padding: 24 },
  menu: { borderRadius: 16, paddingVertical: 8, maxHeight: '80%' },
  calendarMenu: { paddingHorizontal: 12 },
  menuRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, minHeight: 48, gap: 8 },
  datePill: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  wheels: { flexDirection: 'row', gap: 12, height: 180, marginTop: 8 },
  wheel: { flex: 1 },
  wheelRow: { minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  disclosure: { gap: 12 },
  disclosureBody: { gap: 12 },
});
