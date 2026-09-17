import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import type { NexdoProject, NexdoTask } from '../api/types';
import { resetRevisions } from '../query/taskRevision';
import { useSession } from '../store/session';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockParams = jest.fn(() => ({}) as Record<string, string>);
jest.mock('expo-router', () => {
  const { View } = require('react-native') as typeof import('react-native');
  // The screens set their title and their toolbar buttons through `<Stack.Screen options>`, the way
  // Swift declares them on the view. Rendering the header items here keeps them reachable from the
  // tests instead of silently dropping them.
  function Screen({
    options,
  }: {
    options?: { headerLeft?: () => React.ReactNode; headerRight?: () => React.ReactNode };
  }) {
    return (
      <View>
        {options?.headerLeft?.()}
        {options?.headerRight?.()}
      </View>
    );
  }
  function StackRoot({ children }: { children?: React.ReactNode }) {
    return <View>{children}</View>;
  }
  return {
    router: { push: (...args: unknown[]) => mockPush(...args), replace: jest.fn(), back: (...args: unknown[]) => mockBack(...args) },
    useLocalSearchParams: () => mockParams(),
    Stack: Object.assign(StackRoot, { Screen }),
  };
});

const mockTasks = jest.fn();
const mockProjects = jest.fn();
const mockCreateProject = jest.fn();
const mockUpdateProject = jest.fn();
const mockDeleteProject = jest.fn();
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  endpoints: {
    tasks: (...args: unknown[]) => mockTasks(...args),
    projects: (...args: unknown[]) => mockProjects(...args),
    createProject: (...args: unknown[]) => mockCreateProject(...args),
    updateProject: (...args: unknown[]) => mockUpdateProject(...args),
    deleteProject: (...args: unknown[]) => mockDeleteProject(...args),
  },
}));

import NewProject from '../../app/project/new';
import EditProject from '../../app/project/[id]/edit';
import ProjectDetail from '../../app/project/[id]/index';
import { ProjectsList } from '../components/ProjectsList';

const ZONE = 'Asia/Kolkata';

function project(overrides: Partial<NexdoProject> & { id: string }): NexdoProject {
  return {
    name: 'A project',
    color: '#8875ff',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    completedTaskCount: 0,
    totalTaskCount: 0,
    ...overrides,
  };
}

function task(overrides: Partial<NexdoTask> & { id: string }): NexdoTask {
  return { title: 'A task', status: 'PLANNED', priority: 'MEDIUM', durationMin: 30, ...overrides };
}

const PROJECTS = [
  project({ id: 'p1', name: 'Home move', updatedAt: '2026-09-12T00:00:00.000Z', totalTaskCount: 4, completedTaskCount: 1 }),
  project({ id: 'p2', name: 'Zurich trip', color: '#35bce6', updatedAt: '2026-09-10T00:00:00.000Z', totalTaskCount: 2, completedTaskCount: 2 }),
];

const TASKS = [
  task({ id: 't1', title: 'Pack boxes', projectId: 'p1' }),
  task({ id: 't2', title: 'Book movers', projectId: 'p1', status: 'COMPLETED' }),
  task({ id: 't3', title: 'Unfiled errand' }),
];

function wrap(node: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
}

