import { fireEvent, render, screen } from '@testing-library/react-native';

import { Button } from './Button';

describe('Button', () => {
  it('renders its title as an accessible button and handles presses', async () => {
    const onPress = jest.fn();
    await render(<Button title="Save" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('shows a spinner and ignores presses while loading', async () => {
    const onPress = jest.fn();
    await render(<Button title="Save" onPress={onPress} loading testID="save" />);
    expect(screen.getByTestId('save-spinner')).toBeTruthy();
    expect(screen.queryByText('Save')).toBeNull();
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });
});
