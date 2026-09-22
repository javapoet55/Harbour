import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type ViewStyle } from 'react-native';

import {
  androidCard,
  androidField,
  androidSecondaryButton,
  androidSecondaryLabel,
  androidLabel,
  brand,
  isAndroid,
  useTheme,
} from '../theme';
import { TaskSymbol } from './TaskSymbol';
import { Text } from './Text';

/**
 * The building blocks of `TaskDetailsView` (ios/App/TaskDetailsView.swift). `field`, `sectionLabel`,
 * `menu`, `menuLabel`, `DetailInput`, `DetailOutlineButton` and `DetailCheckboxStyle` are all private
 * helpers on that view or in that file; they are components here so each can be render-tested.
 */

/**
 * `sectionLabel` (TaskDetailsView.swift:266-268): `.caption.weight(.bold)`, secondary. Android tracks
 * it out (docs/android-polish.md §2).
 */
export function SectionLabel({ title }: { title: string }) {
  const theme = useTheme();
  return (
    <Text accessibilityRole="header" style={[styles.sectionLabel, { color: theme.colors.secondary }, androidLabel(theme)]}>
      {title}
    </Text>
  );
}

/** `field(_:content:)` (TaskDetailsView.swift:269-271): a label and its control, 8pt apart. */
export function DetailField({ title, children, style }: { title: string; children: React.ReactNode; style?: object }) {
  return (
    <View style={[styles.field, style]}>
      <SectionLabel title={title} />
      {children}
    </View>
  );
}

/**
 * `DetailInput` (TaskDetailsView.swift:288-295): the 13pt rounded input surface. On Android it is the
 * shared field look instead — a hairline one step above the page, accent when focused
 * (docs/android-polish.md §2).
 */
export function detailInputStyle(theme: ReturnType<typeof useTheme>, focused = false): ViewStyle {
  return {
    paddingHorizontal: 14,
    paddingVertical: 11,
    minHeight: 44,
    borderRadius: 13,
    backgroundColor: theme.colors.background,
    borderWidth: focused ? 2 : StyleSheet.hairlineWidth,
    borderColor: focused ? brand.nexdoBlue : withAlpha(brand.nexdoIndigo, 0.16),
    ...androidField(theme, focused),
  };
}

/**
 * `menuLabel(_:)` (TaskDetailsView.swift:282-285) over a `Menu` (`:272-281`).
 *
 * SwiftUI `Menu` has no React Native equivalent, so the options open as an inline list under the
 * label — the same substitution the projects screens make.
 */
