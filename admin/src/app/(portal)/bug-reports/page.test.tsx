// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('@/server/admin-data', () => ({ adminData: vi.fn() }));
import { adminData } from '@/server/admin-data';
import BugReportsPage from './page';
afterEach(cleanup);
it('shows tickets and their protected screenshot links', async () => {
  vi.mocked(adminData).mockResolvedValue({ bugs: [{ id: '1', reference: 'BR-123456', description: 'Calendar button broken', createdAt: '2026-10-11T10:00:00Z', hasScreenshot: true, metadata: null }], nextCursor: 'next' });
  render(await BugReportsPage({ searchParams: Promise.resolve({}) }));
  expect(screen.getByText('BR-123456')).toBeTruthy();
  expect(screen.getByText('Calendar button broken')).toBeTruthy();
  expect(screen.getByText('View screenshot').getAttribute('href')).toBe('/api/admin/feedback/bugs/1/screenshot');
  expect(screen.getByText('Older reports →')).toBeTruthy();
});
it('shows empty state and ignores invalid cursors', async () => {
  vi.mocked(adminData).mockResolvedValue({ bugs: [], nextCursor: null });
  render(await BugReportsPage({ searchParams: Promise.resolve({ cursor: 'bad' }) }));
  expect(screen.getByText('No bug reports submitted yet.')).toBeTruthy();
  expect(screen.getByText('Development Bug Reports').getAttribute('href')).toBe('https://admin-dev.nexdoapp.com/bug-reports');
  expect(vi.mocked(adminData).mock.lastCall?.[0]).toBe('/api/admin/feedback/bugs');
});
