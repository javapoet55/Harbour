import { fireEvent, render, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { palettes } from '../../../theme';
import { useAppearance } from '../../../store/appearance';
import { WellnessChooser } from '../WellnessChooser';
import { WellnessModuleGuide } from '../WellnessModuleGuide';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(() => ({ width: 393, height: 852, scale: 3, fontScale: 1 })),
}));

/** Phase 14 (docs/IOS_TO_REACT_NATIVE.md §24) Wellness rows; android-polish.md §60. */

afterEach(() => {
  useAppearance.setState({ appearance: 'system' });
});

describe('wellnessAccent', () => {
  it('is the brand indigo in light and Swift’s lilac in dark (WellnessAppearance.swift)', () => {
    expect(palettes.light.wellnessAccent).toBe('#3D29F0');
    expect(palettes.dark.wellnessAccent).toBe('#BAABFF');
  });
});

describe('Wellness chooser hero in dark (1a9a89a)', () => {
  it('draws a gold moon with two white sparkles in Night', async () => {
    useAppearance.setState({ appearance: 'night' });
    const view = await render(<WellnessChooser onModule={jest.fn()} onExit={jest.fn()} />);
    const json = JSON.stringify(view.toJSON());
    expect(json).toContain('#FFC740');
    expect(json).not.toContain('rgba(184, 166, 255, 0.28)');
    // 18 pt at (-17, -2) and 27 pt at (4, 16) from the box's top trailing corner, at scale 1.
    expect(StyleSheet.flatten(view.getByTestId('wellness-hero-sparkle-small', { includeHiddenElements: true }).props.style)).toMatchObject({ right: 17, top: -2 });
    expect(StyleSheet.flatten(view.getByTestId('wellness-hero-sparkle-large', { includeHiddenElements: true }).props.style)).toMatchObject({ right: -4, top: 16 });
  });

  it('keeps the pack art and no moon in Day', async () => {
    useAppearance.setState({ appearance: 'day' });
    const view = await render(<WellnessChooser onModule={jest.fn()} onExit={jest.fn()} />);
    expect(view.queryByTestId('wellness-hero-moon')).toBeNull();
    expect(JSON.stringify(view.toJSON())).not.toContain('#FFC740');
  });
});

describe('Module guides pin Got it! and Back to Home (897f14d)', () => {
  it.each(['calories', 'pomodoro', 'moments', 'shopping'] as const)('the %s guide keeps both buttons outside the scrolling steps', async (kind) => {
    const view = await render(<WellnessModuleGuide kind={kind} onContinue={jest.fn()} onHome={jest.fn()} />);
    const scroll = view.getByTestId('module-guide-scroll');
    const bar = view.getByTestId('module-guide-bar');
    for (const id of ['module-guide-continue', 'module-guide-home']) {
      expect(within(bar).getByTestId(id)).toBeTruthy();
      expect(within(scroll).queryByTestId(id)).toBeNull();
    }
    expect(within(scroll).getByTestId('module-guide-step-3')).toBeTruthy();
  });

  it('still calls through from the pinned bar', async () => {
    const onContinue = jest.fn();
    const onHome = jest.fn();
    const view = await render(<WellnessModuleGuide kind="shopping" onContinue={onContinue} onHome={onHome} />);
    await fireEvent.press(view.getByTestId('module-guide-continue'));
    await fireEvent.press(view.getByText('Back to Home'));
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onHome).toHaveBeenCalledTimes(1);
  });
});