export function DetailMenu({
  label,
  value,
  options,
  display,
  onSelect,
  testID,
  accessibilityLabel,
  children,
}: {
  label: string;
  value: string;
  options: string[];
  display: (option: string) => string;
  onSelect: (option: string) => void;
  testID?: string;
  accessibilityLabel: string;
  /** Extra rows under the options, for the estimate menu's Less/More control group. */
  children?: React.ReactNode;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  // `Set(options + [value]).sorted()` — a value outside the list still appears.
  const all = [...new Set([...options, value])].sort();

  return (
    <View style={styles.menuWrapper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={{ text: display(value) }}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((next) => !next)}
        testID={testID}
        style={detailInputStyle(theme)}
      >
        <View style={styles.menuLabelRow}>
          <Text style={[theme.typography.body, { color: theme.colors.ink }]}>{display(value)}</Text>
          <View style={styles.grow} />
          <TaskSymbol name="chevron.down" size={13} color={theme.colors.secondary} />
        </View>
      </Pressable>

      {open ? (
        <View
          style={[
            styles.menu,
            { backgroundColor: theme.colors.surface, borderColor: withAlpha(brand.nexdoIndigo, 0.16) },
            isAndroid() && { backgroundColor: theme.colors.fieldSurface, borderColor: theme.colors.fieldBorder, borderWidth: 1, borderRadius: 12 },
          ]}
        >
          {all.map((option) => (
            <Pressable
              key={option}
              accessibilityRole="button"
              accessibilityLabel={display(option)}
              accessibilityState={{ selected: option === value }}
              onPress={() => {
                onSelect(option);
                setOpen(false);
              }}
              testID={testID ? `${testID}-${option}` : undefined}
              style={styles.menuRow}
            >
              <Text style={[theme.typography.body, styles.grow, { color: theme.colors.ink }]}>{display(option)}</Text>
              {option === value ? <Text style={[theme.typography.body, { color: theme.colors.link }]}>✓</Text> : null}
            </Pressable>
          ))}
          {children}
        </View>
      ) : null}
    </View>
  );
}

/** `DetailOutlineButton` (TaskDetailsView.swift:297-321). */
export function DetailOutlineButton({
  title,
  onPress,
  disabled = false,
  greenBackground = false,
  testID,
  accessibilityLabel,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  greenBackground?: boolean;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const theme = useTheme();
  const body = (
    <Text style={[styles.outlineLabel, { color: greenBackground ? '#FFFFFF' : theme.colors.ink }, !greenBackground && androidSecondaryLabel(theme)]}>
      {title}
    </Text>
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      // `.opacity(!isEnabled ? 0.45 : 1)`
      style={[styles.outlineWrapper, disabled && styles.dimmed]}
    >
      {greenBackground ? (
        // `LinearGradient([rgb(0.04,0.43,0.26), rgb(0.02,0.32,0.23)], leading → trailing)`
        <LinearGradient colors={['#0A6E42', '#05523B']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.outlineButton}>
          {body}
        </LinearGradient>
      ) : (
        // Android: outlined in the accent so it reads as tappable, not as another input.
        <View
          style={[
            styles.outlineButton,
            { backgroundColor: theme.colors.background, borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(brand.nexdoIndigo, 0.16) },
            androidSecondaryButton(theme),
          ]}
          testID={testID ? `${testID}-surface` : undefined}
        >
          {body}
        </View>
      )}
    </Pressable>
  );
}

/**
 * `DetailCheckboxStyle` (TaskDetailsView.swift:343-353): a checkbox square beside a two-line label, in
 * a 17pt card. Not a `Switch` — Swift replaces the toggle's appearance entirely.
 */
export function DetailCheckbox({
  title,
  subtitle,
  value,
  onChange,
  testID,
}: {
  title: string;
  subtitle: string;
  value: boolean;
  onChange: (next: boolean) => void;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      // `.accessibilityRepresentation { Toggle(...) }` — it reads as a switch, not a button.
      accessibilityRole="switch"
      accessibilityLabel={title}
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      testID={testID}
      style={[styles.checkbox, { backgroundColor: theme.colors.background, borderColor: withAlpha(brand.nexdoIndigo, 0.16) }, androidCard(theme)]}
    >
      <TaskSymbol
        name={value ? 'checkmark.square.fill' : 'square'}
        size={22}
        color={value ? theme.colors.link : theme.colors.secondary}
      />
      <View style={styles.grow}>
        <Text style={[styles.checkboxTitle, { color: theme.colors.ink }]}>{title}</Text>
        <Text style={[styles.caption, { color: theme.colors.secondary }]}>{subtitle}</Text>
      </View>
    </Pressable>
  );
}

/** A plain text input wearing `DetailInput`. */
export function DetailTextInput({
  value,
  onChangeText,
  placeholder,
  accessibilityLabel,
  multiline = false,
  testID,
}: {
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
  accessibilityLabel: string;
  multiline?: boolean;
  testID?: string;
}) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      accessibilityLabel={accessibilityLabel}
      placeholder={placeholder}
      placeholderTextColor={theme.colors.secondary}
      value={value}
      onChangeText={onChangeText}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      multiline={multiline}
      style={[
        theme.typography.body,
        detailInputStyle(theme, focused),
        { color: theme.colors.ink },
        multiline && styles.multiline,
      ]}
      testID={testID}
    />
  );
}

export function withAlpha(color: string, alpha: number): string {
  if (color.startsWith('rgba')) return color.replace(/[\d.]+\)$/, `${alpha})`);
  const hex = color.replace('#', '');
  const value = hex.length === 3 ? hex.split('').map((part) => part + part).join('') : hex;
  const int = parseInt(value, 16);
  return `rgba(${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}, ${alpha})`;
}

const styles = StyleSheet.create({
  sectionLabel: { fontSize: 12, lineHeight: 16, fontWeight: '700' },
  field: { gap: 8, flex: 1 },
  menuWrapper: { gap: 6 },
  menuLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  menu: { borderRadius: 13, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  menuRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingHorizontal: 14 },
  grow: { flex: 1 },
  // `.frame(maxWidth: .infinity)` (TaskDetailsView.swift:304). NOT `width: '100%'`: a percentage
  // width resolves against the parent and does not take part in flex negotiation, so in the "Add a
  // step" ROW the button demanded the whole row and collapsed the `flex: 1` input beside it to a
  // sliver. `alignSelf: 'stretch'` is what the modifier actually means — full width in a column, and
  // intrinsic width in a row, which is how Swift lays both out. See style map section 4.
  outlineWrapper: { alignSelf: 'stretch' },
  dimmed: { opacity: 0.45 },
  outlineButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, borderRadius: 13 },
  outlineLabel: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  // `.padding(16).frame(minHeight: 58)`, corner radius 17.
  checkbox: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, minHeight: 58, borderRadius: 17, borderWidth: StyleSheet.hairlineWidth },
  checkboxTitle: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  caption: { fontSize: 12, lineHeight: 16 },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
});
