import { fireEvent, render, screen } from '@testing-library/react-native';

import { TextField } from './TextField';

describe('TextField', () => {
  it('labels the input and reports typed text', async () => {
    const onChangeText = jest.fn();
    await render(<TextField label="Email" value="" onChangeText={onChangeText} />);
    expect(screen.getByText('Email')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Email'), 'a@b.co');
    expect(onChangeText).toHaveBeenCalledWith('a@b.co');
  });

  it('shows error text only when there is an error', async () => {
    const { rerender } = await render(<TextField label="Password" value="" />);
    expect(screen.queryByText('Enter your password.')).toBeNull();
    await rerender(<TextField label="Password" value="" error="Enter your password." />);
    expect(screen.getByText('Enter your password.')).toBeTruthy();
  });
});
