import { fireEvent, render, screen } from '@testing-library/react-native';

import type { TodayRange, TodayScheduleItem } from '../lib/todaySchedule';
import { TodayIntelligenceCard } from './TodayIntelligenceCard';

/**
 * d568989 (RootView.swift:1502-1645): Today shows three schedule rows, and "View N more" expands the
 * card in place — "Show less" folds it — instead of opening Calendar. A new range folds it again.
 */

function item(index: number): TodayScheduleItem {
  return {
    id: `t${index}`,
    sourceId: `t${index}`,
    title: `Task ${index}`,
    dateValue: `2026-10-12T1${index}:00:00Z`,
    timeLabel: `${index}:00 AM`,
    detail: '30 min',
    task: { id: `t${index}`, title: `Task ${index}`, status: 'PLANNED', priority: 'NORMAL', durationMin: 30 },
    isPast: false,
  };
}

const schedule = [1, 2, 3, 4, 5].map(item);

function card(range: TodayRange, onCalendar = jest.fn(), rows = schedule) {
  return (
    <TodayIntelligenceCard
      range={range}
      appointments={0}
      taskCount={rows.length}
      schedule={rows}
      searchSchedule={rows}
      onOpenTask={jest.fn()}
      onAttention={jest.fn()}
      onCalendar={onCalendar}
    />
  );
}

it('shows three rows, then expands in place and folds back', async () => {
  const onCalendar = jest.fn();
  await render(card(1, onCalendar));
  expect(screen.queryByText('Task 3')).toBeTruthy();
  expect(screen.queryByText('Task 4')).toBeNull();
  const button = screen.getByTestId('today-schedule-expand');
  expect(button).toHaveTextContent('View 2 more');
  expect(button.props.accessibilityHint).toBe('Shows all schedule items here');

  await fireEvent.press(button);
  expect(screen.queryByText('Task 5')).toBeTruthy();
  expect(screen.getByTestId('today-schedule-expand')).toHaveTextContent('Show less');
  expect(screen.getByTestId('today-schedule-expand').props.accessibilityHint).toBe('Shows the first three schedule items');
  expect(onCalendar).not.toHaveBeenCalled();

  await fireEvent.press(screen.getByTestId('today-schedule-expand'));
  expect(screen.queryByText('Task 4')).toBeNull();
});

it('folds again when the range changes', async () => {
  const view = await render(card(1));
  await fireEvent.press(screen.getByTestId('today-schedule-expand'));
  expect(screen.queryByText('Task 5')).toBeTruthy();
  await view.rerender(card(3));
  expect(screen.queryByText('Task 5')).toBeNull();
  expect(screen.getByTestId('today-schedule-expand')).toHaveTextContent('View 2 more');
});

it('has no button for three rows or fewer', async () => {
  await render(card(1, jest.fn(), schedule.slice(0, 3)));
  expect(screen.queryByTestId('today-schedule-expand')).toBeNull();
});

/** 9acb39a (RootView.swift:1697-1707): "Your schedule is clear" creates a task; the search's empty state does not. */
describe('the empty schedule', () => {
  const empty = (onCreateTask: jest.Mock) => (
    <TodayIntelligenceCard
      range={1}
      appointments={0}
      taskCount={0}
      schedule={[]}
      searchSchedule={[]}
      onOpenTask={jest.fn()}
      onAttention={jest.fn()}
      onCalendar={jest.fn()}
      onCreateTask={onCreateTask}
    />
  );

  it('is a button that opens the manual task editor', async () => {
    const onCreateTask = jest.fn();
    await render(empty(onCreateTask));
    const button = screen.getByTestId('today-empty-schedule-create-task');
    expect(button.props.accessibilityLabel).toBe('Your schedule is clear. Create a task');
    expect(button.props.accessibilityHint).toBe('Opens the manual task creation screen');
    expect(screen.getByText('Add a task or enjoy the open space.')).toBeTruthy();
    await fireEvent.press(button);
    expect(onCreateTask).toHaveBeenCalledTimes(1);
  });

  it('stays static while searching', async () => {
    const onCreateTask = jest.fn();
    await render(empty(onCreateTask));
    await fireEvent.press(screen.getByLabelText('Search tasks'));
    await fireEvent.changeText(screen.getByTestId('today-search-input'), 'nothing');
    expect(screen.queryByTestId('today-empty-schedule-create-task')).toBeNull();
    expect(screen.getByText('No matching tasks')).toBeTruthy();
  });
});
