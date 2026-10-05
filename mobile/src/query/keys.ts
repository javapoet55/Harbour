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
  weather: () => ['weather'] as const,
  /** A task's business research (`loadTaskAgent`, ios/App/NexdoApp.swift:553), per account. */
  taskAgent: {
    all: (ownerId: string) => ['task-agent', ownerId] as const,
    task: (ownerId: string, taskId: string) => ['task-agent', ownerId, taskId] as const,
  },
  /** `AppModel.voiceUsage` (ios/App/NexdoApp.swift:16), per account like Swift's owner check. */
  voiceUsage: (ownerId: string) => ['voice-usage', ownerId] as const,
  scheduleIntelligence: () => ['schedule-intelligence'] as const,
  /** `persistentNext` and `protectedTime` (ios/App/NexdoApp.swift:15-17). */
  nextAction: () => ['next-action'] as const,
  protectedTime: () => ['protected-time'] as const,
  weeklySummary: (start: string) => ['weekly-summary', start] as const,
  projects: {
    all: () => ['projects'] as const,
    detail: (id: string) => ['projects', id] as const,
    tasks: (id: string) => ['projects', id, 'tasks'] as const,
  },
  calendar: {
    all: () => ['calendar'] as const,
    connections: () => ['calendar', 'connections'] as const,
    /** Event Details (CalendarEventDetailsView.swift:103), per account. */
    event: (ownerId: string, id: string) => ['calendar', 'event', ownerId, id] as const,
  },
  assistant: {
    all: () => ['assistant'] as const,
    consent: () => ['assistant', 'consent'] as const,
  },
  /** Store offers and hours (ShoppingOffersView.swift, ShoppingStoreHoursView.swift), per account. */
  shopping: {
    offers: (ownerId: string, listId: string) => ['shopping-offers', ownerId, listId] as const,
    storeHours: (ownerId: string, placeId: string) => ['store-hours', ownerId, placeId] as const,
  },
  /** `CalorieStore` (ios/App/CalorieTrackerView.swift:70-215), per account. */
  nutrition: {
    all: (ownerId: string) => ['nutrition', ownerId] as const,
    settings: (ownerId: string) => ['nutrition', ownerId, 'settings'] as const,
    day: (ownerId: string, date: string) => ['nutrition', ownerId, 'day', date] as const,
    summary: (ownerId: string, period: 'week' | 'month', date: string) => ['nutrition', ownerId, 'summary', period, date] as const,
    insight: (ownerId: string, date: string) => ['nutrition', ownerId, 'insight', date] as const,
  },
};
