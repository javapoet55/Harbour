import { fireEvent, render, screen } from '@testing-library/react-native';

import type { NexdoTask } from '../api/types';
import { resolveCategory } from '../lib/taskCategory';
import { NexdoTaskBackdrop } from './NexdoTaskBackdrop';
import { TaskBadge } from './TaskBadge';
import { TaskCard } from './TaskCard';
import { TaskCategoryBadge } from './TaskCategoryBadge';
import { CreationCard, DatePill, HeaderButton, SectionHeader, TaskEmptyState } from './TaskListParts';

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
  it('renders the title, the subtitle and the category badge', async () => {
    await render(<TaskCard task={task()} timeZone={ZONE} onToggle={jest.fn()} onOpen={jest.fn()} />);

    expect(screen.getByText('Renew passport')).toBeTruthy();
    expect(screen.getByText('9:00 AM · 30 min')).toBeTruthy();
    // "Renew passport" infers travel, whose default label is Travel.
    expect(screen.getByLabelText('Category: Travel')).toBeTruthy();
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

  it("prefers the server's category name for the label", async () => {
    await render(<TaskCard task={task({ category: { name: 'Errands' } })} timeZone={ZONE} onToggle={jest.fn()} onOpen={jest.fn()} />);
    expect(screen.getByLabelText('Category: Errands')).toBeTruthy();
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
});

describe('SectionHeader', () => {
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
