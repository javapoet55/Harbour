import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { Text } from './Text';

/**
 * Android's segmented tab rows (docs/android-polish.md §9): Manage Moment's Details / Contacts / Wish
 * Message / Schedule, the Moments segments, Calendar's Schedule / Week / Month, Settings' Appearance,
 * Tasks / Projects and the clarify card's mode.
 *
 * Every label in a row is drawn at ONE size — no per-tab auto-shrink — and each segment is as wide as
 * its label plus 12 each side, sharing out any room left over. When the row does not fit at the base
 * size, all the labels drop one type step together; when it still does not fit, the row scrolls
 * sideways and keeps the selected segment in view.
 *
 * Layout only: the caller draws each segment (its pill, gradient, colours) through `renderSegment`,
 * with the size this row picked. iOS does not use this; its controls keep Swift's equal widths.
 */

/** The type scale, smallest first: a "step" is one entry. */
const TYPE_STEPS = [11, 12, 13, 15, 17, 20, 22, 28, 34] as const;

/** One step down the type scale from `size` (or `size` itself at the bottom). */
export function stepDown(size: number): number {
  const smaller = TYPE_STEPS.filter((step) => step < size);
  return smaller.length > 0 ? smaller[smaller.length - 1] : size;
}

/** Each segment's padding either side of its label. */
export const SEGMENT_LABEL_PADDING = 12;

export type SegmentFit = { fontSize: number; lineHeight: number; scroll: boolean };

/**
 * The size and mode for a row whose labels measure `natural` (px, at `base.fontSize`) in a container
 * `available` wide, with `gap` between segments and `inset` inside the container on each side.
 * Text width scales with the font size, so the smaller step's widths are the base ones scaled down.
 */
export function fitSegments(
  natural: readonly number[],
  available: number,
  base: { fontSize: number; lineHeight: number },
  gap: number,
  inset: number,
): SegmentFit {
  const at = (fontSize: number) => ({ fontSize, lineHeight: Math.round((base.lineHeight * fontSize) / base.fontSize) });
  if (available <= 0 || natural.length === 0 || natural.some((width) => width <= 0)) return { ...at(base.fontSize), scroll: false };
  const needed = (fontSize: number) =>
    natural.reduce((sum, width) => sum + (width * fontSize) / base.fontSize + SEGMENT_LABEL_PADDING * 2, 0) + gap * (natural.length - 1) + inset * 2;
  if (needed(base.fontSize) <= available) return { ...at(base.fontSize), scroll: false };
  const smaller = stepDown(base.fontSize);
  return { ...at(smaller), scroll: needed(smaller) > available };
}

export function SegmentRow({
  labels,
  selected,
  base,
  labelStyle,
  gap,
  inset,
  style,
  renderSegment,
  testID,
}: {
  labels: readonly string[];
  /** Index of the selected segment, kept in view when the row scrolls. */
  selected: number;
  base: { fontSize: number; lineHeight: number };
  /** The label's weight and family, so the measure matches what is drawn. */
  labelStyle?: StyleProp<TextStyle>;
  /** The gap between segments and the container's own padding, as the caller's `style` sets them. */
  gap: number;
  inset: number;
  /** The container: its background, radius, padding and gap. */
  style?: StyleProp<ViewStyle>;
  /** Draws segment `index`; spread `segmentStyle` (its 12 of padding) onto the segment's own view. */
  renderSegment: (index: number, fit: SegmentFit, segmentStyle: ViewStyle) => ReactNode;
  testID?: string;
}) {
  const [available, setAvailable] = useState(0);
  const [natural, setNatural] = useState<number[]>(() => labels.map(() => 0));
  const fit = fitSegments(natural, available, base, gap, inset);
  const scroller = useRef<ScrollView>(null);
  const offsets = useRef<{ x: number; width: number }[]>([]);

  // Keep the selected segment in view once the row scrolls.
  useEffect(() => {
    if (!fit.scroll) return;
    const target = offsets.current[selected];
    if (target) scroller.current?.scrollTo?.({ x: Math.max(0, target.x - inset), animated: true });
  }, [fit.scroll, selected, inset]);

  // A segment is its label's width plus the padding; in a row that fits, the spare room is shared out
  // (`flexGrow` on the box, which is the row's flex child). The caller's view fills its box.
  const segmentStyle: ViewStyle = { paddingHorizontal: SEGMENT_LABEL_PADDING, alignSelf: 'stretch' };
  const boxStyle: ViewStyle = { flexGrow: fit.scroll ? 0 : 1, flexShrink: 0, flexBasis: 'auto' };
  const segments = labels.map((label, index) => (
    <View
      key={label}
      testID={testID ? `${testID}-segment-${index}` : undefined}
      onLayout={(event) => {
        offsets.current[index] = { x: event.nativeEvent.layout.x, width: event.nativeEvent.layout.width };
        if (fit.scroll && index === selected) scroller.current?.scrollTo?.({ x: Math.max(0, event.nativeEvent.layout.x - inset), animated: false });
      }}
      style={boxStyle}
    >
      {renderSegment(index, fit, segmentStyle)}
    </View>
  ));

  return (
    <View
      onLayout={(event) => setAvailable(event.nativeEvent.layout.width)}
      style={fit.scroll ? styles.scrollFrame : [style, styles.row, { gap, padding: inset }]}
      testID={testID}
    >
      {fit.scroll ? (
        <ScrollView
          ref={scroller}
          horizontal
          showsHorizontalScrollIndicator={false}
          // The container's look on the viewport; its gap and padding move onto the scrolled content.
          style={[style, styles.noPadding]}
          contentContainerStyle={[styles.row, { gap, padding: inset }]}
          testID={testID ? `${testID}-scroll` : undefined}
        >
          {segments}
        </ScrollView>
      ) : (
        segments
      )}
      {/* The labels at the base size, laid out off to the side at any width, to measure them. */}
      <View pointerEvents="none" style={styles.measure} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {labels.map((label, index) => (
          <Text
            key={label}
            numberOfLines={1}
            onLayout={(event) => {
              const width = event.nativeEvent.layout.width;
              setNatural((current) => (current[index] === width ? current : current.map((value, at) => (at === index ? width : value))));
            }}
            style={[labelStyle, { fontSize: base.fontSize, lineHeight: base.lineHeight }, styles.natural]}
            testID={testID ? `${testID}-measure-${index}` : undefined}
          >
            {label}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  noPadding: { padding: 0 },
  scrollFrame: { alignSelf: 'stretch' },
  measure: { position: 'absolute', left: 0, top: 0, width: 2000, opacity: 0, flexDirection: 'row' },
  natural: { alignSelf: 'flex-start' },
});
