import { fireEvent, render, screen } from '@testing-library/react-native';
import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { fitSegments, SEGMENT_LABEL_PADDING, SegmentRow, stepDown } from './SegmentRow';
import { Text } from './Text';

/** docs/android-polish.md §9: one size for every label, sized to the label, step down, then scroll. */

const base = { fontSize: 15, lineHeight: 21 };
const hidden = { includeHiddenElements: true } as const;
const layout = (width: number, x = 0) => ({ nativeEvent: { layout: { x, y: 0, width, height: 40 } } });

describe('stepDown', () => {
  it('moves one step down the type scale', () => {
    expect(stepDown(15)).toBe(13);
    expect(stepDown(13)).toBe(12);
    expect(stepDown(11)).toBe(11);
  });
});

describe('fitSegments', () => {
  // "Details", "Contacts", "Wish Message", "Schedule" at 15pt, gap 3 and 5 of padding (Manage Moment).
  const labels = [50, 66, 98, 66];
  const needed = (scale: number) => labels.reduce((sum, width) => sum + width * scale + SEGMENT_LABEL_PADDING * 2, 0) + 3 * 3 + 5 * 2;

  it('keeps the base size when every label fits', () => {
    expect(fitSegments(labels, needed(1), base, 3, 5)).toEqual({ fontSize: 15, lineHeight: 21, scroll: false });
  });

  it('drops ALL the labels one step together when they do not fit at the base size', () => {
    expect(fitSegments(labels, needed(1) - 1, base, 3, 5)).toEqual({ fontSize: 13, lineHeight: 18, scroll: false });
    expect(fitSegments(labels, needed(13 / 15), base, 3, 5)).toEqual({ fontSize: 13, lineHeight: 18, scroll: false });
  });

  it('scrolls at the smaller size when even that does not fit', () => {
    expect(fitSegments(labels, needed(13 / 15) - 1, base, 3, 5)).toEqual({ fontSize: 13, lineHeight: 18, scroll: true });
  });

  it('keeps the base size until the row and every label are measured', () => {
    expect(fitSegments(labels, 0, base, 3, 5)).toMatchObject({ fontSize: 15, scroll: false });
    expect(fitSegments([50, 0, 98, 66], 100, base, 3, 5)).toMatchObject({ fontSize: 15, scroll: false });
  });
});

describe('SegmentRow', () => {
  const labels = ['Details', 'Contacts', 'Wish Message', 'Schedule'];

  function Row({ selected = 0 }: { selected?: number }) {
    return (
      <SegmentRow
        labels={labels}
        selected={selected}
        base={base}
        gap={3}
        inset={5}
        testID="row"
        renderSegment={(index, fit, segmentStyle) => (
          <Pressable style={segmentStyle} testID={`tab-${index}`}>
            <Text numberOfLines={1} style={{ fontSize: fit.fontSize, lineHeight: fit.lineHeight }}>
              {labels[index]}
            </Text>
          </Pressable>
        )}
      />
    );
  }

  async function measure(available: number, widths = [50, 66, 98, 66]) {
    await fireEvent(screen.getByTestId('row'), 'layout', layout(available));
    for (const [index, width] of widths.entries()) {
      await fireEvent(screen.getByTestId(`row-measure-${index}`, hidden), 'layout', layout(width));
    }
  }

  const sizes = () => labels.map((label) => StyleSheet.flatten(screen.getByText(label).props.style).fontSize);

  it('sizes each segment to its label, sharing spare room, all at the base size', async () => {
    await render(<Row />);
    await measure(420);
    expect(sizes()).toEqual([15, 15, 15, 15]);
    for (const index of [0, 1, 2, 3]) {
      expect(StyleSheet.flatten(screen.getByTestId(`row-segment-${index}`).props.style)).toMatchObject({ flexGrow: 1, flexBasis: 'auto', flexShrink: 0 });
      expect(StyleSheet.flatten(screen.getByTestId(`tab-${index}`).props.style)).toMatchObject({ paddingHorizontal: 12 });
    }
    expect(screen.queryByTestId('row-scroll')).toBeNull();
  });

  it('drops all four labels to 13 together on a narrower phone', async () => {
    await render(<Row />);
    await measure(360);
    expect(sizes()).toEqual([13, 13, 13, 13]);
    expect(screen.queryByTestId('row-scroll')).toBeNull();
  });

  it('scrolls, labels at 13 and segments at their own width, and brings the selected one into view', async () => {
    await render(<Row selected={3} />);
    await measure(300);
    expect(sizes()).toEqual([13, 13, 13, 13]);
    const scroll = screen.getByTestId('row-scroll');
    expect(scroll.props.horizontal).toBe(true);
    expect(scroll.props.showsHorizontalScrollIndicator).toBe(false);
    expect(StyleSheet.flatten(screen.getByTestId('row-segment-3').props.style)).toMatchObject({ flexGrow: 0 });

    // The test renderer's ScrollView has no `scrollTo`; give its instances one to observe.
    const scrollTo = jest.fn();
    const proto = (ScrollView as unknown as { prototype: { scrollTo?: unknown } }).prototype;
    proto.scrollTo = scrollTo;
    // The selected segment ("Schedule") lays out at x = 250 inside the scrolled content.
    await fireEvent(screen.getByTestId('row-segment-3'), 'layout', layout(90, 250));
    expect(scrollTo).toHaveBeenCalledWith({ x: 245, animated: false });
    delete proto.scrollTo;
  });
});
