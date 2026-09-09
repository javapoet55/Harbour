import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from './db';
import { deleteProject, listProjects, ownedProject, parseProjectId, projectTasks, saveProject } from './projects';
import { createTask, updateTask } from './tasks';

describe('account-scoped projects and task assignment', () => {
  let userId: string; let otherId: string;
  beforeAll(async () => {
    const users = await Promise.all(['owner', 'other'].map(name => prisma.user.create({ data: { name, email: `projects-${name}-${Date.now()}@test.invalid`, passwordHash: 'unused' } })));
    [userId, otherId] = users.map(user => user.id);
  });
  afterAll(async () => { await prisma.user.deleteMany({ where: { id: { in: [userId, otherId] } } }); });
  it('creates, trims, updates and lists projects without exposing other accounts', async () => {
    const project = await saveProject(userId, null, { name: '  Café launch  ', color: '#8875FF' });
    expect(project).toMatchObject({ name: 'Café launch', color: '#8875ff', totalTaskCount: 0, completedTaskCount: 0 });
    expect((await listProjects(otherId)).projects).toEqual([]);
    expect((await saveProject(userId, project.id, { name: 'Launch', color: '#35bce6' })).name).toBe('Launch');
    await expect(saveProject(otherId, project.id, { name: 'stolen', color: '#35bce6' })).rejects.toThrow('NOT_FOUND');
    await expect(deleteProject(otherId, project.id)).rejects.toThrow('NOT_FOUND');
    await expect(projectTasks(otherId, project.id)).rejects.toThrow('NOT_FOUND');
  });
  it.each(['', '  ', 'x'.repeat(81)])('rejects invalid names %s', async name => {
    await expect(saveProject(userId, null, { name, color: '#8875ff' })).rejects.toThrow('INVALID_PROJECT');
  });
  it('rejects invalid colors, injected ownership, and malformed project IDs', async () => {
    await expect(saveProject(userId, null, { name: 'Valid', color: 'red' })).rejects.toThrow('INVALID_PROJECT');
    await expect(saveProject(userId, null, { name: 'Valid', color: '#8875ff', userId: otherId })).rejects.toThrow('INVALID_PROJECT');
    expect(() => parseProjectId(123)).toThrow('INVALID_PROJECT');
    expect(() => parseProjectId('')).toThrow('INVALID_PROJECT');
    expect(parseProjectId(null)).toBeNull();
  });
  it('assigns, moves and unassigns tasks; counts agree and deletion never deletes tasks', async () => {
    const a = await saveProject(userId, null, { name: 'A', color: '#8875ff' });
    const b = await saveProject(userId, null, { name: 'B', color: '#35bce6' });
    const legacy = await createTask({ userId, title: 'Existing unassigned task' });
    expect(legacy.projectId).toBeNull();
    const task = await createTask({ userId, title: 'Assigned', projectId: a.id });
    const done = await createTask({ userId, title: 'Complete', status: 'COMPLETED', projectId: a.id });
    await createTask({ userId, title: 'Cancelled excluded', status: 'CANCELLED', projectId: a.id });
    const deleted = await createTask({ userId, title: 'Deleted excluded', projectId: a.id });
    await prisma.task.update({ where: { id: deleted.id }, data: { deletedAt: new Date() } });
    let projects = await listProjects(userId);
    expect(projects.projects.find(p => p.id === a.id)).toMatchObject({ totalTaskCount: 2, completedTaskCount: 1 });
    expect(projects.unassignedTaskCount).toBe(1);
    expect((await projectTasks(userId, a.id)).map(t => t.id).sort()).toEqual([task.id, done.id].sort());
    await updateTask(userId, task.id, { project: { connect: { id: b.id } }, notes: 'Moved with notes' });
    await updateTask(userId, task.id, { title: 'Unrelated edit' });
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).projectId).toBe(b.id);
    projects = await listProjects(userId);
    expect(projects.projects.find(p => p.id === b.id)?.totalTaskCount).toBe(1);
    await deleteProject(userId, a.id);
    expect(await prisma.task.count({ where: { userId } })).toBe(5);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: done.id } })).projectId).toBeNull();
    expect((await listProjects(userId)).unassignedTaskCount).toBe(2);
    await expect(ownedProject(prisma, userId, a.id)).rejects.toThrow('NOT_FOUND');
    await expect(createTask({ userId, title: 'Deleted project rejected', projectId: a.id })).rejects.toThrow('NOT_FOUND');
    await updateTask(userId, task.id, { project: { disconnect: true } });
    expect((await listProjects(userId)).unassignedTaskCount).toBe(3);
  });
  it('rejects assigning another account’s project without modifying the task', async () => {
    const other = await saveProject(otherId, null, { name: 'Private', color: '#8875ff' });
    await expect(createTask({ userId, title: 'Invalid', projectId: other.id })).rejects.toThrow('NOT_FOUND');
    const task = await createTask({ userId, title: 'Safe' });
    await expect(updateTask(userId, task.id, { project: { connect: { id: other.id } }, title: 'Invalid' })).rejects.toThrow('NOT_FOUND');
    expect(await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).toMatchObject({ title: 'Safe', projectId: null });
    await expect(updateTask(otherId, task.id, { title: 'Invalid' })).rejects.toThrow('NOT_FOUND');
  });
});
