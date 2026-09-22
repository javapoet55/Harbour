import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Platform, StyleSheet } from 'react-native';

import { FormField, FormRow, FormSection } from '../features/moments/form';
import { MomentCard, MomentSheet } from '../features/moments/components';
import { useAppearance } from '../store/appearance';
import { useSession } from '../store/session';
import { palettes } from '../theme';
import { Text } from '../components';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({}),
  useNavigation: () => ({}),
}));

jest.mock('expo-crypto', () => ({
  ...jest.requireActual('expo-crypto'),
  randomUUID: () => '11111111-2222-3333-4444-555555555555',
}));

const mockProjects = jest.fn();
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  endpoints: {
    projects: (...args: unknown[]) => mockProjects(...args),
    createTask: jest.fn(),
    createCalendarEvent: jest.fn(),
  },
}));

import NewTask from '../../app/task/new';
import NewCalendarEvent from '../../app/calendar/event/new';
import ResetPassword from '../../app/(auth)/reset-password';

/**
 * docs/android-polish.md §3: the Android field style on New Task, New Event, and the Moments /
 * Shopping / Reset password grouped forms. These run in DARK mode, where a raised field (on a card)
 * and a base field differ — in light mode both are #F2F2F7.
 */
const dark = palettes.dark;
const flat = (testID: string) => StyleSheet.flatten(screen.getByTestId(testID).props.style);
const onPlatform = (os: 'ios' | 'android') => jest.replaceProperty(Platform, 'OS', os);

function wrap(node: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
}

beforeEach(() => {
  jest.clearAllMocks();
  useAppearance.setState({ appearance: 'night' });
  useSession.setState({ status: 'signedIn', profile: { id: 'u1', name: 'Sri Ram', email: 'a@b.com', timeZone: 'Asia/Kolkata' } });
  mockProjects.mockResolvedValue({ projects: [], unassignedTaskCount: 0 });
});

afterEach(() => {
  jest.restoreAllMocks();
  useAppearance.setState({ appearance: 'system' });
});

const raisedField = { backgroundColor: dark.fieldSurfaceElevated, borderWidth: 1, borderColor: dark.fieldBorder, borderRadius: 12 };

describe('New Task on Android', () => {
  beforeEach(() => onPlatform('android'));

  it('draws the title and notes as raised fields, accent on focus', async () => {
    await wrap(<NewTask />);
    expect(flat('task-title')).toMatchObject({ ...raisedField, paddingVertical: 14, paddingHorizontal: 16 });

    await fireEvent(screen.getByTestId('task-title'), 'focus');
    expect(flat('task-title')).toMatchObject({ borderColor: dark.accent });
    await fireEvent(screen.getByTestId('task-title'), 'blur');
    expect(flat('task-title')).toMatchObject({ borderColor: dark.fieldBorder });

    await fireEvent.press(screen.getByTestId('notes-disclosure'));
    expect(flat('task-notes')).toMatchObject(raisedField);
  });

  it('gives the choice buttons, the stepper and the project field the raised field surface', async () => {
    await wrap(<NewTask />);
    // Unselected choices keep their own padding and take the surface, hairline and radius.
    expect(flat('date-Tomorrow-surface')).toMatchObject({ ...raisedField, minHeight: 44, paddingHorizontal: 6 });
    expect(flat('duration-15-surface')).toMatchObject(raisedField);
    // The selected choice keeps its gradient, in the same 12 radius.
    expect(flat('date-Today-surface')).toMatchObject({ borderRadius: 12 });
    expect(flat('duration-stepper')).toMatchObject({ ...raisedField, padding: 15 });
    await waitFor(() => expect(flat('project-field')).toMatchObject(raisedField));
  });
});

describe('New Task on iOS', () => {
  beforeEach(() => onPlatform('ios'));

  it('keeps the Swift fields', async () => {
    await wrap(<NewTask />);
    expect(flat('task-title')).toMatchObject({ backgroundColor: dark.groupedBackground, borderRadius: 15, padding: 16 });
    expect(flat('date-Tomorrow-surface')).toMatchObject({ backgroundColor: dark.groupedBackground, borderRadius: 13 });
    expect(flat('date-Today-surface').borderRadius).toBe(13);
  });
});

