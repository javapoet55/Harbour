import { act, render } from '@testing-library/react-native';

import WellnessLayout from '../../../../app/wellness/_layout';
import { useAppearance } from '../../../store/appearance';

type Options = { contentStyle?: { backgroundColor?: string } };
const mockScreens: Record<string, Options | undefined> = {};
jest.mock('expo-router', () => {
  function Stack({ children }: { children?: React.ReactNode }) {
    return <>{children}</>;
  }
  function Screen({ name, options }: { name: string; options?: Options }) {
    mockScreens[name] = options;
    return null;
  }
  Stack.Screen = Screen;
  return { Stack, router: { back: jest.fn() } };
});

const cover = (name: string) => mockScreens[name]?.contentStyle?.backgroundColor;

afterEach(() => useAppearance.setState({ appearance: 'system' }));

/**
 * QA M-03 (android-polish.md §69): Ask AI and Pomodoro follow Night since Phase 14; Pomodoro's cover
 * also follows it now, so it no longer slides in white over the dark app.
 */
describe('the Wellness covers at Night', () => {
  it('draws the chooser’s and Pomodoro’s covers black at Night and white by Day', async () => {
    useAppearance.setState({ appearance: 'night' });
    await render(<WellnessLayout />);
    expect(cover('index')).toBe('#000000');
    expect(cover('pomodoro')).toBe('#000000');
    await act(async () => useAppearance.setState({ appearance: 'day' }));
    expect(cover('index')).toBe('#FFFFFF');
    expect(cover('pomodoro')).toBe('#FFFFFF');
  });

  it('keeps the fixed-light guides and the Calorie Tracker on the white cover', async () => {
    useAppearance.setState({ appearance: 'night' });
    await render(<WellnessLayout />);
    expect(cover('guide/[kind]')).toBeUndefined();
    expect(cover('calories')).toBeUndefined();
  });
});
