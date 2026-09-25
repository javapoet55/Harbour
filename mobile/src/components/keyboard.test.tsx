import { render, screen } from '@testing-library/react-native';
import { Platform, Text } from 'react-native';

import { StickyActionBar } from '../features/shopping/components';
import { footerBetween, KEYBOARD_GAP, KeyboardAvoidingView, KeyboardAwareScrollView, KeyboardLift, liftOffset } from './keyboard';

// The package mock maps its components onto plain `View`/`ScrollView`; named host stand-ins show
// which implementation each platform actually picks.
jest.mock('react-native-keyboard-controller', () => ({
  ...jest.requireActual('react-native-keyboard-controller/jest'),
  KeyboardAvoidingView: 'KCKeyboardAvoidingView',
  KeyboardAwareScrollView: 'KCKeyboardAwareScrollView',
  KeyboardStickyView: 'KCKeyboardStickyView',
}));

const onPlatform = (os: 'ios' | 'android') => jest.replaceProperty(Platform, 'OS', os);

afterEach(() => jest.restoreAllMocks());

describe('Android: keyboard-controller', () => {
  beforeEach(() => onPlatform('android'));

  it('avoids with padding, measured against the window, whatever behaviour the screen asked for', async () => {
    await render(
      <KeyboardAvoidingView behavior="height" testID="avoid">
        <Text>body</Text>
      </KeyboardAvoidingView>,
    );
    const view = screen.getByTestId('avoid');
    expect(view.type).toBe('KCKeyboardAvoidingView');
    expect(view.props.behavior).toBe('padding');
    expect(view.props.automaticOffset).toBe(true);
  });

  it('scrolls the focused field clear of the keyboard, plus any extra room the screen asks for', async () => {
    await render(<KeyboardAwareScrollView bottomOffset={60} keyboardShouldPersistTaps="handled" testID="scroll" />);
    const scroll = screen.getByTestId('scroll');
    expect(scroll.type).toBe('KCKeyboardAwareScrollView');
    expect(scroll.props.bottomOffset).toBe(KEYBOARD_GAP + 60);
    expect(scroll.props.keyboardShouldPersistTaps).toBe('handled');
  });

  it('lifts a pinned bar with the keyboard', async () => {
    await render(<KeyboardLift testID="bar" />);
    const bar = screen.getByTestId('bar');
    expect(bar.type).toBe('KCKeyboardStickyView');
    // Unmeasured, the bar is taken to sit on the window's bottom edge: it moves by the full keyboard.
    expect(bar.props.offset).toEqual({ closed: 0, opened: 0 });
  });

  it('Shopping’s action bar rides up on the keyboard', async () => {
    await render(<StickyActionBar testID="actions">{null}</StickyActionBar>);
    expect(screen.getByTestId('actions').type).toBe('KCKeyboardStickyView');
  });
});

describe('iOS: unchanged', () => {
  beforeEach(() => onPlatform('ios'));

  it('keeps React Native’s KeyboardAvoidingView where a screen asked for one, and a plain View where it did not', async () => {
    await render(
      <>
        <KeyboardAvoidingView behavior="padding" testID="asked">
          <Text>a</Text>
        </KeyboardAvoidingView>
        <KeyboardAvoidingView testID="plain">
          <Text>b</Text>
        </KeyboardAvoidingView>
      </>,
    );
    // React Native's `KeyboardAvoidingView` renders a `View` that measures itself; a plain one does not.
    expect(screen.getByTestId('asked').type).toBe('View');
    expect(screen.getByTestId('asked').props.onLayout).toEqual(expect.any(Function));
    expect(screen.getByTestId('plain').type).toBe('View');
    expect(screen.getByTestId('plain').props.onLayout).toBeUndefined();
  });

  it('scrolls with a plain ScrollView and pins bars where they were', async () => {
    await render(
      <>
        <KeyboardAwareScrollView bottomOffset={60} testID="scroll" />
        <StickyActionBar testID="actions">{null}</StickyActionBar>
      </>,
    );
    expect(screen.getByTestId('scroll').type).toBe('RCTScrollView');
    expect(screen.getByTestId('scroll').props.bottomOffset).toBeUndefined();
    expect(screen.getByTestId('actions').type).toBe('View');
  });
});

describe('the measurements', () => {
  it('a footer is what lies between the scroll view and the avoiding view, once both are measured', () => {
    expect(footerBetween(null, 700)).toBe(0);
    expect(footerBetween(800, null)).toBe(0);
    expect(footerBetween(800, 712)).toBe(88);
    expect(footerBetween(800, 810)).toBe(0);
  });

  it('a bar above a tab bar moves only by the part of the keyboard that reaches it', () => {
    // A 900-tall window, the bar's bottom 80 above the window's (a tab bar): the sticky view moves by
    // the keyboard height, so it is offset back down by those 80.
    expect(liftOffset(900, 820)).toBe(80);
    // …and stopped 60 short of the keyboard's top edge to clear the "Done" capsule.
    expect(liftOffset(900, 820, 60)).toBe(20);
    expect(liftOffset(900, 900, 60)).toBe(-60);
  });
});
