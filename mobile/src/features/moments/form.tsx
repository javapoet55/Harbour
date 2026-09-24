import Ionicons from '@expo/vector-icons/Ionicons';
import { useContext, useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View, type KeyboardTypeOptions, type StyleProp, type ViewStyle } from 'react-native';

import { KeyboardAwareScrollView } from '../../components/keyboard';
import { MonthCalendar } from '../../components/MonthCalendar';
import { IOSSwitch } from '../../components/IOSSwitch';
import { withAlpha } from '../../components/SignInBackdrop';
import { Text } from '../../components/Text';
import { androidGroup, androidLabel, androidPill, androidSeparator, FieldGroupContext, isAndroid, textStyles, useTheme } from '../../theme';
import { KEYBOARD_DONE_BAR_HEIGHT } from './components';
import { mediumDate, momentDay, momentStartOfDay, shortTimeIn, wallParts, zonedInstant } from './dates';

/**
 * SwiftUI `Form` pieces with the iOS 26 inset-grouped metrics the rest of the app measured (style map
 * §7): 16pt outer inset, 26pt corners, 56pt rows, sentence-case `.body` headers, `.subheadline`
 * footers — and the pickers Moments uses in and out of a `Form`.
 */

/** A `Form`'s scroll. On Android it keeps the focused field above the keyboard and its "Done" capsule. */
export function FormScroll({ children, testID }: { children: ReactNode; testID?: string }) {
  return (
    <KeyboardAwareScrollView bottomOffset={KEYBOARD_DONE_BAR_HEIGHT} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form} testID={testID}>
      {children}
    </KeyboardAwareScrollView>
  );
}

export function FormSection({ children, header, footer, disabled = false, testID }: { children: ReactNode; header?: string; footer?: string; disabled?: boolean; testID?: string }) {
  const theme = useTheme();
  return (
    // A section with no header still keeps iOS 26's section spacing above it (`moments-festivals`: the
    // first card 45pt below the bar); a header supplies that space itself.
    <View style={[styles.section, !header && styles.headerless, disabled && styles.dimmed]} pointerEvents={disabled ? 'none' : 'auto'} testID={testID}>
      {/* Android: the shared field label, 20 below the section before it (docs/android-polish.md §4). */}
      {header ? (
        <Text style={[styles.header, { color: theme.colors.secondaryLabel }, androidLabel(theme), isAndroid() && styles.androidHeader]} testID={testID ? `${testID}-header` : undefined}>
          {header}
        </Text>
      ) : null}
      {/* Android: the field surface and hairline round the group, rows split by `androidSeparator`
          (docs/android-polish.md §2, §3). */}
      <View style={[styles.sectionBody, { backgroundColor: theme.colors.surface }, androidGroup(theme)]} testID={testID ? `${testID}-body` : undefined}>
        <FieldGroupContext.Provider value={isAndroid() ? 'group' : null}>{children}</FieldGroupContext.Provider>
      </View>
      {footer ? <Text style={[styles.footer, { color: theme.colors.secondaryLabel }]}>{footer}</Text> : null}
    </View>
  );
}

/**
 * A `Form` row. Its separator starts at the row inset (16) and runs to the trailing edge, as iOS draws
 * it; a row that begins with a glyph passes `separatorInset` so the line starts under its TEXT, as a
 * `Label` row's does (SHARED-REQUESTS "FormRow").
 */
export function FormRow({
  children,
  last = false,
  style,
  separatorInset = 16,
}: {
  children: ReactNode;
  last?: boolean;
  style?: StyleProp<ViewStyle>;
  separatorInset?: number;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.row, style]}>
      {children}
      {last ? null : (
        <View pointerEvents="none" style={[styles.separator, { left: separatorInset, backgroundColor: theme.colors.listSeparator }, androidSeparator(theme)]} testID="form-row-separator" />
      )}
    </View>
  );
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
      <IOSSwitch
        accessibilityLabel={label}
        disabled={disabled}
        onValueChange={onValueChange}
        testID={testID}
        value={value}
      />
    </View>
  );
}

