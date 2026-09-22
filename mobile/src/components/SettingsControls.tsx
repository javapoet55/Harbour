import { Children, Fragment, isValidElement, useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { formatClock, parseClock } from '../lib/profileSettings';
import { androidField, androidGroup, androidLabel, androidSeparator, brand, isAndroid, useTheme } from '../theme';
import { IOSSwitch } from './IOSSwitch';
import { SegmentRow } from './SegmentRow';
import { withAlpha } from './SignInBackdrop';
import { TaskSymbol } from './TaskSymbol';
import { Text } from './Text';

/**
 * The controls `ProfileSettingsView` is built from (ios/App/ProfileView.swift): `card(_:content:)`
 * (`:274-276`), `field(_:text:placeholder:)` (`:277-279`), `hours(_:start:end:)` (`:293-295`) and the
 * SwiftUI `Picker`, `Toggle` and `Slider` it uses directly.
 *
 * They are components here so each can be render-tested on its own.
 */

/**
 * `card(_:content:)` + `profileCard()` (ProfileView.swift:119-123, :274-276).
 *
 * Android (docs/android-polish.md §5): the card is the shared form group — field surface and a 1px
 * hairline — and a 1px separator sits between two adjacent rows (toggle, picker, labelled value), so
 * a run of toggles does not float. A spot that already has a `SettingsDivider` gets no second line.
 */
export function SettingsCard({ title, children, testID }: { title: string; children: React.ReactNode; testID?: string }) {
  const theme = useTheme();
  return (
    <View
      style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: withAlpha(brand.nexdoIndigo, 0.13) }, androidGroup(theme)]}
      testID={testID}
    >
      {/* `Text(title).font(.headline)` (ProfileView.swift:281) carries no `.foregroundStyle`. */}
      <Text style={[styles.headline, { color: theme.colors.label }]}>{title}</Text>
      {isAndroid() ? separateRows(children, testID) : children}
    </View>
  );
}

/** The one-line controls that read as rows of a list, and so take a separator between them. */
const ROW_TYPES: unknown[] = [SettingsToggle, SettingsPicker, SettingsLabeledValue];

/** `children` with a `SettingsDivider` between each two adjacent rows (Android only). */
function separateRows(children: ReactNode, testID?: string): ReactNode {
  const items = Children.toArray(children);
  return items.map((child, index) => {
    const previous = items[index - 1];
    const needsLine = isValidElement(child) && isValidElement(previous) && ROW_TYPES.includes(child.type) && ROW_TYPES.includes(previous.type);
    return needsLine ? (
      <Fragment key={isValidElement(child) ? child.key : index}>
        <SettingsDivider testID={testID ? `${testID}-separator` : undefined} />
        {child}
      </Fragment>
    ) : (
      child
    );
  });
}

/** The grey caption under most cards: `.font(.caption).foregroundStyle(Color.nexdoSecondary)`. */
export function SettingsCaption({ children, testID }: { children: string; testID?: string }) {
  const theme = useTheme();
  return (
    <Text style={[styles.caption, { color: theme.colors.secondary }]} testID={testID}>
      {children}
    </Text>
  );
}

/** `field(_:text:placeholder:)` (ProfileView.swift:277-279). */
export function SettingsField({
  title,
  value,
  onChangeText,
  testID,
}: {
  title: string;
  value: string;
  onChangeText: (next: string) => void;
  testID?: string;
}) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.fieldGroup}>
      {/* Android: the shared field label (docs/android-polish.md §4, §5). */}
      <Text style={[styles.subheadline, { color: theme.colors.label }, androidLabel(theme)]}>{title}</Text>
      {/* `.textInputAutocapitalization(.words)` for "Display name", `.autocorrectionDisabled()`. */}
      <TextInput
        accessibilityLabel={title}
        autoCapitalize={title === 'Display name' ? 'words' : 'none'}
        autoCorrect={false}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          styles.input,
          {
            color: theme.colors.ink,
            backgroundColor: withAlpha(brand.nexdoIndigo, 0.035),
            borderColor: withAlpha(brand.nexdoIndigo, 0.16),
          },
          // Android: a field inside the card's group, one step above it; accent while focused.
          androidField(theme, focused, { inGroup: true, padded: false }),
        ]}
        testID={testID}
        value={value}
      />
    </View>
  );
}

