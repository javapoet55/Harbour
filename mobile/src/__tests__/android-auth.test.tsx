import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Platform, StyleSheet } from 'react-native';

import { GlassCard } from '../components/GlassCard';
import { ANDROID_DISABLED_GRADIENT_OPACITY, GradientButton } from '../components/GradientButton';
import { SignInBackdrop } from '../components/SignInBackdrop';
import { Text } from '../components/Text';
import { palettes } from '../theme';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({}),
}));

jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  endpoints: { login: jest.fn(), me: jest.fn(), register: jest.fn() },
}));

import SignIn from '../../app/(auth)/sign-in';
import SignUp from '../../app/(auth)/sign-up';

/** docs/android-polish.md §11: the auth screens on Android. Tests render in the light scheme. */
const light = palettes.light;
const flat = (testID: string) => StyleSheet.flatten(screen.getByTestId(testID, { includeHiddenElements: true }).props.style);
const onPlatform = (os: 'ios' | 'android') => jest.replaceProperty(Platform, 'OS', os);
const layout = { nativeEvent: { layout: { x: 0, y: 0, width: 402, height: 874 } } };

function wrap(node: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
}

afterEach(() => jest.restoreAllMocks());

describe('the form card', () => {
  it('is the shared form group on Android, at its own radius, with no glass stroke', async () => {
    onPlatform('android');
    await render(
      <GlassCard radius={28} formGroup testID="card">
        <Text>Field</Text>
      </GlassCard>,
    );
    expect(flat('card')).toMatchObject({ borderRadius: 28, backgroundColor: light.fieldSurface, borderWidth: 1, borderColor: light.fieldBorder });
    expect(flat('card').borderColor).not.toBe(light.glassStroke);
  });

  it('stays glass on iOS', async () => {
    onPlatform('ios');
    await render(
      <GlassCard radius={28} formGroup testID="card">
        <Text>Field</Text>
      </GlassCard>,
    );
    expect(flat('card')).toMatchObject({ backgroundColor: light.glassFill });
  });
});

describe('the backdrop', () => {
  it('sits behind the content at 60% on Android', async () => {
    onPlatform('android');
    await render(<SignInBackdrop />);
    expect(flat('sign-in-backdrop')).toMatchObject({ position: 'absolute', zIndex: 0, opacity: 0.6 });
  });

  it('keeps the Swift opacity on iOS', async () => {
    onPlatform('ios');
    await render(<SignInBackdrop />);
    expect(flat('sign-in-backdrop').opacity).toBeUndefined();
  });
});

describe('the primary button', () => {
  it('fades only the gradient when disabled on Android, and keeps the label at 70% white', async () => {
    onPlatform('android');
    const { rerender } = await render(<GradientButton title="Sign In" onPress={jest.fn()} disabled minHeight={62} testID="button" />);
    expect(flat('button-gradient')).toMatchObject({ opacity: ANDROID_DISABLED_GRADIENT_OPACITY });
    expect(ANDROID_DISABLED_GRADIENT_OPACITY).toBe(0.4);
    expect(StyleSheet.flatten(screen.getByText('Sign In').props.style).color).toBe('rgba(255, 255, 255, 0.7)');
    // The button itself is not dimmed — only its gradient layer.
    expect(flat('button')?.opacity).toBeUndefined();

    // Enabled: the full gradient and a white label, as before.
    await rerender(<GradientButton title="Sign In" onPress={jest.fn()} minHeight={62} testID="button" />);
    expect(flat('button-gradient')).toMatchObject({ opacity: 1 });
    expect(StyleSheet.flatten(screen.getByText('Sign In').props.style).color).toBe(light.onTint);
  });

  it('keeps the Swift dimming on iOS', async () => {
    onPlatform('ios');
    await render(<GradientButton title="Sign In" onPress={jest.fn()} disabled minHeight={62} testID="button" />);
    expect(flat('button')).toMatchObject({ opacity: 0.25 });
  });
});

describe('Sign in on Android', () => {
  beforeEach(() => onPlatform('android'));

  it('draws the card as the form group and borders the focused row’s icon tile in the accent', async () => {
    await wrap(<SignIn />);
    expect(flat('sign-in-card')).toMatchObject({ backgroundColor: light.fieldSurface, borderColor: light.fieldBorder });

    expect(flat('field-icon-envelope')).toMatchObject({ borderWidth: 1, borderColor: 'transparent' });
    await fireEvent(screen.getByLabelText('Email address'), 'focus');
    expect(flat('field-icon-envelope')).toMatchObject({ borderColor: light.accent });
    expect(flat('field-icon-lock')).toMatchObject({ borderColor: 'transparent' });

    await fireEvent(screen.getByLabelText('Email address'), 'blur');
    await fireEvent(screen.getByLabelText('Password'), 'focus');
    expect(flat('field-icon-envelope')).toMatchObject({ borderColor: 'transparent' });
    expect(flat('field-icon-lock')).toMatchObject({ borderColor: light.accent });
  });

  it('separates the rows with the group separator', async () => {
    await wrap(<SignIn />);
    for (const divider of screen.getAllByTestId('auth-field-divider')) {
      expect(StyleSheet.flatten(divider.props.style)).toMatchObject({ height: 1, backgroundColor: light.fieldBorder });
    }
  });

  it('draws the subtitle and the trust line in the secondary token', async () => {
    await wrap(<SignIn />);
    expect(StyleSheet.flatten(screen.getByText('Your day is clearer with Nexdo.').props.style).color).toBe(light.secondary);
    expect(StyleSheet.flatten(screen.getByText('Your password stays on this device only for this sign-in.').props.style).color).toBe(light.secondary);
  });
});

describe('Create account on Android', () => {
  beforeEach(() => onPlatform('android'));

  it('pads the scroll by the navigation bar and leaves 24 under the closing copy', async () => {
    await wrap(<SignUp />);
    // The test safe-area mock reports a 34pt bottom inset.
    expect(StyleSheet.flatten(screen.getByTestId('auth-scroll').props.contentContainerStyle)).toMatchObject({ paddingBottom: 34 });
    expect(flat('sign-up-bottom')).toMatchObject({ height: 24 });
    expect(screen.getByText('Nexdo captures tasks in your own words, finds the right next step, and helps you protect time for what matters.')).toBeTruthy();
  });

  it('borders the focused row’s tile in the accent', async () => {
    await wrap(<SignUp />);
    await fireEvent(screen.getByLabelText('Full name'), 'focus');
    expect(flat('field-icon-person')).toMatchObject({ borderColor: light.accent });
    await fireEvent(screen.getByLabelText('Confirm password'), 'focus');
    expect(flat('field-icon-checkmark.shield')).toMatchObject({ borderColor: light.accent });
  });
});

describe('Create account on iOS', () => {
  it('keeps the Swift spacing and no focus border', async () => {
    onPlatform('ios');
    await wrap(<SignUp />);
    expect(flat('sign-up-bottom')).toMatchObject({ height: 28 });
    expect(StyleSheet.flatten(screen.getByTestId('auth-scroll').props.contentContainerStyle)).toMatchObject({ paddingBottom: 0 });
    expect(flat('field-icon-person').borderWidth).toBeUndefined();
  });
});

// The circles only render once the backdrop is measured; this exercises that path.
it('lays the backdrop circles out once measured', async () => {
  await render(<SignInBackdrop />);
  await fireEvent(screen.getByTestId('sign-in-backdrop', { includeHiddenElements: true }), 'layout', layout);
});
