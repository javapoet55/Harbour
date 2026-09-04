import { describe, expect, it } from 'vitest';
import { taskWhereForUser } from '@/server/agenda';

describe('tenant isolation', () => {
  it('scopes every task query to the signed-in user and hides soft deletes', () => {
    expect(taskWhereForUser('user-a')).toEqual({ userId: 'user-a', deletedAt: null });
    expect(taskWhereForUser('user-a')).not.toMatchObject({ userId: 'user-b' });
  });
});
