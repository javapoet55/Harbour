import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet, View } from 'react-native';

import type { PomodoroBucket } from '../analytics';
import { CategoryDonut, FocusChart, ProgressRing } from '../charts';

/** The hand-built charts (PomodoroDashboard.swift:120-184, PomodoroView.swift:139-143). */

const zone = 'America/Los_Angeles';
const day = Date.parse('2026-09-21T07:00:00Z'); // Monday, midnight Pacific
const buckets: PomodoroBucket[] = Array.from({ length: 7 }, (_, index) => ({
  start: day + index * 86_400_000,
  end: day + (index + 1) * 86_400_000,
  seconds: [0, 600, 1500, 300, 0, 0, 0][index],
  breakSeconds: [0, 0, 300, 0, 0, 0, 0][index],
}));

function ring(fraction: number) {
  return render(<ProgressRing fraction={fraction} isBreak={false} size={300} />);
}

test('the ring draws the time left, at least a sliver', async () => {
  const count = async (fraction: number) => {
    const view = await ring(fraction);
    // The track, the centre, and one segment per 2° drawn.
    const segments = view.getByTestId('pomodoro-ring').props.children[1].length;
    await view.unmount();
    return segments;
  };
  expect(await count(1)).toBe(180);
  expect(await count(0.5)).toBe(90);
  expect(await count(0)).toBe(1);
});

test('the week chart labels Monday to Sunday and picks the tallest day until a bar is tapped', async () => {
  const onPick = jest.fn();
  await render(<FocusChart breaks={false} buckets={buckets} onPick={onPick} period="week" picked={null} testID="chart" zone={zone} />);
  for (const label of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) expect(screen.getByText(label)).toBeTruthy();
  expect(screen.getByTestId('chart-bar-2').props.accessibilityState).toEqual({ selected: true });
  // The trend chart labels the picked bar with its focus time.
  expect(screen.getByText('25 min')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('chart-bar-1'));
  expect(onPick).toHaveBeenCalledWith(1);
});

test('the overview chart shows break bars and its legend, without a bar label', async () => {
  await render(<FocusChart breaks buckets={buckets} onPick={jest.fn()} period="week" picked={1} testID="chart" zone={zone} />);
  expect(screen.getByText('Focus')).toBeTruthy();
  expect(screen.getByText('Break')).toBeTruthy();
  expect(screen.getByTestId('chart-bar-1').props.accessibilityState).toEqual({ selected: true });
  expect(screen.queryByText('10 min')).toBeNull();
  expect(screen.getByTestId('chart-bar-2').props.accessibilityValue).toEqual({ text: '25 min focus, 5 min break' });
});

test('the donut shares its segments by time and shows its centre', async () => {
  await render(
    <CategoryDonut
      center={<View testID="centre" />}
      size={155}
      slices={[
        { color: '#34C759', seconds: 1500 },
        { color: '#FF9500', seconds: 3000 },
      ]}
    />,
  );
  const segments = screen.getByTestId('pomodoro-donut').props.children[0] as { props: { color: string } }[];
  expect(segments.filter((segment) => segment.props.color === '#34C759')).toHaveLength(60);
  expect(segments.filter((segment) => segment.props.color === '#FF9500')).toHaveLength(120);
  expect(screen.getByTestId('centre')).toBeTruthy();
});

test('the ring\'s segments are opaque, so their overlaps leave no seams', async () => {
  const view = await ring(1);
  const segments = view.getByTestId('pomodoro-ring').props.children[1] as { props: { color: string } }[];
  expect(segments.every((segment) => segment.props.color.startsWith('rgb('))).toBe(true);
  // The first stop is opaque purple; the last fades towards the 22% pink track on white.
  expect(segments[0].props.color).toBe('rgb(175, 82, 222)');
  expect(segments[179].props.color).toBe('rgb(255, 158, 177)');
});

test('each minute label sits on its own grid line, and the bar label on its bar', async () => {
  // Tallest 25 min: the domain is 32.5, so the 30m line is below the top of the chart.
  await render(<FocusChart breaks={false} buckets={buckets} onPick={jest.fn()} period="week" picked={null} testID="chart" zone={zone} />);
  expect(StyleSheet.flatten(screen.getByText('30m').props.style)).toEqual(expect.objectContaining({ position: 'absolute', bottom: `${(30 / 32.5) * 100}%` }));
  expect(StyleSheet.flatten(screen.getByText('0m').props.style).bottom).toBe('0%');
  expect(StyleSheet.flatten(screen.getByTestId('chart-label').props.style).bottom).toBe(`${(25 / 32.5) * 100}%`);
});