/** `LabeledContent(_:value:)` (ProfileView.swift:195): a read-only label and value on one row. */
export function SettingsLabeledValue({ label, value, testID }: { label: string; value: string; testID?: string }) {
  const theme = useTheme();
  return (
    <View style={styles.row} testID={testID}>
      <Text style={[theme.typography.body, { color: theme.colors.label }, isAndroid() && styles.androidRowLabel]}>{label}</Text>
      {isAndroid() ? null : <View style={styles.grow} />}
      <Text
        numberOfLines={isAndroid() ? 1 : undefined}
        style={[theme.typography.body, { color: theme.colors.secondaryLabel }, isAndroid() && styles.androidRowValue]}
      >
        {value}
      </Text>
    </View>
  );
}

/** `Toggle(_:isOn:)`. */
export function SettingsToggle({
  label,
  value,
  onValueChange,
  testID,
}: {
  label: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <Text style={[theme.typography.body, styles.grow, { color: theme.colors.label }, isAndroid() && styles.androidRowLabel]}>{label}</Text>
      <IOSSwitch
        accessibilityLabel={label}
        onValueChange={onValueChange}
        testID={testID}
        value={value}
      />
    </View>
  );
}

/** `.pickerStyle(.segmented)` (ProfileView.swift:152), used only by Appearance. */
export function SettingsSegments<T extends string>({
  label,
  options,
  value,
  onChange,
  testIDPrefix,
}: {
  label: string;
  options: readonly { value: T; title: string }[];
  value: T;
  onChange: (next: T) => void;
  testIDPrefix: string;
}) {
  const theme = useTheme();
  // Android (docs/android-polish.md §9): the shared `SegmentRow` sizes each segment to its label; the
  // selected one keeps its accent tint (§5, §7).
  if (isAndroid()) {
    return (
      <SegmentRow
        labels={options.map((option) => option.title)}
        selected={options.findIndex((option) => option.value === value)}
        base={{ fontSize: styles.subheadline.fontSize, lineHeight: styles.subheadline.lineHeight }}
        labelStyle={styles.androidSelectedSegment}
        gap={0}
        inset={2}
        style={[styles.segments, { backgroundColor: theme.colors.segmentTrack }]}
        testID={`${testIDPrefix}-row`}
        renderSegment={(index, fit, segmentStyle) => {
          const option = options[index];
          const selected = option.value === value;
          return (
            <Pressable
              accessibilityLabel={option.title}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onChange(option.value)}
              style={[
                styles.androidSegment,
                segmentStyle,
                selected ? { backgroundColor: theme.colors.accentTint, borderWidth: 1, borderColor: theme.colors.accentBorder } : null,
              ]}
              testID={`${testIDPrefix}-${option.value}`}
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.subheadline,
                  { fontSize: fit.fontSize, lineHeight: fit.lineHeight, color: selected ? theme.colors.accent : theme.colors.label },
                  selected ? styles.androidSelectedSegment : null,
                ]}
              >
                {option.title}
              </Text>
            </Pressable>
          );
        }}
      />
    );
  }
  return (
    // `.pickerStyle(.segmented)` (ProfileView.swift:154): a translucent track carrying a raised,
    // light capsule with a label-coloured title — not a tint-filled segment with white text. This is
    // the fault PARITY global fix 5 closed for the Tasks picker; Appearance never got it, so
    // Day/Night/System rendered as an indigo block.
    <View accessibilityLabel={label} style={[styles.segments, { backgroundColor: theme.colors.segmentTrack }]}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            accessibilityLabel={option.title}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[
              styles.segment,
              selected ? { backgroundColor: theme.colors.segmentSelected } : null,
              // Android: the selected segment in the accent tint, so it is plainly the chosen one.
              selected && isAndroid() ? { backgroundColor: theme.colors.accentTint, borderWidth: 1, borderColor: theme.colors.accentBorder } : null,
            ]}
            testID={`${testIDPrefix}-${option.value}`}
          >
            <Text style={[styles.subheadline, { color: theme.colors.label }, selected && isAndroid() ? styles.androidSelectedSegment : null, selected && isAndroid() ? { color: theme.colors.accent } : null]}>
              {option.title}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * A SwiftUI `Picker` in its default and `.menu` styles: the label on the left, the current choice on
 * the right, and a list of choices on tap.
 */
