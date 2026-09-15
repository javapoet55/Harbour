export type TaskListFilters = {
  q?: string;
  status?: string;
  priority?: string;
  energy?: string;
  due?: string;
  timeline?: string;
};

export const queryKeys = {
  me: () => ['me'] as const,
  tasks: {
    all: () => ['tasks'] as const,
    list: (filters: TaskListFilters = {}) => ['tasks', 'list', filters] as const,
  },
  agenda: {
    all: () => ['agenda'] as const,
    range: (from: string, to: string) => ['agenda', from, to] as const,
  },
  projects: {
    all: () => ['projects'] as const,
    detail: (id: string) => ['projects', id] as const,
    tasks: (id: string) => ['projects', id, 'tasks'] as const,
  },
  calendar: {
    all: () => ['calendar'] as const,
    connections: () => ['calendar', 'connections'] as const,
  },
  assistant: {
    all: () => ['assistant'] as const,
    consent: () => ['assistant', 'consent'] as const,
  },
};