export function FormButton({ title, onPress, destructive = false, disabled = false, testID, icon }: { title: string; onPress: () => void; destructive?: boolean; disabled?: boolean; testID?: string; icon?: keyof typeof Ionicons.glyphMap }) {
  const theme = useTheme();
  const color = destructive ? theme.colors.danger : theme.colors.link;
  // A disabled `Button` in a `Form` keeps its glyph in the tint and draws the title in `.tertiaryLabel`
  // — measured (187, 187, 188) light and (88, 88, 89) dark on `moments-settings` — rather than dimming
  // the whole row (SHARED-REQUESTS "FormButton").
  const titleColor = disabled ? (theme.scheme === 'dark' ? 'rgba(235, 235, 245, 0.3)' : 'rgba(60, 60, 67, 0.3)') : color;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={styles.inline}
      testID={testID}
    >
      {icon ? <Ionicons name={icon} size={20} color={color} /> : null}
      <Text style={[textStyles.body, { color: titleColor }]}>{title}</Text>
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
 *
 * UI-parity pass 2: the choices open the way SwiftUI's menu does — a popover ANCHORED to the button,
 * with no dimming, a leading checkmark on the current choice and a translucent surface — rather than a
 * centred, dimmed list. Measured off `moments-filter-menu`: 250pt wide, its trailing edge on the
 * button's when the button is on the right of the screen (leading edge otherwise), 42pt rows, a 26pt
 * radius. Like iOS 26's it opens OVER the button, from its top edge, and above it when there is no room.
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
  const anchor = useRef<View>(null);
  const menu = usePopoverMenu(anchor);
  const current = options.find((option) => option.value === value);
  // Android, in a form: the choice and its chevron sit in a field pill (docs/android-polish.md §4).
  const pill = androidPill(theme, useContext(FieldGroupContext));
  const choice = (
    <>
      <Text numberOfLines={1} style={[textStyles.body, styles.value, { color: theme.colors.link }]}>
        {current?.title ?? ''}
      </Text>
      <Ionicons name="chevron-expand-outline" size={14} color={theme.colors.link} />
    </>
  );

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${accessibilityLabel ?? label}, ${current?.title ?? ''}`}
        accessibilityState={{ disabled }}
        collapsable={false}
        disabled={disabled}
        onPress={menu.open}
        ref={anchor}
        style={[hideLabel ? styles.menuButton : styles.inline, disabled && styles.dimmed]}
        testID={testID}
      >
        {hideLabel ? null : <Text style={[textStyles.body, styles.grow, { color: theme.colors.label }]}>{label}</Text>}
        {pill ? (
          <View style={[styles.menuPill, pill]} testID={`${testID}-pill`}>
            {choice}
          </View>
        ) : (
          choice
        )}
      </Pressable>
      <PopoverMenu
        items={options.map((option) => ({
          key: String(option.value),
          title: option.title,
          checked: option.value === value,
          onPress: () => onChange(option.value),
          testID: `${testID}-${option.value}`,
        }))}
        menu={menu}
        showsChecks
        testID={testID}
      />
    </>
  );
}

type MenuFrame = { x: number; y: number; width: number; height: number };
type MenuState = { visible: boolean; frame: MenuFrame | null; open: () => void; close: () => void };

/** Open and close a `PopoverMenu` anchored to `anchor`, measured when it opens. */
export function usePopoverMenu(anchor: { current: View | null }): MenuState {
  const [visible, setVisible] = useState(false);
  const [frame, setFrame] = useState<MenuFrame | null>(null);
  return {
    visible,
    frame,
    // The menu mounts at once and stays invisible until the anchor has been measured, so it never
    // shows for a frame in the wrong place.
    open: () => {
      setVisible(true);
      anchor.current?.measureInWindow?.((x, y, width, height) => setFrame({ x, y, width, height }));
    },
    close: () => {
      setVisible(false);
      setFrame(null);
    },
  };
}

export type PopoverItem = { key: string; title: string; onPress: () => void; destructive?: boolean; checked?: boolean; testID?: string };

/** Each key as given, with a repeat suffixed by its row (`#2`), so two items with one value still render. */
export function uniqueKeys(keys: string[]): string[] {
  const seen = new Set<string>();
  return keys.map((key, index) => {
    const unique = seen.has(key) ? `${key}#${index}` : key;
    seen.add(unique);
    return unique;
  });
}

/**
 * SwiftUI's `Menu` on iOS 26 (UI-parity pass 2): a translucent popover grown out of the button that
 * opened it, with NO dimming behind it — measured on `moments-filter-menu` and
 * `moment-manage-options-menu`. `showsChecks` reserves the leading checkmark column a `Picker` uses.
 */
export function PopoverMenu({ items, menu, showsChecks = false, testID }: { items: PopoverItem[]; menu: MenuState; showsChecks?: boolean; testID?: string }) {
  const theme = useTheme();
  const keys = uniqueKeys(items.map((item) => item.key));
  const window = useWindowDimensions();
  const placement = menu.frame
    ? menuPlacement(menu.frame, items.length, window.width, window.height)
    : { left: 0, top: 0, width: MENU_WIDTH, maxHeight: window.height, opacity: 0 };
  return (
    <Modal animationType="fade" onRequestClose={menu.close} transparent visible={menu.visible}>
      <Pressable onPress={menu.close} style={styles.fill} testID={testID ? `${testID}-dismiss` : undefined}>
        {menu.visible ? (
          <View
            style={[
              styles.menu,
              placement,
              { backgroundColor: theme.scheme === 'dark' ? 'rgba(44, 44, 46, 0.96)' : 'rgba(255, 255, 255, 0.94)', shadowColor: '#000000' },
            ]}
          >
            <ScrollView bounces={false}>
              {items.map((item, index) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={item.checked === undefined ? undefined : { selected: item.checked }}
                  key={keys[index]}
                  onPress={() => {
                    menu.close();
                    item.onPress();
                  }}
                  style={[styles.menuRow, !showsChecks && styles.menuRowPlain]}
                  testID={item.testID}
                >
                  {showsChecks ? (
                    <View style={styles.menuCheck}>{item.checked ? <Ionicons name="checkmark" size={17} color={theme.colors.label} /> : null}</View>
                  ) : null}
                  <Text numberOfLines={1} style={[textStyles.body, styles.grow, { color: item.destructive ? theme.colors.danger : theme.colors.label }]}>
                    {item.title}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}
      </Pressable>
    </Modal>
  );
}

/**
 * Where the compact `DatePicker`'s popover goes: 320pt wide (`moment-create-date-picker`), its
 * trailing edge on the pill's, 8pt below it — or above when the grid will not fit below.
 */
export function datePopoverPlacement(frame: MenuFrame, screenWidth: number, screenHeight: number, withTime = false): { left: number; top: number; width: number } {
  const width = Math.min(320, screenWidth - MENU_MARGIN * 2);
  const height = withTime ? 520 : 360;
  const left = Math.max(MENU_MARGIN, Math.min(frame.x + frame.width - width, screenWidth - width - MENU_MARGIN));
  const below = frame.y + frame.height + 8;
  const top = below + height <= screenHeight - MENU_MARGIN ? below : Math.max(MENU_MARGIN, frame.y - 8 - height);
  return { left, top, width };
}

const MENU_WIDTH = 250;
const MENU_ROW = 42;
const MENU_PADDING = 8;
const MENU_MARGIN = 12;

/**
 * Where the popover goes for a button at `frame`: below it if the rows fit, else above; trailing-edge
 * aligned for a button on the right half of the screen, leading-edge aligned otherwise; never off
 * screen. A list too long for the space scrolls.
 */
export function menuPlacement(
  frame: { x: number; y: number; width: number; height: number },
  count: number,
  screenWidth: number,
  screenHeight: number,
): { left: number; top: number; width: number; maxHeight: number } {
  const width = Math.min(MENU_WIDTH, screenWidth - MENU_MARGIN * 2);
  const wanted = count * MENU_ROW + MENU_PADDING * 2;
  // A button wider than the menu (a whole row) is always leading-aligned (`moment-manage-schedule-channel-menu`).
  const onRight = frame.width < width && frame.x + frame.width / 2 > screenWidth / 2;
  const left = Math.max(MENU_MARGIN, Math.min(onRight ? frame.x + frame.width - width : frame.x, screenWidth - width - MENU_MARGIN));
  // iOS 26 grows the menu out of the button, so it covers the button from the button's top edge.
  const below = screenHeight - frame.y - MENU_MARGIN;
  const above = frame.y + frame.height - MENU_MARGIN;
  if (wanted <= below || below >= above) {
    return { left, top: frame.y, width, maxHeight: Math.max(MENU_ROW, below) };
  }
  const height = Math.min(wanted, above);
  return { left, top: frame.y + frame.height - height, width, maxHeight: height };
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
  const window = useWindowDimensions();
  const pill = useRef<View>(null);
  // Android, in a form: the date and time pills take the field chrome (docs/android-polish.md §4).
  const pillChrome = androidPill(theme, useContext(FieldGroupContext));
  const [open, setOpenState] = useState(false);
  const [frame, setFrame] = useState<MenuFrame | null>(null);
  // Opening measures the pill, so the popover can grow out from under it as iOS 26's does.
  const setOpen = (next: boolean) => {
    setOpenState(next);
    if (!next) setFrame(null);
    else pill.current?.measureInWindow?.((x, y, width, height) => setFrame({ x, y, width, height }));
  };
  const popover = frame ? datePopoverPlacement(frame, window.width, window.height, includeTime) : null;
  const clamp = (next: number) => (minimum !== undefined && next < minimum ? minimum : next);
  const wall = wallParts(value, zone);
  const setTime = (hour: number, minute: number) => {
    const at = zonedInstant(momentDay(value, zone), hour, minute, zone);
    if (at !== null) onChange(clamp(at));
  };
  // The compact `DatePicker`'s two pills, in the device locale (SHARED-REQUESTS "DateField").
  const dateText = mediumDate(value, zone);
  const timeText = shortTimeIn(value, zone);
  return (
    // The phone is 18dp narrower than the 402pt iPhone, so the pills sit 6 apart rather than 8 to keep
    // the label on one line where it fits; where it does not, it wraps, as SwiftUI's label would.
    <View style={[styles.inline, styles.dateRow, disabled && styles.dimmed]}>
      <Text style={[textStyles.body, styles.grow, { color: theme.colors.label }]}>{label}</Text>
      <Pressable
        collapsable={false}
        ref={pill}
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${dateText}${includeTime ? `, ${timeText}` : ''}`}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={[styles.datePill, { backgroundColor: withAlpha('#767680', 0.12) }, pillChrome]}
        testID={testID}
      >
        <Text style={[textStyles.body, { color: theme.colors.label }]}>{dateText}</Text>
      </Pressable>
      {includeTime ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`${label} time, ${timeText}`} disabled={disabled} onPress={() => setOpen(true)} style={[styles.datePill, { backgroundColor: withAlpha('#767680', 0.12) }, pillChrome]} testID={`${testID}-time`}>
          <Text style={[textStyles.body, { color: theme.colors.label }]}>{timeText}</Text>
        </Pressable>
      ) : null}
      {/* iOS 26's compact `DatePicker` opens a glass popover under the pill, with NO dimming
          (`moment-create-date-picker`). Tapping outside closes it; "Done" stays for the time wheels. */}
      <Modal animationType="fade" onRequestClose={() => setOpen(false)} transparent visible={open}>
        <Pressable onPress={() => setOpen(false)} style={styles.fill}>
          <Pressable
            style={[
              styles.datePopover,
              popover ?? { opacity: 0 },
              { backgroundColor: theme.scheme === 'dark' ? 'rgba(44, 44, 46, 0.97)' : 'rgba(255, 255, 255, 0.96)', shadowColor: '#000000' },
            ]}
          >
            <MonthCalendar
              system
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
            {includeTime ? (
              <Pressable accessibilityRole="button" onPress={() => setOpen(false)} style={styles.menuRow} testID={`${testID}-done`}>
                <Text style={[textStyles.body, { color: theme.colors.link }]}>Done</Text>
              </Pressable>
            ) : null}
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
          <Text style={[textStyles.body, { color: index === selected ? theme.colors.link : theme.colors.ink }]}>{String(index).padStart(2, '0')}</Text>
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
        {/* A `DisclosureGroup`'s title takes the tint and its chevron the primary colour (`review-wish-*`). */}
        <Text style={[textStyles.body, styles.grow, { color: theme.colors.link }]}>{title}</Text>
        <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={17} color={theme.colors.label} />
      </Pressable>
      {open ? <View style={styles.disclosureBody}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // The first header's text sits 31pt below the bar on iOS 26 (`moment-create-dark`,
  // `moments-settings`); the section's own header margin supplies most of that.
  form: { paddingTop: 3, paddingBottom: 60 },
  section: { marginBottom: 0 },
  headerless: { marginTop: 24 },
  sectionBody: { marginHorizontal: 16, borderRadius: 26, overflow: 'hidden', marginTop: 8 },
  row: { minHeight: 56, paddingHorizontal: 16, paddingVertical: 12, justifyContent: 'center', gap: 10 },
  header: { ...textStyles.body, marginHorizontal: 32, marginTop: 16 },
  // Android: 20 above the label; `sectionBody`'s 8 is the label-to-group gap.
  androidHeader: { marginTop: 20 },
  // Android: the menu choice's field pill; 36 tall with 12 inside, like a chip.
  menuPill: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36, paddingHorizontal: 12 },
  footer: { ...textStyles.subheadline, marginHorizontal: 32, marginTop: 10, marginBottom: 12 },
  // A row of text in a `VStack` card is its line height, not a 32pt control; a `FormRow` still
  // enforces its own 56 (`moment-manage-details`: 54pt from row to row, 14pt spacing).
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 24 },
  separator: { position: 'absolute', right: 0, bottom: 0, height: StyleSheet.hairlineWidth * 2 },
  grow: { flex: 1 },
  value: { flexShrink: 1 },
  dimmed: { opacity: 0.4 },
  input: { ...textStyles.body, lineHeight: undefined, paddingVertical: 4, minHeight: 32, backgroundColor: 'transparent' },
  menuButton: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingHorizontal: 8 },
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', padding: 24 },
  fill: { flex: 1 },
  dialog: { borderRadius: 16, paddingVertical: 8, maxHeight: '80%' },
  menu: { position: 'absolute', borderRadius: 26, paddingVertical: MENU_PADDING, elevation: 12, shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: 8 } },
  menuCheck: { width: 24, alignItems: 'center' },
  menuRowPlain: { paddingLeft: 20 },
  calendarMenu: { paddingHorizontal: 12 },
  datePopover: { position: 'absolute', borderRadius: 26, paddingHorizontal: 12, paddingVertical: 10, elevation: 12, shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: 8 } },
  menuRow: { flexDirection: 'row', alignItems: 'center', paddingLeft: 14, paddingRight: 18, minHeight: MENU_ROW, gap: 8 },
  // The compact `DatePicker`'s value is a capsule on iOS 26.
  datePill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  dateRow: { gap: 6 },
  wheels: { flexDirection: 'row', gap: 12, height: 180, marginTop: 8 },
  wheel: { flex: 1 },
  wheelRow: { minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  disclosure: { gap: 12 },
  disclosureBody: { gap: 12 },
});
