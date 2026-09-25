import { createApiClient } from './client';
import { endpoints } from './index';
import { lifeReminderLabel } from '../lib/taskLabels';

/**
 * `GET /api/tasks` returns the Prisma `Task` rows (src/app/api/tasks/route.ts), which since e13730b
 * carry the smart-life-reminder columns (prisma/schema.prisma:184-187). The fixture is Swift's own
 * (ios/Tests/NexdoCoreTests/CoreTests.swift:37-43).
 */

function clientFor(body: string) {
  const doFetch = jest.fn(async () => ({
    status: 200,
    redirected: false,
    url: '',
    type: 'basic',
    headers: { get: () => null },
    text: async () => body,
  })) as unknown as jest.Mock & typeof globalThis.fetch;
  return createApiClient({ baseUrl: 'https://api.example.com', fetch: doFetch });
}

const LIFE_REMINDER =
  '{"id":"t1","title":"Return shoes","status":"PLANNED","priority":"NORMAL","durationMin":5,"notes":"","startAt":"2026-10-10T16:00:00Z","dueAt":"2026-10-14T16:00:00Z","reminderAt":"2026-10-10T16:00:00Z","lifeReminderType":"returnItem","lifeReminderConfidence":0.96,"originalUserText":"Return shoes before October 14"}';

describe('task life-reminder metadata', () => {
  it('decodes the life-reminder fields off /api/tasks', async () => {
    const { tasks } = await endpoints.tasks(clientFor(`{"tasks":[${LIFE_REMINDER}],"timeZone":"America/Los_Angeles"}`));
    const [task] = tasks;
    expect(task.reminderAt).toBe('2026-10-10T16:00:00Z');
    expect(task.lifeReminderType).toBe('returnItem');
    expect(task.lifeReminderConfidence).toBe(0.96);
    expect(task.originalUserText).toBe('Return shoes before October 14');
    expect(lifeReminderLabel(task)).toBe('Return');
  });

  it('leaves them null on an ordinary task, as the server writes them', async () => {
    const plain =
      '{"id":"t2","title":"Call Sam","status":"PLANNED","priority":"NORMAL","durationMin":30,"reminderAt":null,"lifeReminderType":null,"lifeReminderConfidence":null,"originalUserText":null}';
    const { tasks } = await endpoints.tasks(clientFor(`{"tasks":[${plain}]}`));
    expect(tasks[0]).toMatchObject({ reminderAt: null, lifeReminderType: null, lifeReminderConfidence: null, originalUserText: null });
    expect(lifeReminderLabel(tasks[0])).toBeNull();
  });

  it('returns the created life reminder from POST /api/tasks without the client sending the fields', async () => {
    const { task } = await endpoints.createTask({ title: 'Return shoes before October 14', notes: '', durationMin: 30, startAt: '2026-09-21T16:00:00Z' }, clientFor(`{"task":${LIFE_REMINDER}}`));
    expect(task.lifeReminderType).toBe('returnItem');
  });
});
