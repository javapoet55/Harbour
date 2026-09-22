import { fireEvent, render, screen } from '@testing-library/react-native';
import { Platform, StyleSheet } from 'react-native';

import { palettes } from '../theme';
import { ProjectAssignmentField } from './ProjectAssignmentField';
import { StickyFooter } from './StickyFooter';
import { DetailCheckbox, DetailMenu, DetailOutlineButton, DetailTextInput, SectionLabel } from './TaskDetailParts';
import { CreationCard, DatePill } from './TaskListParts';
import { Text } from './Text';

jest.mock('../query/useProjects', () => ({
  useProjects: () => ({ data: { projects: [] }, isError: false, isLoading: false, refetch: jest.fn() }),
}));

/**
 * The Android form chrome from docs/android-polish.md §2. Tests render in the light scheme, so the
 * expected colours are the light palette's. Each Android case has an iOS twin proving the Swift look
 * is untouched there.
 */
const light = palettes.light;
const onPlatform = (os: 'ios' | 'android') => jest.replaceProperty(Platform, 'OS', os);
const flat = (testID: string) => StyleSheet.flatten(screen.getByTestId(testID).props.style);

afterEach(() => jest.restoreAllMocks());

describe('Tasks screen parts on Android', () => {
  beforeEach(() => onPlatform('android'));

  it('never truncates a creation card title', async () => {
    await render(<CreationCard title="Add Manually" subtitle="Type a task" icon="plus" isVoice={false} onPress={jest.fn()} testID="card" />);
    expect(screen.getByText('Add Manually').props.numberOfLines).toBeUndefined();
    expect(flat('card')).toMatchObject({ flex: 0, alignSelf: 'stretch', minHeight: 72 });
  });

  it('draws a 36pt chip with 12 inside, selected or not', async () => {
    const { rerender } = await render(<DatePill filter="Today" count={2} selected={false} onPress={jest.fn()} />);
    const unselected = flat('date-pill-Today-surface');
    expect(unselected).toMatchObject({ height: 36, paddingHorizontal: 12 });

    await rerender(<DatePill filter="Today" count={2} selected onPress={jest.fn()} />);
    const selected = flat('date-pill-Today-surface');
    expect(selected).toMatchObject({ height: 36, paddingHorizontal: 12 });
  });
});

describe('Tasks screen parts on iOS', () => {
  beforeEach(() => onPlatform('ios'));

  it('keeps the one-line title and the side-by-side card', async () => {
    await render(<CreationCard title="Add Manually" subtitle="Type a task" icon="plus" isVoice={false} onPress={jest.fn()} testID="card" />);
    expect(screen.getByText('Add Manually').props.numberOfLines).toBe(1);
    expect(flat('card').flex).toBe(1);
  });

  it('keeps the 44pt pill', async () => {
    await render(<DatePill filter="Today" count={2} selected={false} onPress={jest.fn()} />);
    const pill = flat('date-pill-Today-surface');
    expect(pill).toMatchObject({ minHeight: 44, paddingHorizontal: 8 });
    expect(pill.height).toBeUndefined();
  });
});

describe('Task Details parts on Android', () => {
  beforeEach(() => onPlatform('android'));

  it('gives a text input the field hairline, surface and padding, and the accent on focus', async () => {
    await render(<DetailTextInput value="" onChangeText={jest.fn()} accessibilityLabel="Task title" testID="input" />);
    expect(flat('input')).toMatchObject({
      backgroundColor: light.fieldSurface,
      borderWidth: 1,
      borderColor: light.fieldBorder,
      borderRadius: 12,
      paddingVertical: 14,
      paddingHorizontal: 16,
    });

    await fireEvent(screen.getByTestId('input'), 'focus');
    expect(flat('input')).toMatchObject({ borderWidth: 1, borderColor: light.accent });
  });

  it('draws a dropdown as a field', async () => {
    await render(
      <DetailMenu label="Priority" accessibilityLabel="Priority" value="LOW" options={['LOW', 'HIGH']} display={(value) => value} onSelect={jest.fn()} testID="menu" />,
    );
    expect(flat('menu')).toMatchObject({ backgroundColor: light.fieldSurface, borderColor: light.fieldBorder, borderRadius: 12 });
  });

  it('draws the project field as a field', async () => {
    await render(<ProjectAssignmentField projectID={null} onChange={jest.fn()} />);
    expect(flat('project-field')).toMatchObject({ backgroundColor: light.fieldSurface, borderWidth: 1, borderColor: light.fieldBorder, borderRadius: 12 });
  });

  it('tracks out a section label', async () => {
    await render(<SectionLabel title="PRIORITY" />);
    expect(StyleSheet.flatten(screen.getByText('PRIORITY').props.style)).toMatchObject({
      color: light.fieldLabel,
      fontSize: 12,
      fontWeight: '600',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    });
  });

  it('outlines a secondary button in the accent, 48 tall', async () => {
    await render(<DetailOutlineButton title="Start task" onPress={jest.fn()} testID="start" />);
    expect(flat('start-surface')).toMatchObject({
      backgroundColor: light.accentTint,
      borderWidth: 1,
      borderColor: light.accentBorder,
      minHeight: 48,
    });
    expect(StyleSheet.flatten(screen.getByText('Start task').props.style).color).toBe(light.accent);
  });

  it('leaves the green Mark complete button alone', async () => {
    await render(<DetailOutlineButton title="Mark complete" greenBackground onPress={jest.fn()} testID="complete" />);
    expect(screen.queryByTestId('complete-surface')).toBeNull();
    expect(StyleSheet.flatten(screen.getByText('Mark complete').props.style).color).toBe('#FFFFFF');
  });

  it('gives the checkbox row the card hairline and surface', async () => {
    await render(<DetailCheckbox title="Important reminders" subtitle="Use escalation channels" value={false} onChange={jest.fn()} testID="critical" />);
    expect(flat('critical')).toMatchObject({ backgroundColor: light.fieldSurface, borderWidth: 1, borderColor: light.fieldBorder, padding: 16 });
  });

  it('raises a sticky footer over a top hairline', async () => {
    await render(
      <StickyFooter background={light.surface} testID="bar">
        <Text>Create Task</Text>
      </StickyFooter>,
    );
    expect(flat('bar')).toMatchObject({ backgroundColor: light.barSurface, borderTopWidth: 1, borderTopColor: light.fieldBorder });
  });
});

describe('Task Details parts on iOS', () => {
  beforeEach(() => onPlatform('ios'));

  it('keeps the Swift input: page colour, indigo hairline, blue 2pt focus ring', async () => {
    await render(<DetailTextInput value="" onChangeText={jest.fn()} accessibilityLabel="Task title" testID="input" />);
    expect(flat('input')).toMatchObject({ backgroundColor: light.background, borderRadius: 13, paddingVertical: 11, paddingHorizontal: 14 });

    await fireEvent(screen.getByTestId('input'), 'focus');
    expect(flat('input')).toMatchObject({ borderWidth: 2, borderColor: '#0594F5' });
  });

  it('keeps the Swift outline button', async () => {
    await render(<DetailOutlineButton title="Start task" onPress={jest.fn()} testID="start" />);
    expect(flat('start-surface')).toMatchObject({ backgroundColor: light.background, minHeight: 44 });
    expect(StyleSheet.flatten(screen.getByText('Start task').props.style).color).toBe(light.ink);
  });

  it('keeps the untracked section label', async () => {
    await render(<SectionLabel title="PRIORITY" />);
    expect(StyleSheet.flatten(screen.getByText('PRIORITY').props.style).letterSpacing).toBeUndefined();
  });
});
