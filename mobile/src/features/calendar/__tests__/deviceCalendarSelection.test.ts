import AsyncStorage from '@react-native-async-storage/async-storage';

import { calendarShown, deviceCalendarSelection, selectedCalendarIds } from '../deviceCalendarSelection';

beforeEach(async () => {
  await AsyncStorage.clear();
  deviceCalendarSelection.setState({ owner: null, selection: null, loaded: false, revision: 0 });
});

describe('the phone-calendar choice (AppleCalendarSelection)', () => {
  it('means every calendar until something is saved, and none once an empty choice is saved', async () => {
    await deviceCalendarSelection.getState().load('u1');
    expect(deviceCalendarSelection.getState()).toMatchObject({ owner: 'u1', selection: null, loaded: true });
    expect(selectedCalendarIds(deviceCalendarSelection.getState())).toBeNull();
    expect(calendarShown(null, 'any')).toBe(true);

    await deviceCalendarSelection.getState().save('u1', []);
    expect(selectedCalendarIds(deviceCalendarSelection.getState())?.size).toBe(0);
    expect(calendarShown([], 'any')).toBe(false);
  });

  it('persists per account, sorted and deduplicated, and bumps the revision on every save', async () => {
    await deviceCalendarSelection.getState().save('u1', ['b', 'a', 'b']);
    expect(await AsyncStorage.getItem('nexdo.apple-calendar.selection.u1')).toBe('["a","b"]');
    expect(deviceCalendarSelection.getState().revision).toBe(1);

    await deviceCalendarSelection.getState().load('u2');
    expect(deviceCalendarSelection.getState().selection).toBeNull();
    await deviceCalendarSelection.getState().load('u1');
    expect(deviceCalendarSelection.getState().selection).toEqual(['a', 'b']);
  });

  it('ignores a corrupt saved value', async () => {
    await AsyncStorage.setItem('nexdo.apple-calendar.selection.u1', '{bad');
    await deviceCalendarSelection.getState().load('u1');
    expect(deviceCalendarSelection.getState()).toMatchObject({ selection: null, loaded: true });
  });

  it('drops a read that finished after the account changed', async () => {
    await AsyncStorage.setItem('nexdo.apple-calendar.selection.u1', '["x"]');
    const first = deviceCalendarSelection.getState().load('u1');
    await deviceCalendarSelection.getState().load('u2');
    await first;
    expect(deviceCalendarSelection.getState()).toMatchObject({ owner: 'u2', selection: null });
  });
});
