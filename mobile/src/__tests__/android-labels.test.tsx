import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Platform, StyleSheet } from 'react-native';

import { ProjectEditorForm } from '../components/ProjectEditorForm';
import { SectionLabel } from '../components/TaskDetailParts';
import { MomentCard } from '../features/moments/components';
import { DateField, FormRow, FormSection, MenuPicker } from '../features/moments/form';
import { NewListSheet } from '../features/shopping/sheets';
import { useAppearance } from '../store/appearance';
import { useSession } from '../store/session';
import { palettes, type ColorScheme } from '../theme';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({}),
  useNavigation: () => ({}),
}));

jest.mock('expo-crypto', () => ({
  ...jest.requireActual('expo-crypto'),
  randomUUID: () => '11111111-2222-3333-4444-555555555555',
}));

jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  endpoints: {
    projects: jest.fn(() => Promise.resolve({ projects: [], unassignedTaskCount: 0 })),
    createTask: jest.fn(),
    createCalendarEvent: jest.fn(),
  },
}));

import NewTask from '../../app/task/new';
import NewCalendarEvent from '../../app/calendar/event/new';

/**
 * docs/android-polish.md §4: chip rows on New Task and New Event, the one shared field label, the
 * New Task NOTES field, and the field chrome on New List and the Moments value pills. DARK mode,
 * where the field surfaces differ from one another.
 */
