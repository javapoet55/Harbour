import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { StyleSheet, useWindowDimensions } from 'react-native';

import { WellnessTabButton } from '../../../components/WellnessTabButton';
import { WellnessChooser } from '../WellnessChooser';
import { GUIDES, WellnessModuleGuide } from '../WellnessModuleGuide';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(() => ({ width: 393, height: 852, scale: 3, fontScale: 1 })),
}));

/** `WellnessChooserView` (ios/App/WellnessChooserView.swift) and `WellnessModuleGuide` (WellnessModuleGuide.swift). */

describe('Wellness chooser', () => {
  it('shows the hero, the four modules in Swift order, and the quote', async () => {
    await render(<WellnessChooser onModule={jest.fn()} onExit={jest.fn()} />);
    expect(screen.getByText('A little time\nfor you')).toBeTruthy();
    expect(screen.getByText('Nourish your day. Organize your life.\nFocus on what matters.')).toBeTruthy();
    const ids = screen.getAllByTestId(/^wellness\.(shopping|calories|pomodoro|moments)$/).map((node) => node.props.testID);
    expect(ids).toEqual(['wellness.shopping', 'wellness.calories', 'wellness.pomodoro', 'wellness.moments']);
    const pomodoro = within(screen.getByTestId('wellness.pomodoro'));
    expect(pomodoro.getByText('Pomodoro Focus')).toBeTruthy();
    expect(pomodoro.getByText('Make time for deep work')).toBeTruthy();
    expect(pomodoro.getByText('Focus  ·  Be productive  ·  Get more done')).toBeTruthy();
    expect(screen.getByText('Track your meals, goals & nutrition')).toBeTruthy();
    expect(screen.getByText('Birthdays  ·  Festivals  ·  Special occasions')).toBeTruthy();
    expect(screen.getByText('“A more organized you,\na brighter tomorrow.” — NexDo')).toBeTruthy();
  });

  it('opens a module from its card', async () => {
    const onModule = jest.fn();
    await render(<WellnessChooser onModule={onModule} onExit={jest.fn()} />);
    await fireEvent.press(screen.getByTestId('wellness.calories'));
    await fireEvent.press(screen.getByTestId('wellness.moments'));
    expect(onModule.mock.calls).toEqual([['calories'], ['moments']]);
  });

  it('has its own bottom bar with the Wellness item selected and the four tab exits', async () => {
    const onExit = jest.fn();
    await render(<WellnessChooser onModule={jest.fn()} onExit={onExit} />);
    expect(screen.getByLabelText('Wellness menu').props.accessibilityState).toEqual({ selected: true });
    for (const label of ['Today', 'Tasks', 'Ask AI', 'Calendar']) await fireEvent.press(screen.getByLabelText(label));
    expect(onExit.mock.calls).toEqual([['home'], ['tasks'], ['askAI'], ['calendar']]);
  });
});

describe('module guides', () => {
  it.each(['calories', 'pomodoro', 'moments', 'shopping'] as const)('the %s guide shows its title, three steps and benefit', async (kind) => {
    await render(<WellnessModuleGuide kind={kind} onContinue={jest.fn()} onHome={jest.fn()} />);
    const guide = GUIDES[kind];
    expect(screen.getByText('How It Works')).toBeTruthy();
    expect(screen.getByText(guide.title)).toBeTruthy();
    expect(screen.getByText(guide.subtitle)).toBeTruthy();
    guide.steps.forEach(([title, text], index) => {
      const step = within(screen.getByTestId(`module-guide-step-${index + 1}`));
      expect(step.getByText(String(index + 1))).toBeTruthy();
      expect(step.getByText(title)).toBeTruthy();
      expect(step.getByText(text)).toBeTruthy();
    });
    expect(screen.getByText(guide.benefit.title)).toBeTruthy();
    expect(screen.getByText(guide.benefit.text)).toBeTruthy();
    expect(screen.getByTestId('module-guide-step-art-1').props.style).toEqual(expect.objectContaining({ width: 92, height: 122 }));
  });

  it('copies Swift\'s Pomodoro steps verbatim', () => {
    expect(GUIDES.pomodoro.steps[1]).toEqual(['Focus without distractions', 'Work on your task while the timer runs. We’ll keep you on track and remind you to stay focused.']);
    expect(GUIDES.shopping.benefit.title).toBe('Save time. Shop smarter.');
  });

  it('"Got it!" continues; Back and "Back to Home" both return to the chooser', async () => {
    const onContinue = jest.fn();
    const onHome = jest.fn();
    await render(<WellnessModuleGuide kind="pomodoro" onContinue={onContinue} onHome={onHome} />);
    await fireEvent.press(screen.getByTestId('module-guide-continue'));
    await fireEvent.press(screen.getByTestId('module-guide-back'));
    await fireEvent.press(screen.getByTestId('module-guide-home'));
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onHome).toHaveBeenCalledTimes(2);
  });

  it('draws "Back to Home" in the guide\'s ink, not the module colour (the outer foregroundStyle beats the tint)', async () => {
    await render(<WellnessModuleGuide kind="shopping" onContinue={jest.fn()} onHome={jest.fn()} />);
    expect(StyleSheet.flatten(screen.getByText('Back to Home').props.style).color).toBe('#0A0A30');
  });

  it('stacks each step\'s picture under its text at an accessibility text size', async () => {
    (useWindowDimensions as jest.Mock).mockReturnValue({ width: 393, height: 852, scale: 3, fontScale: 1.8 });
    await render(<WellnessModuleGuide kind="moments" onContinue={jest.fn()} onHome={jest.fn()} />);
    for (const index of [1, 2, 3]) {
      expect(screen.getByTestId(`module-guide-step-art-${index}`).props.style).toEqual(expect.objectContaining({ width: 150, height: 160 }));
    }
    (useWindowDimensions as jest.Mock).mockReturnValue({ width: 393, height: 852, scale: 3, fontScale: 1 });
  });
});

describe('the tab bar centre button', () => {
  it('is the Wellness image with Swift\'s label, and presses through', async () => {
    const onPress = jest.fn();
    await render(<WellnessTabButton onPress={onPress} />);
    await fireEvent.press(screen.getByLabelText('Wellness menu: Calorie Tracker, Pomodoro, Moments and Shopping'));
    expect(onPress).toHaveBeenCalled();
    expect(screen.queryByText('Wellness')).toBeNull();
  });
});
