import { render } from '@testing-library/react-native';

import { FixedLightStatusBar } from '../FixedLightStatusBar';

const mockFocused = jest.fn(() => true);
jest.mock('expo-router', () => ({ useIsFocused: () => mockFocused() }));
const mockStatusBar = jest.fn((_props: { style: string }) => null);
jest.mock('expo-status-bar', () => ({ StatusBar: (props: { style: string }) => mockStatusBar(props) }));

/** The chooser and the guides keep dark status-bar content in both themes, but only while in front. */
describe('FixedLightStatusBar', () => {
  beforeEach(() => mockStatusBar.mockClear());

  it('asks for dark status-bar content while the screen is in front', async () => {
    mockFocused.mockReturnValue(true);
    await render(<FixedLightStatusBar />);
    expect(mockStatusBar).toHaveBeenCalledWith({ style: 'dark' });
  });

  it('steps aside under a pushed Moments or Shopping screen, which follow the theme', async () => {
    mockFocused.mockReturnValue(false);
    await render(<FixedLightStatusBar />);
    expect(mockStatusBar).not.toHaveBeenCalled();
  });
});