describe('New Event on Android', () => {
  beforeEach(() => onPlatform('android'));

  it('draws title, location and notes as raised fields, accent on focus', async () => {
    await wrap(<NewCalendarEvent />);
    for (const id of ['event-title', 'event-location', 'event-notes']) {
      expect(flat(id)).toMatchObject({ ...raisedField, paddingVertical: 14, paddingHorizontal: 16 });
    }
    await fireEvent(screen.getByTestId('event-location'), 'focus');
    expect(flat('event-location')).toMatchObject({ borderColor: dark.accent });
    expect(flat('event-notes')).toMatchObject({ borderColor: dark.fieldBorder });
  });

  it('gives the date capsules, the repeat list and the weekday chips the raised surface', async () => {
    await wrap(<NewCalendarEvent />);
    expect(flat('event-start-value')).toMatchObject({ ...raisedField, paddingHorizontal: 12, paddingVertical: 7 });
    expect(flat('event-end-value')).toMatchObject(raisedField);

    await fireEvent.press(screen.getByTestId('event-repeat'));
    expect(flat('event-repeat-menu')).toMatchObject(raisedField);
    await fireEvent.press(screen.getByTestId('event-repeat-weekdays'));

    expect(flat('event-repeat-until-value')).toMatchObject(raisedField);
    expect(flat('event-weekday-1')).toMatchObject(raisedField);
    await fireEvent.press(screen.getByTestId('event-weekday-1'));
    // A chosen weekday keeps its solid accent fill.
    expect(flat('event-weekday-1').borderWidth).toBeUndefined();
  });
});

describe('New Event on iOS', () => {
  beforeEach(() => onPlatform('ios'));

  it('keeps the Swift fill with no stroke', async () => {
    await wrap(<NewCalendarEvent />);
    expect(flat('event-title')).toMatchObject({ backgroundColor: '#2C2C2E', borderRadius: 15, padding: 15 });
    expect(flat('event-title').borderWidth).toBeUndefined();
    expect(flat('event-start-value').borderWidth).toBeUndefined();
  });
});

describe('Grouped forms on Android', () => {
  beforeEach(() => onPlatform('android'));

  it('draws a Form section as a group with 1px separators between rows', async () => {
    await render(
      <FormSection testID="section">
        <FormRow>
          <FormField placeholder="Item name" value="" onChangeText={jest.fn()} />
        </FormRow>
        <FormRow last>
          <FormField placeholder="Size" value="" onChangeText={jest.fn()} />
        </FormRow>
      </FormSection>,
    );
    expect(flat('section-body')).toMatchObject({ backgroundColor: dark.fieldSurface, borderWidth: 1, borderColor: dark.fieldBorder });
    // One separator, between the two rows; its inset is kept.
    const separators = screen.getAllByTestId('form-row-separator');
    expect(separators).toHaveLength(1);
    expect(StyleSheet.flatten(separators[0].props.style)).toMatchObject({ height: 1, backgroundColor: dark.fieldBorder, left: 16 });
  });

  it('lifts a section inside a sheet one step above the sheet', async () => {
    await render(
      <MomentSheet visible title="List Settings" onRequestClose={jest.fn()}>
        <FormSection testID="section">
          <FormRow last>
            <Text>List name</Text>
          </FormRow>
        </FormSection>
      </MomentSheet>,
    );
    expect(flat('section-body')).toMatchObject({ backgroundColor: dark.fieldSurfaceElevated });
  });

  it('turns a grouped Moment card into the form group, and leaves a plain one as glass', async () => {
    await render(
      <>
        <MomentCard grouped testID="grouped">
          <Text>Moment name</Text>
        </MomentCard>
        <MomentCard testID="plain">
          <Text>Summary</Text>
        </MomentCard>
      </>,
    );
    expect(flat('grouped-group')).toMatchObject({ backgroundColor: dark.fieldSurface, borderWidth: 1, borderColor: dark.fieldBorder, borderRadius: 22 });
    expect(screen.queryByTestId('plain-group')).toBeNull();
  });

  it('draws Reset password’s sections as groups above its sheet background', async () => {
    await wrap(<ResetPassword />);
    for (const section of screen.getAllByTestId('reset-section')) {
      expect(StyleSheet.flatten(section.props.style)).toMatchObject({ backgroundColor: dark.fieldSurfaceElevated, borderWidth: 1, borderColor: dark.fieldBorder });
    }
  });
});

describe('Grouped forms on iOS', () => {
  beforeEach(() => onPlatform('ios'));

  it('keeps the inset-grouped section, separator and glass card', async () => {
    await render(
      <>
        <FormSection testID="section">
          <FormRow>
            <Text>One</Text>
          </FormRow>
          <FormRow last>
            <Text>Two</Text>
          </FormRow>
        </FormSection>
        <MomentCard grouped testID="grouped">
          <Text>Moment name</Text>
        </MomentCard>
      </>,
    );
    expect(flat('section-body')).toMatchObject({ backgroundColor: dark.surface });
    expect(flat('section-body').borderWidth).toBeUndefined();
    expect(StyleSheet.flatten(screen.getByTestId('form-row-separator').props.style)).toMatchObject({ backgroundColor: dark.listSeparator });
    expect(screen.queryByTestId('grouped-group')).toBeNull();
  });

  it('keeps Reset password’s section', async () => {
    await wrap(<ResetPassword />);
    for (const section of screen.getAllByTestId('reset-section')) {
      expect(StyleSheet.flatten(section.props.style)).toMatchObject({ backgroundColor: dark.surfaceElevated });
      expect(StyleSheet.flatten(section.props.style).borderWidth).toBeUndefined();
    }
  });
});