const dark = palettes.dark;
const flat = (testID: string) => StyleSheet.flatten(screen.getByTestId(testID).props.style);
const textStyle = (text: string) => StyleSheet.flatten(screen.getByText(text).props.style);
const onPlatform = (os: 'ios' | 'android') => jest.replaceProperty(Platform, 'OS', os);
const label = { fontSize: 12, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase', color: dark.fieldLabel };

async function wrap(node: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
  const view = await render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
  // Let New Task's projects query settle inside act().
  await act(async () => {});
  return view;
}

beforeEach(() => {
  useAppearance.setState({ appearance: 'night' });
  useSession.setState({ status: 'signedIn', profile: { id: 'u1', name: 'Sri Ram', email: 'a@b.com', timeZone: 'Asia/Kolkata' } });
});

afterEach(() => {
  jest.restoreAllMocks();
  useAppearance.setState({ appearance: 'system' });
});

/** WCAG 2 relative luminance of an opaque #RRGGBB colour. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('the field label colour', () => {
  it.each<ColorScheme>(['light', 'dark'])('reads at 4.5:1 or better on every page, card and sheet surface (%s)', (scheme) => {
    const colors = palettes[scheme];
    expect(colors.fieldLabel).toMatch(/^#[0-9A-F]{6}$/i);
    for (const surface of [
      colors.background,
      colors.groupedBackground,
      colors.surface,
      colors.backgroundElevated,
      colors.groupedBackgroundElevated,
      colors.surfaceElevated,
      colors.fieldSurface,
      colors.fieldSurfaceElevated,
      colors.glassSolid,
    ]) {
      expect(contrast(colors.fieldLabel, surface)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('is a grey on dark, not the indigo accent', () => {
    const [r, g, b] = [1, 3, 5].map((at) => parseInt(dark.fieldLabel.slice(at, at + 2), 16));
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(16);
    expect(dark.fieldLabel).not.toBe(dark.accent);
  });
});

describe('New Task on Android', () => {
  beforeEach(() => onPlatform('android'));

  it('scrolls DATE and TIME ESTIMATE as chip rows', async () => {
    await wrap(<NewTask />);
    for (const id of ['date-choices', 'duration-choices']) {
      const row = screen.getByTestId(id);
      expect(row.props.horizontal).toBe(true);
      expect(row.props.showsHorizontalScrollIndicator).toBe(false);
      expect(StyleSheet.flatten(row.props.contentContainerStyle)).toMatchObject({ gap: 8, paddingHorizontal: 16 });
      expect(StyleSheet.flatten(row.props.style)).toMatchObject({ marginHorizontal: -20 });
    }
    // Content-width chips, 36 tall with 12 inside; "Select Date" never wraps.
    expect(flat('date-Select Date')?.flex).toBeUndefined();
    expect(flat('date-Select Date-surface')).toMatchObject({ height: 36, paddingHorizontal: 12 });
    expect(flat('date-Today-surface')).toMatchObject({ height: 36, paddingHorizontal: 12 });
    expect(screen.getByText('Select Date').props.numberOfLines).toBe(1);
  });

  it('draws every icon label in the shared label style', async () => {
    await wrap(<NewTask />);
    for (const text of ['TASK NAME', 'NOTES', 'PROJECT', 'DATE', 'TIME ESTIMATE']) {
      expect(textStyle(text)).toMatchObject(label);
    }
  });

  it('makes the collapsed NOTES preview a field that opens the notes', async () => {
    await wrap(<NewTask />);
    expect(flat('notes-preview')).toMatchObject({ backgroundColor: dark.fieldSurfaceElevated, borderWidth: 1, borderColor: dark.fieldBorder, borderRadius: 12 });
    expect(screen.getByText('Add a note (optional)')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('notes-preview'));
    expect(screen.getByTestId('task-notes')).toBeTruthy();
    expect(screen.queryByTestId('notes-preview')).toBeNull();

    // The label row collapses them again, as the disclosure does.
    await fireEvent.press(screen.getByTestId('notes-disclosure'));
    expect(screen.queryByTestId('task-notes')).toBeNull();
  });
});

describe('New Task on iOS', () => {
  beforeEach(() => onPlatform('ios'));

  it('keeps the equal-width buttons, the tinted labels and the disclosure', async () => {
    await wrap(<NewTask />);
    expect(screen.queryByTestId('date-choices')).toBeNull();
    expect(flat('date-Select Date')).toMatchObject({ flex: 1 });
    expect(screen.getByText('Select Date').props.numberOfLines).toBeUndefined();
    expect(textStyle('TASK NAME')).toMatchObject({ letterSpacing: 0.8, color: dark.tint });
    expect(textStyle('TASK NAME').textTransform).toBeUndefined();
    expect(screen.queryByTestId('notes-preview')).toBeNull();
    expect(screen.getByText('Add a note (optional)')).toBeTruthy();
  });
});

describe('New Event on Android', () => {
  beforeEach(() => onPlatform('android'));

  it('draws its labels in the shared style and scrolls the weekdays as a chip row', async () => {
    await wrap(<NewCalendarEvent />);
    for (const text of ['APPOINTMENT / EVENT', 'SCHEDULE', 'REPEAT', 'LOCATION', 'NOTES']) {
      expect(textStyle(text)).toMatchObject(label);
    }

    // The Repeat dropdown is a field too.
    expect(flat('event-repeat')).toMatchObject({ backgroundColor: dark.fieldSurfaceElevated, borderWidth: 1, borderColor: dark.fieldBorder, borderRadius: 12 });

    await fireEvent.press(screen.getByTestId('event-repeat'));
    await fireEvent.press(screen.getByTestId('event-repeat-weekdays'));
    const row = screen.getByTestId('event-weekdays');
    expect(row.props.horizontal).toBe(true);
    expect(StyleSheet.flatten(row.props.contentContainerStyle)).toMatchObject({ gap: 8, paddingHorizontal: 16 });
    expect(flat('event-weekday-1')).toMatchObject({ height: 36, paddingHorizontal: 12, flexGrow: 0 });
    expect(screen.getByText('Mon').props.numberOfLines).toBe(1);
  });
});

describe('New Event on iOS', () => {
  beforeEach(() => onPlatform('ios'));

  it('keeps the wrapping weekday grid and the accent labels', async () => {
    await wrap(<NewCalendarEvent />);
    expect(textStyle('SCHEDULE').textTransform).toBeUndefined();
    expect(flat('event-repeat').borderWidth).toBeUndefined();
    await fireEvent.press(screen.getByTestId('event-repeat'));
    await fireEvent.press(screen.getByTestId('event-repeat-weekdays'));
    expect(screen.queryByTestId('event-weekdays')).toBeNull();
    expect(flat('event-weekday-1')).toMatchObject({ flexGrow: 1, flexBasis: 64, minHeight: 44 });
  });
});

describe('the shared label elsewhere on Android', () => {
  beforeEach(() => onPlatform('android'));

  it('is the Task Details section label', async () => {
    await render(<SectionLabel title="PRIORITY" />);
    expect(textStyle('PRIORITY')).toMatchObject(label);
  });

  it('is the Moments / Shopping form section header, 20 above its group', async () => {
    await render(
      <FormSection header="Item Image" testID="section">
        <FormRow last>
          <></>
        </FormRow>
      </FormSection>,
    );
    expect(flat('section-header')).toMatchObject({ ...label, marginTop: 20 });
    // The text itself is unchanged; only its drawing is uppercase.
    expect(screen.getByText('Item Image')).toBeTruthy();
  });

  it('is the project editor section header, over a form group', async () => {
    await render(<ProjectEditorForm name="" color="#8875ff" onNameChange={jest.fn()} onColorChange={jest.fn()} saving={false} error={null} onRetry={jest.fn()} />);
    expect(textStyle('Project name')).toMatchObject({ ...label, marginBottom: 8 });
    expect(StyleSheet.flatten(screen.getAllByTestId('project-section')[0].props.style)).toMatchObject({ backgroundColor: dark.fieldSurface, borderWidth: 1, borderColor: dark.fieldBorder });
  });
});

describe('the Moments value pills on Android', () => {
  beforeEach(() => onPlatform('android'));

  const at = Date.parse('2026-09-22T04:30:00.000Z');
  const options = [
    { value: 'a', title: 'None' },
    { value: 'b', title: '1 day before' },
  ];

  it('take the in-group field surface inside a form group', async () => {
    await render(
      <FormSection testID="section">
        <FormRow>
          <DateField label="Date" value={at} onChange={jest.fn()} zone="Asia/Kolkata" includeTime testID="date" />
        </FormRow>
        <FormRow last>
          <MenuPicker label="Prepare reminder" options={options} value="a" onChange={jest.fn()} testID="menu" />
        </FormRow>
      </FormSection>,
    );
    const pill = { backgroundColor: dark.fieldOnGroup, borderWidth: 1, borderColor: dark.fieldBorder, borderRadius: 12 };
    expect(flat('date')).toMatchObject(pill);
    expect(flat('date-time')).toMatchObject(pill);
    expect(flat('menu-pill')).toMatchObject(pill);
    // One step above the group itself.
    expect(dark.fieldOnGroup).not.toBe(dark.fieldSurface);
  });

  it('do the same in a grouped Moment card', async () => {
    await render(
      <MomentCard grouped>
        <DateField label="Date" value={at} onChange={jest.fn()} zone="Asia/Kolkata" testID="date" />
      </MomentCard>,
    );
    expect(flat('date')).toMatchObject({ backgroundColor: dark.fieldOnGroup, borderWidth: 1 });
  });

  it('stay as they were outside a form (the Moments filter menu)', async () => {
    await render(<MenuPicker label="Filter" options={options} value="a" onChange={jest.fn()} testID="menu" hideLabel />);
    expect(screen.queryByTestId('menu-pill')).toBeNull();
  });
});

describe('New List on Android', () => {
  beforeEach(() => onPlatform('android'));

  it('labels the name, and makes it and the date pill raised fields on the card', async () => {
    await render(<NewListSheet visible onCreated={jest.fn()} onClose={jest.fn()} />);
    expect(textStyle('List Name')).toMatchObject(label);
    expect(flat('shopping-list-name')).toMatchObject({ backgroundColor: dark.fieldSurfaceElevated, borderWidth: 1, borderColor: dark.fieldBorder, borderRadius: 12 });
    await fireEvent(screen.getByTestId('shopping-list-name'), 'focus');
    expect(flat('shopping-list-name')).toMatchObject({ borderColor: dark.accent });
    expect(flat('shopping-list-date')).toMatchObject({ backgroundColor: dark.fieldSurfaceElevated, borderWidth: 1 });
  });
});

describe('the shared label elsewhere on iOS', () => {
  beforeEach(() => onPlatform('ios'));

  it('leaves the form header, the value pills and New List as they were', async () => {
    await render(
      <FormSection header="Item Image" testID="section">
        <FormRow last>
          <MenuPicker label="Prepare reminder" options={[{ value: 'a', title: 'None' }]} value="a" onChange={jest.fn()} testID="menu" />
        </FormRow>
      </FormSection>,
    );
    expect(flat('section-header').textTransform).toBeUndefined();
    expect(flat('section-header').marginTop).toBe(16);
    expect(screen.queryByTestId('menu-pill')).toBeNull();
  });

  it('keeps New List’s headline label and plain name field', async () => {
    await render(<NewListSheet visible onCreated={jest.fn()} onClose={jest.fn()} />);
    expect(textStyle('List Name').textTransform).toBeUndefined();
    expect(flat('shopping-list-name').borderWidth).toBeUndefined();
  });
});