beforeEach(() => {
  jest.clearAllMocks();
  resetRevisions();
  mockParams.mockReturnValue({});
  useSession.setState({ status: 'signedIn', profile: { id: 'u1', name: 'Sri Ram', email: 'a@b.com', timeZone: ZONE } });
  mockTasks.mockResolvedValue({ tasks: TASKS, timeZone: ZONE });
  mockProjects.mockResolvedValue({ projects: PROJECTS, unassignedTaskCount: 1 });
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

/** `ProjectsView` (ios/App/ProjectsView.swift:12-75). */
describe('Projects list', () => {
  async function renderList() {
    const view = wrap(
      <ProjectsList
        tasks={TASKS}
        onOpenProject={mockPush}
        onOpenUnassigned={jest.fn()}
        onNewProject={jest.fn()}
        onRefresh={jest.fn()}
      />,
    );
    await waitFor(() => expect(mockProjects).toHaveBeenCalled());
    return view;
  }

  it('renders each project card with its open and done counts', async () => {
    await renderList();

    await waitFor(() => expect(screen.getByText('Home move')).toBeTruthy());
    // `Open: total - completed`, `Done: completed` (ProjectsView.swift:82).
    expect(screen.getByText('Open: 3   Done: 1')).toBeTruthy();
    expect(screen.getByText('Open: 0   Done: 2')).toBeTruthy();
  });

  it('shows the No project folder with the unassigned counts', async () => {
    await renderList();

    await waitFor(() => expect(screen.getByText('No project')).toBeTruthy());
    // One unassigned open task in the fixture, none done.
    expect(screen.getByText('Open: 1   Done: 0')).toBeTruthy();
  });

  it('filters by project name', async () => {
    await renderList();
    await waitFor(() => expect(screen.getByText('Home move')).toBeTruthy());

    await fireEvent.changeText(screen.getByTestId('project-search'), 'zurich');

    await waitFor(() => expect(screen.queryByText('Home move')).toBeNull());
    expect(screen.getByText('Zurich trip')).toBeTruthy();
  });

  it('re-sorts when a sort option is chosen', async () => {
    await renderList();
    await waitFor(() => expect(screen.getByText('Home move')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('project-sort'));
    await fireEvent.press(screen.getByTestId('project-sort-Most tasks'));

    // Only the order changes, so assert through the card order.
    await waitFor(() => {
      const names = screen.getAllByText(/Home move|Zurich trip/).map((node) => node.props.children);
      expect(names[0]).toBe('Home move');
    });
  });

  it('shows the Swift empty state when there are no projects', async () => {
    mockProjects.mockResolvedValue({ projects: [], unassignedTaskCount: 0 });
    await renderList();

    await waitFor(() => expect(screen.getByText('Organize your tasks')).toBeTruthy());
    expect(screen.getByText('Create a project to keep related tasks together.')).toBeTruthy();
  });

  it('opens a project card', async () => {
    await renderList();
    await waitFor(() => expect(screen.getByTestId('project-card-p1')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('project-card-p1'));
    expect(mockPush).toHaveBeenCalledWith('p1');
  });
});

/** `ProjectEditorView` (ProjectsView.swift:112-171). */
describe('Project editor', () => {
  it('keeps Done disabled until the name is valid', async () => {
    await wrap(<NewProject />);
    expect(screen.getByTestId('project-done').props.accessibilityState.disabled).toBe(true);

    await fireEvent.changeText(screen.getByTestId('project-name'), '   ');
    await waitFor(() => expect(screen.getByTestId('project-done').props.accessibilityState.disabled).toBe(true));

    await fireEvent.changeText(screen.getByTestId('project-name'), 'Kitchen');
    await waitFor(() => expect(screen.getByTestId('project-done').props.accessibilityState.disabled).toBe(false));
  });

  it('shows the length rule for an over-long name', async () => {
    await wrap(<NewProject />);

    await fireEvent.changeText(screen.getByTestId('project-name'), 'x'.repeat(81));

    await waitFor(() => expect(screen.getByText('Use 1–80 characters, excluding surrounding spaces.')).toBeTruthy());
  });

  it('submits the exact ProjectInput body, trimmed, with the chosen colour', async () => {
    mockCreateProject.mockResolvedValue({ project: project({ id: 'p3', name: 'Kitchen' }) });
    await wrap(<NewProject />);

    await fireEvent.changeText(screen.getByTestId('project-name'), '  Kitchen  ');
    await fireEvent.press(screen.getByTestId('project-color-#67be66'));
    await fireEvent.press(screen.getByTestId('project-done'));

    await waitFor(() => expect(mockCreateProject).toHaveBeenCalledWith({ name: 'Kitchen', color: '#67be66' }));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it('offers the whole palette, with the first swatch selected by default', async () => {
    await wrap(<NewProject />);

    for (const swatch of ['#8875ff', '#35bce6', '#ed4b9a', '#67be66', '#367de8', '#5b6abf']) {
      expect(screen.getByTestId(`project-color-${swatch}`)).toBeTruthy();
    }
    expect(screen.getByTestId('project-color-#8875ff').props.accessibilityState.selected).toBe(true);
  });

  it('surfaces a save failure and offers Retry', async () => {
    mockCreateProject.mockRejectedValue(new Error('Server said no.'));
    await wrap(<NewProject />);

    await fireEvent.changeText(screen.getByTestId('project-name'), 'Kitchen');
    await fireEvent.press(screen.getByTestId('project-done'));

    await waitFor(() => expect(screen.getByText('Server said no.')).toBeTruthy());
    expect(screen.getByTestId('project-retry')).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('seeds the edit form from the project and PATCHes it', async () => {
    mockParams.mockReturnValue({ id: 'p1' });
    mockUpdateProject.mockResolvedValue({ project: project({ id: 'p1', name: 'Home move v2' }) });
    await wrap(<EditProject />);

    // The form mounts only once the project is in the cache, then seeds from it.
    await waitFor(() => expect(screen.getByTestId('project-name').props.value).toBe('Home move'));

    await fireEvent.changeText(screen.getByTestId('project-name'), 'Home move v2');
    await fireEvent.press(screen.getByTestId('project-done'));

    await waitFor(() => expect(mockUpdateProject).toHaveBeenCalledWith('p1', { name: 'Home move v2', color: '#8875ff' }));
  });
});

/** `ProjectDetailView` (ProjectsView.swift:173-294). */
describe('Project detail', () => {
  async function renderDetail(id = 'p1') {
    mockParams.mockReturnValue({ id });
    const view = wrap(<ProjectDetail />);
    await waitFor(() => expect(mockTasks).toHaveBeenCalled());
    return view;
  }

  it('lists only that project’s open tasks, since the folder opens to actionable work', async () => {
    await renderDetail();

    await waitFor(() => expect(screen.getByText('Pack boxes')).toBeTruthy());
    // Completed by default hidden (status starts at Open), and other projects excluded.
    expect(screen.queryByText('Book movers')).toBeNull();
    expect(screen.queryByText('Unfiled errand')).toBeNull();
    expect(screen.getByText('1 task')).toBeTruthy();
  });

  it('shows completed tasks when the status filter is switched to All', async () => {
    await renderDetail();
    await waitFor(() => expect(screen.getByText('Pack boxes')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('project-filters'));
    await fireEvent.press(screen.getByTestId('project-status-All'));

    await waitFor(() => expect(screen.getByText('Book movers')).toBeTruthy());
  });

  it('lists unassigned tasks under the No project folder', async () => {
    await renderDetail('unassigned');

    await waitFor(() => expect(screen.getByText('Unfiled errand')).toBeTruthy());
    expect(screen.getByTestId('project-title').props.children).toBe('No project');
    expect(screen.queryByText('Pack boxes')).toBeNull();
  });

  it('opens the editor with the project preselected from Add task', async () => {
    await renderDetail();

    await fireEvent.press(screen.getByTestId('project-add-task'));

    expect(mockPush).toHaveBeenCalledWith({ pathname: '/task/new', params: { projectId: 'p1' } });
  });

  it('confirms before deleting, with the Swift wording', async () => {
    await renderDetail();

    await fireEvent.press(screen.getByTestId('project-actions'));
    await fireEvent.press(screen.getByTestId('menu-delete-project'));

    expect(Alert.alert).toHaveBeenCalledWith(
      'Delete this project?',
      'Its tasks will move to No project. No tasks will be deleted.',
      expect.anything(),
    );
  });

  it('shows the empty state when the project has no open tasks', async () => {
    mockTasks.mockResolvedValue({ tasks: [task({ id: 't2', title: 'Book movers', projectId: 'p1', status: 'COMPLETED' })], timeZone: ZONE });
    await renderDetail();

    await waitFor(() => expect(screen.getByText('You don’t have any open tasks.')).toBeTruthy());
    expect(screen.getByTestId('project-empty-add')).toBeTruthy();
  });

  it('reports a deleted project rather than an empty list', async () => {
    mockProjects.mockResolvedValue({ projects: [], unassignedTaskCount: 0 });
    await renderDetail();

    await waitFor(() => expect(screen.getByText('Project unavailable')).toBeTruthy());
    expect(screen.getByText('This project may have been deleted.')).toBeTruthy();
  });
});
