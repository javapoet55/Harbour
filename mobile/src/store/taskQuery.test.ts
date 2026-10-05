import { DEFAULT_TASK_QUERY } from '../lib/taskQuery';
import { useTaskQuery } from './taskQuery';

/** `model.taskQuery.beginSearch()` from the magnifier (RootView.swift:1792-1797, TaskQuery.swift:53-60). */
describe('useTaskQuery.beginSearch', () => {
  beforeEach(() => useTaskQuery.setState({ query: DEFAULT_TASK_QUERY }));

  it('opens a search across all dates, priorities and completion states', () => {
    useTaskQuery.getState().setQuery({ date: 'Tomorrow', historyRange: 'Last Month', status: 'Completed', priority: 'HIGH', search: 'old' });
    useTaskQuery.getState().beginSearch();
    expect(useTaskQuery.getState().query).toMatchObject({ date: 'All', historyRange: 'All time', status: 'All', priority: 'All', search: '' });
  });

  it('leaves earliestFirst untouched', () => {
    useTaskQuery.getState().setQuery({ earliestFirst: false });
    useTaskQuery.getState().beginSearch();
    expect(useTaskQuery.getState().query.earliestFirst).toBe(false);
  });
});
