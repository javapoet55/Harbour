import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import type { NexdoTask } from '../api/types';
import { resolveCategory } from '../lib/taskCategory';
import { NexdoTaskBackdrop } from './NexdoTaskBackdrop';
import { TaskBadge } from './TaskBadge';
import { DISTANT_FUTURE } from '../lib/taskQuery';
import { brand } from '../theme';
import { TaskCard, taskIcon, taskIconColor } from './TaskCard';
import { TaskCategoryBadge } from './TaskCategoryBadge';
import { CreationCard, DatePill, HeaderButton, SectionHeader, sectionDateLabel, TASK_ACCENT, TaskEmptyState, TaskTabs } from './TaskListParts';

const ZONE = 'Asia/Kolkata';

function task(overrides: Partial<NexdoTask> = {}): NexdoTask {
  return {
    id: 't1',
    title: 'Renew passport',
    status: 'PLANNED',
    priority: 'MEDIUM',
    durationMin: 30,
    startAt: '2026-09-16T03:30:00.000Z',
    ...overrides,
  };
}

describe('TaskCard', () => {
  it('renders the title and a plain subtitle, with no category badge (RootView.swift:1938-1940)', async () => {
    await render(<TaskCard task={task()} timeZone={ZONE} onToggle={jest.fn()} onOpen={jest.fn()} />);

    expect(screen.getByText('Renew passport')).toBeTruthy();
    expect(screen.getByText('9:00 AM · 30 min')).toBeTruthy();
    expect(screen.queryByLabelText(/^Category:/)).toBeNull();
    expect(StyleSheet.flatten(screen.getByText('Renew passport').props.style)).toMatchObject({ fontSize: 15, fontWeight: '500' });
  });

  it('draws the keyword icon tile, hidden from assistive technology', async () => {
    await render(<TaskCard task={task({ title: 'Email the landlord' })} timeZone={ZONE} onToggle={jest.fn()} onOpen={jest.fn()} />);
    const tile = screen.getByTestId('task-icon-t1', { includeHiddenElements: true });
    expect(tile.props.accessibilityElementsHidden).toBe(true);
    expect(StyleSheet.flatten(tile.props.style)).toMatchObject({ width: 44, height: 44, borderRadius: 14 });
    expect(screen.getByTestId('task-icon-t1-envelope', { includeHiddenElements: true })).toBeTruthy();
  });

  it('labels the toggle Complete when open and Restore when done', async () => {
    const { rerender } = await render(<TaskCard task={task()} timeZone={ZONE} onToggle={jest.fn()} onOpen={jest.fn()} />);
    expect(screen.getByLabelText('Complete Renew passport')).toBeTruthy();

    await rerender(<TaskCard task={task({ status: 'COMPLETED' })} timeZone={ZONE} onToggle={jest.fn()} onOpen={jest.fn()} />);
    expect(screen.getByLabelText('Restore Renew passport')).toBeTruthy();
  });

  it('strikes the title through when the task is done', async () => {
    await render(<TaskCard task={task({ status: 'COMPLETED' })} timeZone={ZONE} onToggle={jest.fn()} onOpen={jest.fn()} />);
    const title = screen.getByText('Renew passport');
    expect(JSON.stringify(title.props.style)).toContain('line-through');
  });

  it('calls onToggle and onOpen from their own hit areas', async () => {
    const onToggle = jest.fn();
    const onOpen = jest.fn();
    await render(<TaskCard task={task()} timeZone={ZONE} onToggle={onToggle} onOpen={onOpen} />);

    await fireEvent.press(screen.getByTestId('task-toggle-t1'));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('task-open-t1'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('disables the toggle while a write is in flight, as model.busy does', async () => {
    const onToggle = jest.fn();
    await render(<TaskCard task={task()} timeZone={ZONE} busy onToggle={onToggle} onOpen={jest.fn()} />);

    expect(screen.getByTestId('task-toggle-t1').props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByTestId('task-toggle-t1'));
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('shows the project name only when the task has a project', async () => {
    const { rerender } = await render(<TaskCard task={task()} timeZone={ZONE} onToggle={jest.fn()} onOpen={jest.fn()} />);
    expect(screen.queryByText('Home move')).toBeNull();

    await rerender(
      <TaskCard
        task={task({ projectId: 'p1' })}
        timeZone={ZONE}
        project={{ id: 'p1', name: 'Home move', color: '#8875ff', createdAt: '', updatedAt: '', completedTaskCount: 0, totalTaskCount: 3 }}
        onToggle={jest.fn()}
        onOpen={jest.fn()}
      />,
    );
    expect(screen.getByText('Home move')).toBeTruthy();
  });

  it('fits the 21pt checkbox in a 32x44 hit area', async () => {
    await render(<TaskCard task={task()} timeZone={ZONE} onToggle={jest.fn()} onOpen={jest.fn()} />);
    expect(StyleSheet.flatten(screen.getByTestId('task-toggle-t1').props.style)).toMatchObject({ width: 32, height: 44 });
  });
});

/** `TasksView.taskIcon(_:)` (RootView.swift:1959-1967). */
describe('taskIcon', () => {
  it.each([
    ['Email alex@example.com', 'envelope', 'pink'],
    ['Reply to the message', 'envelope', 'pink'],
    ['Contact Plumbers', 'wrench', 'nexdoBlue'],
    ['Book a handyman', 'wrench', 'nexdoBlue'],
    ['Repair the fence', 'wrench', 'nexdoBlue'],
    ['Find an electrician', 'wrench', 'nexdoBlue'],
    ['Contact Gutter technician', 'phone', 'green'],
    ['Call mom', 'phone', 'green'],
    ['Return my laptop at Best Buy', 'laptopcomputer', 'orange'],
    ['Back up the computer', 'laptopcomputer', 'orange'],
    ['Client meeting', 'calendar', 'purple'],
    ['Dentist appointment', 'calendar', 'purple'],
    ['Prepare Q3 deck', 'doc.text', 'nexdoBlue'],
  ])('%s → %s in %s', (title, symbol, tint) => {
    expect(taskIcon({ title })).toEqual({ symbol, tint });
  });

  it('matches whole words, with common endings, not any substring (Android ahead of iOS)', () => {
    expect(taskIcon({ title: 'Recall the order' }).symbol).toBe('doc.text');
    expect(taskIcon({ title: 'Read the contactless card terms' }).symbol).toBe('doc.text');
    expect(taskIcon({ title: 'Calling the bank' }).symbol).toBe('phone');
    expect(taskIcon({ title: 'Find a plumber' }).symbol).toBe('wrench');
    expect(taskIcon({ title: 'Two meetings with HR' }).symbol).toBe('calendar');
    expect(taskIcon({ title: 'Answer emails' }).symbol).toBe('envelope');
  });

  it('checks the keywords in Swift order: email before call', () => {
    expect(taskIcon({ title: 'Email to call back' }).symbol).toBe('envelope');
  });

  it('resolves nexdoBlue to the brand blue and the system colours per scheme', () => {
    expect(taskIconColor('nexdoBlue', 'dark')).toBe(brand.nexdoBlue);
    expect(taskIconColor('pink', 'light')).toBe('#FF2D55');
    expect(taskIconColor('green', 'dark')).toBe('#30D158');
  });
});

describe('TaskTabs', () => {
  it('marks the selected tab and draws it on the accent gradient', async () => {
    await render(<TaskTabs projects={false} onChange={jest.fn()} />);
    expect(screen.getByTestId('segment-Tasks').props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId('segment-Projects').props.accessibilityState.selected).toBe(false);
    expect(screen.getByTestId('segment-Tasks-selected')).toBeTruthy();
    expect(screen.queryByTestId('segment-Projects-selected')).toBeNull();
    expect(StyleSheet.flatten(screen.getByText('Tasks').props.style)).toMatchObject({ color: '#FFFFFF', fontSize: 15, fontWeight: '600' });
  });

  it('reports the chosen tab', async () => {
    const onChange = jest.fn();
    await render(<TaskTabs projects={false} onChange={onChange} />);
    await fireEvent.press(screen.getByTestId('segment-Projects'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('uses the purple → indigo → blue accent (RootView.swift:1684)', () => {
    expect(TASK_ACCENT).toEqual(['#AD33FF', brand.nexdoIndigo, '#5C75FF']);
  });
});

describe('TaskCategoryBadge', () => {
  it('renders the label and an accessible category description', async () => {
    await render(<TaskCategoryBadge appearance={resolveCategory('Client meeting')} />);
    expect(screen.getByText('Work')).toBeTruthy();
    expect(screen.getByLabelText('Category: Work')).toBeTruthy();
  });
});

describe('TaskBadge', () => {
  it('renders its title', async () => {
    await render(<TaskBadge title="30 MIN" icon="clock" color="#3D29F0" />);
    expect(screen.getByText('30 MIN')).toBeTruthy();
  });
});

describe('DatePill', () => {
  it('shows the count for a dated filter', async () => {
    await render(<DatePill filter="Today" count={3} selected={false} onPress={jest.fn()} />);
    expect(screen.getByText('Today')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByLabelText('Today, 3 tasks')).toBeTruthy();
  });

  it('shows no count on the All pill, matching `if filter != .all`', async () => {
    await render(<DatePill filter="All" count={9} selected={false} onPress={jest.fn()} />);
    expect(screen.getByText('All')).toBeTruthy();
    expect(screen.queryByText('9')).toBeNull();
  });

  it('marks the selected pill for assistive technology', async () => {
    await render(<DatePill filter="Today" count={1} selected onPress={jest.fn()} />);
    expect(screen.getByTestId('date-pill-Today').props.accessibilityState.selected).toBe(true);
  });

  it('calls onPress', async () => {
    const onPress = jest.fn();
    await render(<DatePill filter="Tomorrow" count={0} selected={false} onPress={onPress} />);
    await fireEvent.press(screen.getByTestId('date-pill-Tomorrow'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('CreationCard', () => {
  it('renders the Swift copy for both cards', async () => {
    const { rerender } = await render(
      <CreationCard title="Add by Voice" subtitle="Tap and speak" icon="mic.fill" isVoice onPress={jest.fn()} />,
    );
    expect(screen.getByText('Add by Voice')).toBeTruthy();
    expect(screen.getByText('Tap and speak')).toBeTruthy();

    await rerender(<CreationCard title="Add Manually" subtitle="Type a task" icon="plus" isVoice={false} onPress={jest.fn()} />);
    expect(screen.getByText('Add Manually')).toBeTruthy();
    expect(screen.getByText('Type a task')).toBeTruthy();
  });

  it('draws the Add Manually glyph in nexdoBlue on a nexdoBlue 15% circle (RootView.swift:1835-1838)', async () => {
    await render(<CreationCard title="Add Manually" subtitle="Type a task" icon="plus" isVoice={false} onPress={jest.fn()} testID="add-manually" />);
    expect(StyleSheet.flatten(screen.getByTestId('add-manually-icon').props.style).backgroundColor).toBe('rgba(5, 148, 245, 0.15)');
  });
});

describe('SectionHeader', () => {
  it('shows the calendar glyph, the title and the date caption', async () => {
    await render(<SectionHeader title="Today" date="Wednesday, Sep 16" count={2} />);
    expect(screen.getByRole('header', { name: 'Today' })).toBeTruthy();
    expect(screen.getByText('Wednesday, Sep 16')).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByTestId('section-header').props.style)).toMatchObject({
      padding: 12,
      borderRadius: 16,
      backgroundColor: 'rgba(255, 255, 255, 0.65)',
    });
  });

  it('formats the date as "EEEE, MMM d" in the account zone, and omits it for unscheduled', () => {
    // 2026-09-15 18:30 UTC is midnight on Wednesday the 16th in Kolkata.
    expect(sectionDateLabel(Date.parse('2026-09-15T18:30:00.000Z'), ZONE)).toBe('Wednesday, Sep 16');
    expect(sectionDateLabel(DISTANT_FUTURE, ZONE)).toBeNull();
  });

  it('singularises the count', async () => {
    const { rerender } = await render(<SectionHeader title="Today" count={1} />);
    expect(screen.getByText('1 task')).toBeTruthy();

    await rerender(<SectionHeader title="Today" count={4} />);
    expect(screen.getByText('4 tasks')).toBeTruthy();
  });
});

describe('TaskEmptyState', () => {
  it('renders the title, the fixed description and the action', async () => {
    const onAdd = jest.fn();
    await render(<TaskEmptyState title="Nothing scheduled for today" onAdd={onAdd} />);

    expect(screen.getByText('Nothing scheduled for today')).toBeTruthy();
    expect(screen.getByText('Try another filter or add a task.')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Add Manually'));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });
});

describe('HeaderButton', () => {
  it('is labelled and pressable', async () => {
    const onPress = jest.fn();
    await render(<HeaderButton icon="slider.horizontal.3" label="Task filters" onPress={onPress} />);
    await fireEvent.press(screen.getByLabelText('Task filters'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('NexdoTaskBackdrop', () => {
  it('renders without touching the layout below it', async () => {
    await render(<NexdoTaskBackdrop />);
    // Purely decorative: it must not capture touches meant for the form on top of it.
    expect(screen.toJSON()).toBeTruthy();
  });
});
