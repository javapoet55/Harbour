import { fireEvent, render, screen } from '@testing-library/react-native';
import { Platform, StyleSheet } from 'react-native';

import type { CalendarRow } from '../lib/calendarRows';
import { palettes } from '../theme';
import { ANDROID_TEXT_INSET, CalendarSummaryCard, CalendarTimelineRow } from './CalendarParts';

/** docs/android-polish.md §10: the Calendar timeline row and summary card on Android. */
const light = palettes.light;
const flat = (testID: string) => StyleSheet.flatten(screen.getByTestId(testID).props.style);
const onPlatform = (os: 'ios' | 'android') => jest.replaceProperty(Platform, 'OS', os);

const ZONE = 'Asia/Kolkata';
const NOW = Date.parse('2026-09-16T03:30:00.000Z');

function row(overrides: Partial<CalendarRow> = {}): CalendarRow {
  return {
    id: 'r1',
    title: 'Standup',
    at: NOW,
    time: '9:30 AM',
    detail: '30 min · Calendar event',
    task: null,
    event: { id: 'e1', title: 'Standup', startAt: '2026-09-16T04:00:00.000Z', endAt: '2026-09-16T04:30:00.000Z' },
    deadline: false,
    ...overrides,
  };
}

afterEach(() => jest.restoreAllMocks());

describe('CalendarTimelineRow on Android', () => {
  beforeEach(() => onPlatform('android'));

  it('centres every column on the row, with 12 of padding and the chevron 16 from the right', async () => {
    await render(<CalendarTimelineRow row={row()} timeZone={ZONE} completedOnly={false} now={NOW} onPress={jest.fn()} />);
    expect(flat('calendar-row-r1')).toMatchObject({ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingRight: 16 });
    expect(flat('calendar-row-r1-chevron')).toMatchObject({ alignSelf: 'center' });
  });

  it('gives the row a pressed fill and keeps the whole row the target', async () => {
    const onPress = jest.fn();
    await render(<CalendarTimelineRow row={row()} timeZone={ZONE} completedOnly={false} now={NOW} onPress={onPress} />);
    expect(flat('calendar-row-r1').backgroundColor).toBeUndefined();
    await fireEvent(screen.getByTestId('calendar-row-r1'), 'pressIn');
    expect(flat('calendar-row-r1')).toMatchObject({ backgroundColor: light.fieldSurface });
    await fireEvent(screen.getByTestId('calendar-row-r1'), 'pressOut');
    await fireEvent.press(screen.getByTestId('calendar-row-r1'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('draws a 44pt tile on the field surface, a 72pt left-aligned time, and 17/14 text', async () => {
    await render(<CalendarTimelineRow row={row()} timeZone={ZONE} completedOnly={false} now={NOW} onPress={jest.fn()} />);
    expect(flat('calendar-row-r1-glyph')).toMatchObject({
      width: 44,
      height: 44,
      backgroundColor: light.fieldSurface,
      borderColor: light.fieldBorder,
      borderWidth: StyleSheet.hairlineWidth,
    });
    expect(StyleSheet.flatten(screen.getByText('9:30 AM').props.style)).toMatchObject({ width: 72, textAlign: 'left' });
    expect(StyleSheet.flatten(screen.getByText('Standup').props.style)).toMatchObject({ fontSize: 17 });
    expect(StyleSheet.flatten(screen.getByText('30 min · Calendar event').props.style)).toMatchObject({ fontSize: 14, color: light.secondary });
  });

  it('runs the 1px separator from the text column to the row’s right edge', async () => {
    await render(<CalendarTimelineRow row={row()} timeZone={ZONE} completedOnly={false} now={NOW} onPress={jest.fn()} />);
    expect(ANDROID_TEXT_INSET).toBe(72 + 8 + 44 + 10 * 3);
    expect(flat('calendar-row-r1-separator')).toMatchObject({ position: 'absolute', left: ANDROID_TEXT_INSET, right: 0, bottom: 0, height: 1, backgroundColor: light.fieldBorder });
  });

  it('keeps the Deadline chip', async () => {
    await render(<CalendarTimelineRow row={row({ deadline: true })} timeZone={ZONE} completedOnly={false} now={NOW} onPress={jest.fn()} />);
    expect(screen.getByText('Deadline')).toBeTruthy();
  });
});

describe('CalendarTimelineRow on iOS', () => {
  beforeEach(() => onPlatform('ios'));

  it('keeps the Swift layout: top-aligned, the divider under the text, no row separator', async () => {
    await render(<CalendarTimelineRow row={row()} timeZone={ZONE} completedOnly={false} now={NOW} onPress={jest.fn()} />);
    expect(flat('calendar-row-r1')).toMatchObject({ alignItems: 'flex-start' });
    expect(screen.queryByTestId('calendar-row-r1-separator')).toBeNull();
    expect(StyleSheet.flatten(screen.getByText('9:30 AM').props.style)).toMatchObject({ width: 64 });
  });
});

describe('CalendarSummaryCard', () => {
  it('is the shared form group on Android', async () => {
    onPlatform('android');
    await render(<CalendarSummaryCard title="3 items · 1 deadline" detail="Includes today" testID="summary" />);
    expect(flat('summary')).toMatchObject({ backgroundColor: light.fieldSurface, borderWidth: 1, borderColor: light.fieldBorder });
  });

  it('keeps its indigo tint on iOS', async () => {
    onPlatform('ios');
    await render(<CalendarSummaryCard title="3 items · 1 deadline" detail="Includes today" testID="summary" />);
    expect(flat('summary').borderWidth).toBeUndefined();
  });
});
