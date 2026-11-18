import { render } from '@testing-library/react-native';

import PomodoroScreen from '../../../../app/wellness/pomodoro';
import { FixedLightStatusBar } from '../FixedLightStatusBar';

const mockFocused = jest.fn(() => true);
jest.mock('expo-router', () => ({ useIsFocused: () => mockFocused(), useLocalSearchParams: () => ({}), router: { back: jest.fn(), navigate: jest.fn() } }));
jest.mock('../../pomodoro/PomodoroView', () => ({ PomodoroView: () => null }));
jest.mock('../../pomodoro/device', () => ({ pomodoroStore: {} }));
jest.mock('../navigation', () => ({ leaveWellness: jest.fn() }));
jest.mock('../../../lib/sessionNavigation', () => ({ closePresentedScreens: jest.fn() }));
jest.mock('../../../store/session', () => ({ useSession: (pick: (state: { profile: null }) => unknown) => pick({ profile: null }) }));
// The claim on the root layout's `StatusBarOwner` (android-polish.md §68).
const mockClaim = jest.fn(() => () => undefined);
jest.mock('../../../components/StatusBarOwner', () => ({ claimFixedLight: () => mockClaim() }));

/** The chooser and the guides keep dark status-bar content in both themes, but only while in front. */
describe('FixedLightStatusBar', () => {
  beforeEach(() => mockClaim.mockClear());

  it('asks for dark status-bar content while the screen is in front', async () => {
    mockFocused.mockReturnValue(true);
    await render(<FixedLightStatusBar />);
    expect(mockClaim).toHaveBeenCalledTimes(1);
  });

  it('steps aside under a pushed Moments or Shopping screen, which follow the theme', async () => {
    mockFocused.mockReturnValue(false);
    await render(<FixedLightStatusBar />);
    expect(mockClaim).not.toHaveBeenCalled();
  });

  it('is not on Pomodoro, which follows the theme since ce6d20a', async () => {
    mockFocused.mockReturnValue(true);
    await render(<PomodoroScreen />);
    expect(mockClaim).not.toHaveBeenCalled();
  });
});
