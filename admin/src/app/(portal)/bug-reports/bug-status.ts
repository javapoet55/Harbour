export const bugStatusLabels = {
  open: 'Open',
  in_progress: 'In Progress',
  future: 'Future',
  not_applicable: 'Not Applicable',
  closed: 'Closed',
} as const;

export type BugStatus = keyof typeof bugStatusLabels;

export const bugStatuses = Object.keys(bugStatusLabels) as BugStatus[];
