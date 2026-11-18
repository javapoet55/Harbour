import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  router: { replace: (...args: unknown[]) => mockReplace(...args), push: jest.fn(), back: jest.fn() },
  useIsFocused: () => true,
}));

import Introduction from '../../app/(auth)/introduction';
import { InstallIntroduction } from '../features/introduction/InstallIntroduction';
import { useIntroduction } from '../store/introduction';

/**
 * The first-install introduction (ios/App/InstallIntroductionView.swift; captures `install-intro-1`…`-4`).
 */

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  useIntroduction.setState({ completed: false });
});

const selected = (page: number) => screen.getByTestId(`intro.dot.${page}`).props.accessibilityState?.selected;

describe('InstallIntroduction', () => {
  it('has Swift’s four pages, in order', async () => {
    await render(<InstallIntroduction onFinish={jest.fn()} />);
    expect(screen.getByText('NexDo')).toBeTruthy();
    for (const [heading, ...accent] of [
      ['Less on your mind.', 'More done in your day.'],
      ['Just Ask.', 'NexDo Takes Action.'],
      ['One App.', 'So Many Ways to', 'Make Life Easier.'],
      ['More Time for', 'What Matters.'],
    ]) {
      expect(screen.getByText(heading)).toBeTruthy();
      // GradientText draws each line twice: the mask and the sizing copy.
      for (const line of accent) expect(screen.getAllByText(line).length).toBeGreaterThan(0);
    }
    expect(screen.getByText('Your AI-powered daily assistant that brings your tasks, calendar, and everyday life together.')).toBeTruthy();
    expect(screen.getByText('Stay organized, accomplish more, and enjoy life’s special moments with NexDo.')).toBeTruthy();
    for (const title of ['Smart To-Do’s', 'Calendar & Reminders', 'Shopping Lists', 'Everyday Essentials']) expect(screen.getByText(title)).toBeTruthy();
    expect(screen.getByLabelText('NexDo brings tasks, calendar, shopping and moments into one place.')).toBeTruthy();
  });

  it('pages with Next and the dots, and swaps in Get Started on the last page', async () => {
    await render(<InstallIntroduction onFinish={jest.fn()} />);
    expect(selected(1)).toBe(true);
    expect(screen.queryByTestId('intro.getStarted')).toBeNull();

    await fireEvent.press(screen.getByTestId('intro.next'));
    expect(selected(2)).toBe(true);
    await fireEvent.press(screen.getByLabelText('Page 4 of 4'));
    expect(selected(4)).toBe(true);
    expect(screen.queryByTestId('intro.next')).toBeNull();
    expect(screen.getByTestId('intro.getStarted')).toBeTruthy();
    expect(screen.getByText('Sign In')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Page 1 of 4'));
    expect(screen.getByTestId('intro.next')).toBeTruthy();
  });

  it('follows a swipe', async () => {
    await render(<InstallIntroduction onFinish={jest.fn()} />);
    const width = 750; // the jest window
    await fireEvent(screen.getByTestId('intro.pager'), 'momentumScrollEnd', { nativeEvent: { contentOffset: { x: width * 2, y: 0 } } });
    expect(selected(3)).toBe(true);
  });

  it('finishes with sign-up from Skip and Get Started, and without it from Sign In', async () => {
    const onFinish = jest.fn();
    await render(<InstallIntroduction onFinish={onFinish} />);
    await fireEvent.press(screen.getByTestId('intro.skip'));
    await fireEvent.press(screen.getByLabelText('Page 4 of 4'));
    await fireEvent.press(screen.getByTestId('intro.getStarted'));
    await fireEvent.press(screen.getByTestId('intro.signIn'));
    expect(onFinish.mock.calls).toEqual([[true], [true], [false]]);
  });
});

describe('the introduction route', () => {
  it('marks it seen and replaces it with sign-in, Create Account up', async () => {
    await render(<Introduction />);
    await fireEvent.press(screen.getByTestId('intro.skip'));
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/sign-in', params: { signUp: '1' } });
    expect(useIntroduction.getState().completed).toBe(true);
    await waitFor(async () => expect(await AsyncStorage.getItem('nexdo.installIntroductionCompleted')).toBe('true'));
  });

  it('opens sign-in alone from Sign In', async () => {
    await render(<Introduction />);
    await fireEvent.press(screen.getByLabelText('Page 4 of 4'));
    await fireEvent.press(screen.getByTestId('intro.signIn'));
    expect(mockReplace).toHaveBeenCalledWith('/sign-in');
  });
});

// Phone check (docs/android-polish.md §66): with only `aspectRatio`, Android kept the bundled image's own height
// and `cover` cropped the art to about twice the size. Each page sets the height itself.
it('sizes each page’s artwork from the window width and the crop’s aspect', async () => {
  await render(<InstallIntroduction onFinish={jest.fn()} />);
  const width = 750; // the jest window
  const style = (page: number) => StyleSheet.flatten(screen.getByTestId(`intro.artwork.${page}`).props.style);
  expect(style(1)).toEqual({ width, height: (width * 1135) / 784 });
  expect(style(3)).toEqual({ width, height: (width * 565) / 784 });
  expect(style(1).aspectRatio).toBeUndefined();
});