export function SettingsPicker<T extends string | number>({
  label,
  options,
  value,
  onChange,
  testID,
}: {
  label: string;
  options: readonly { value: T; title: string }[];
  value: T;
  onChange: (next: T) => void;
  testID: string;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const current = options.find((option) => option.value === value);

  return (
    <>
      <Pressable
        accessibilityHint="Opens the choices"
        accessibilityLabel={`${label}, ${current?.title ?? ''}`}
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={styles.row}
        testID={testID}
      >
        {/* Android (docs/android-polish.md §5): the label keeps at least 40% of the row and wraps by
            word; the value takes one line and ellipsises. Before, the value kept its full width and
            the label collapsed to a letter per line ("AI / co / nfi / rm…"). */}
        <Text style={[theme.typography.body, styles.grow, { color: theme.colors.ink }, isAndroid() && styles.androidRowLabel]}>{label}</Text>
        <Text
          numberOfLines={isAndroid() ? 1 : undefined}
          style={[theme.typography.body, { color: theme.colors.link }, isAndroid() && styles.androidRowValue]}
          testID={`${testID}-value`}
        >
          {current?.title ?? ''}
        </Text>
        <TaskSymbol color={theme.colors.link} name="chevron.up.chevron.down" size={13} />
      </Pressable>

      <Modal animationType="fade" onRequestClose={() => setOpen(false)} transparent visible={open}>
        <Pressable onPress={() => setOpen(false)} style={styles.scrim}>
          <View style={[styles.menu, { backgroundColor: theme.colors.surface }]}>
            <Text style={[styles.headline, styles.menuTitle, { color: theme.colors.ink }]}>{label}</Text>
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
                <Text style={[theme.typography.body, styles.grow, { color: theme.colors.ink }]}>{option.title}</Text>
                {option.value === value ? <TaskSymbol color={theme.colors.link} name="checkmark" size={17} /> : null}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

/**
 * `hours(_:start:end:)` (ProfileView.swift:293-295): a subheadline title over two compact
 * `DatePicker`s limited to `.hourAndMinute`.
 */
export function SettingsHours({
  title,
  start,
  end,
  onChangeStart,
  onChangeEnd,
  testIDPrefix,
}: {
  title: string;
  start: string;
  end: string;
  onChangeStart: (next: string) => void;
  onChangeEnd: (next: string) => void;
  testIDPrefix: string;
}) {
  const theme = useTheme();
  return (
    <View style={styles.fieldGroup}>
      <Text style={[styles.subheadline, { color: theme.colors.ink }, androidLabel(theme)]}>{title}</Text>
      <View style={styles.hoursRow}>
        <ClockField label="Start" onChange={onChangeStart} testID={`${testIDPrefix}-start`} value={start} />
        <ClockField label="End" onChange={onChangeEnd} testID={`${testIDPrefix}-end`} value={end} />
      </View>
    </View>
  );
}

/**
 * One compact `DatePicker(_, displayedComponents: .hourAndMinute)`.
 *
 * Hand-built for the same reason `MonthCalendar` is: `@react-native-community/datetimepicker` would
 * force its own presentation (an Android dialog) rather than the compact field-plus-wheel SwiftUI
 * shows, and this phase already needs a rebuild for three other native modules. Hours and minutes are
 * two scrollable columns, so every minute Swift allows is reachable.
 */
export function ClockField({
  label,
  value,
  onChange,
  testID,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  testID: string;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const { hour, minute } = parseClock(value);

  return (
    <View style={styles.clockGroup}>
      <Text style={[styles.caption, { color: theme.colors.secondary }, androidLabel(theme)]}>{label}</Text>
      <Pressable
        accessibilityLabel={`${label}, ${value}`}
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={[
          styles.clockField,
          { backgroundColor: withAlpha(brand.nexdoIndigo, 0.035), borderColor: withAlpha(brand.nexdoIndigo, 0.16) },
          // Android: a field inside the card's group; it keeps its own width and padding.
          androidField(theme, false, { inGroup: true, padded: false }),
        ]}
        testID={testID}
      >
        <Text style={[theme.typography.body, { color: theme.colors.ink }]}>{value}</Text>
      </Pressable>

      <Modal animationType="fade" onRequestClose={() => setOpen(false)} transparent visible={open}>
        <Pressable onPress={() => setOpen(false)} style={styles.scrim}>
          <View style={[styles.menu, { backgroundColor: theme.colors.surface }]}>
            <Text style={[styles.headline, styles.menuTitle, { color: theme.colors.ink }]}>{label}</Text>
            <View style={styles.wheels}>
              <Wheel
                count={24}
                onSelect={(next) => onChange(formatClock(next, minute))}
                selected={hour}
                testIDPrefix={`${testID}-hour`}
              />
              <Wheel
                count={60}
                onSelect={(next) => onChange(formatClock(hour, next))}
                selected={minute}
                testIDPrefix={`${testID}-minute`}
              />
            </View>
            <Pressable accessibilityRole="button" onPress={() => setOpen(false)} style={styles.menuRow} testID={`${testID}-done`}>
              <Text style={[theme.typography.body, { color: theme.colors.link }]}>Done</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function Wheel({
  count,
  selected,
  onSelect,
  testIDPrefix,
}: {
  count: number;
  selected: number;
  onSelect: (next: number) => void;
  testIDPrefix: string;
}) {
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
          <Text style={[theme.typography.body, { color: index === selected ? theme.colors.link : theme.colors.ink }]}>
            {String(index).padStart(2, '0')}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

/**
 * `Slider(value:in:step:)` with `minimumValueLabel` and `maximumValueLabel`
 * (ProfileView.swift:145-153 of the App Voice card).
 *
 * Hand-built rather than `@react-native-community/slider`: React Native's core has no Slider, and the
 * one setting this drives — spoken-reply volume — is inert until Phase 9 adds speech, so a fourth
 * native module is not worth the build. The step, the range and the accessibility value are Swift's.
 */
export function SettingsSlider({
  label,
  value,
  step,
  onChange,
  testID,
}: {
  label: string;
  value: number;
  step: number;
  onChange: (next: number) => void;
  testID: string;
}) {
  const theme = useTheme();
  const width = useRef(0);

  const commit = (x: number) => {
    if (width.current <= 0) return;
    const ratio = Math.min(Math.max(x / width.current, 0), 1);
    const stepped = Math.round(ratio / step) * step;
    // Steps of 0.05 accumulate floating-point error; round to the step's own precision.
    onChange(Number(stepped.toFixed(4)));
  };

  const percent = Math.round(value * 100);

  return (
    <View style={styles.sliderRow}>
      <TaskSymbol color={theme.colors.label} name="speaker.fill" size={17} />
      <View
        accessibilityLabel={label}
        accessibilityRole="adjustable"
        accessibilityValue={{ text: `${percent} percent` }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(event) => {
          const delta = event.nativeEvent.actionName === 'increment' ? step : -step;
          onChange(Number(Math.min(Math.max(value + delta, 0), 1).toFixed(4)));
        }}
        onLayout={(event) => {
          width.current = event.nativeEvent.layout.width;
        }}
        onResponderGrant={(event) => commit(event.nativeEvent.locationX)}
        onResponderMove={(event) => commit(event.nativeEvent.locationX)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        style={styles.sliderTrackArea}
        testID={testID}
      >
        <View style={[styles.sliderTrack, { backgroundColor: theme.colors.separator }]}>
          <View style={[styles.sliderFill, { width: `${percent}%`, backgroundColor: theme.colors.tint }]} />
        </View>
        <View style={[styles.sliderThumb, { left: `${percent}%` }]} />
      </View>
      <TaskSymbol color={theme.colors.label} name="speaker.wave.3.fill" size={17} />
    </View>
  );
}

/** `Divider()`. Android: the shared 1px form separator. */
export function SettingsDivider({ testID }: { testID?: string } = {}) {
  const theme = useTheme();
  return <View style={[styles.divider, { backgroundColor: theme.colors.separator }, androidSeparator(theme)]} testID={testID} />;
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  subheadline: { fontSize: 15, lineHeight: 21 },
  caption: { fontSize: 12, lineHeight: 16 },

  // `.padding(18)` with corner radius 20 and the indigo hairline from `profileCard()`.
  card: { gap: 16, padding: 18, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32 },
  // Android: a row's label keeps at least 40% of the row and wraps by word; its value gives way.
  androidRowLabel: { flex: 1, flexShrink: 1, minWidth: '40%' },
  androidRowValue: { flexShrink: 1, textAlign: 'right' },
  androidSelectedSegment: { fontWeight: '600' },
  fieldGroup: { gap: 8 },
  input: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 12, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, fontSize: 17 },

  segments: { flexDirection: 'row', borderRadius: 9, padding: 2 },
  segment: { flex: 1, minHeight: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 7 },
  // Android: sized by `SegmentRow`, so no `flex: 1` share of the row.
  androidSegment: { minHeight: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 7 },

  scrim: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.35)' },
  menu: { borderRadius: 18, paddingVertical: 8, maxHeight: '75%' },
  menuTitle: { paddingHorizontal: 16, paddingVertical: 8 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingHorizontal: 16 },

  hoursRow: { flexDirection: 'row', gap: 12 },
  clockGroup: { flex: 1, gap: 4 },
  clockField: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth },
  wheels: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, height: 220 },
  wheel: { flex: 1 },
  wheelRow: { minHeight: 40, justifyContent: 'center', alignItems: 'center' },

  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sliderTrackArea: { flex: 1, height: 36, justifyContent: 'center' },
  sliderTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
  sliderFill: { height: 4, borderRadius: 2 },
  // A system `Slider`'s thumb is white in both appearance modes, with a soft shadow.
  sliderThumb: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    marginLeft: -11,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },

  divider: { height: StyleSheet.hairlineWidth },
});
