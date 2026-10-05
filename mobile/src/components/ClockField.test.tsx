import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { clockLabel } from '../lib/profileSettings';
import { ClockField } from './SettingsControls';

/**
 * `ClockField`: Account's working-hours field by default, and — for Phase 12's `.hourAndMinute` pickers
 * (Nutrition, shopping email, connect calls) — a 12-hour display and a form-row layout. The value is
 * always "HH:mm".
 */

function Field(props: Partial<Parameters<typeof ClockField>[0]> & { onChange?: (next: string) => void }) {
  return <ClockField label="Start" value="09:30" onChange={jest.fn()} testID="clock" {...props} />;
}

describe('the default (Account working hours) is unchanged', () => {
  it('shows a caption over the stored value, with 24 hour and 60 minute wheels', async () => {
    const onChange = jest.fn();
    await render(<Field onChange={onChange} />);
    expect(screen.getByText('Start')).toBeTruthy();
    expect(screen.getByTestId('clock')).toHaveTextContent('09:30');
    expect(screen.getByLabelText('Start, 09:30')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('clock'));
    expect(screen.getByTestId('clock-hour-23')).toHaveTextContent('23');
    expect(screen.queryByTestId('clock-hour-24')).toBeNull();
    expect(screen.getByTestId('clock-minute-59')).toHaveTextContent('59');
    expect(screen.queryByTestId('clock-period-0')).toBeNull();
    await fireEvent.press(screen.getByTestId('clock-hour-17'));
    expect(onChange).toHaveBeenLastCalledWith('17:30');
    await fireEvent.press(screen.getByTestId('clock-minute-5'));
    expect(onChange).toHaveBeenLastCalledWith('09:05');
  });

  it('keeps its bordered field look', async () => {
    await render(<Field />);
    const style = StyleSheet.flatten(screen.getByTestId('clock').props.style);
    expect(style.borderWidth).toBe(StyleSheet.hairlineWidth);
    expect(style.minHeight).toBe(40);
  });
});

describe('12-hour display', () => {
  it.each([
    ['20:00', '8:00 PM'],
    ['00:05', '12:05 AM'],
    ['12:00', '12:00 PM'],
    ['09:30', '9:30 AM'],
    ['23:59', '11:59 PM'],
  ])('shows %s as %s', (value, label) => {
    expect(clockLabel(value, 'h12')).toBe(label);
    expect(clockLabel(value)).toBe(value);
  });

  it('picks hours 12, 1 … 11 within the half of the day and switches AM/PM, keeping HH:mm', async () => {
    const onChange = jest.fn();
    await render(<Field value="20:15" hourCycle="h12" onChange={onChange} />);
    expect(screen.getByTestId('clock')).toHaveTextContent('8:15 PM');
    await fireEvent.press(screen.getByTestId('clock'));
    expect(screen.getByTestId('clock-hour-0')).toHaveTextContent('12');
    expect(screen.queryByTestId('clock-hour-12')).toBeNull();
    expect(screen.getByTestId('clock-hour-8').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId('clock-period-1').props.accessibilityState).toEqual({ selected: true });
    await fireEvent.press(screen.getByTestId('clock-hour-0'));
    expect(onChange).toHaveBeenLastCalledWith('12:15');
    await fireEvent.press(screen.getByTestId('clock-hour-9'));
    expect(onChange).toHaveBeenLastCalledWith('21:15');
    await fireEvent.press(screen.getByTestId('clock-period-0'));
    expect(onChange).toHaveBeenLastCalledWith('08:15');
  });
});

describe('form-row variant', () => {
  it('puts the label on the left and the value in a pill', async () => {
    await render(<Field variant="formRow" hourCycle="h12" label="Send time" value="10:00" />);
    expect(screen.getByText('Send time')).toBeTruthy();
    expect(screen.getByLabelText('Send time, 10:00 AM')).toBeTruthy();
    const pill = StyleSheet.flatten(screen.getByTestId('clock').props.style);
    expect(pill.borderRadius).toBe(999);
    expect(pill.borderWidth).toBeUndefined();
  });
});
