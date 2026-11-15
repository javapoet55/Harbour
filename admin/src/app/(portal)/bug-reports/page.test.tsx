// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('@/server/admin-data', () => ({ adminData: vi.fn() }));
vi.mock('@/server/backend', () => ({ backendFetch: vi.fn() }));
vi.mock('@/server/session', () => ({ sessionToken: vi.fn() }));
import { backendFetch } from '@/server/backend';
import { sessionToken } from '@/server/session';
import { adminData } from '@/server/admin-data';
import BugReportsPage from './page';
afterEach(cleanup);
it('shows tickets and their protected screenshot in a dialog', async () => {
  vi.mocked(adminData).mockResolvedValue({ bugs: [{ id: '1', reference: 'BR-123456', description: 'Calendar button broken', createdAt: '2026-10-11T10:00:00Z', hasScreenshot: true, metadata: null }], nextCursor: 'next' });
  render(await BugReportsPage({ searchParams: Promise.resolve({}) }));
  expect(screen.getByText('BR-123456')).toBeTruthy();
  expect(screen.getByText('Calendar button broken')).toBeTruthy();
  const dialog = document.querySelector('dialog')!;
  dialog.showModal = vi.fn();
  fireEvent.click(screen.getByRole('button', { name: 'View screenshot' }));
  expect(dialog.showModal).toHaveBeenCalledOnce();
  expect(screen.getByAltText('Screenshot attached to BR-123456').getAttribute('src')).toBe('/api/admin/feedback/bugs/1/screenshot');
  expect(screen.getByText('Older reports →')).toBeTruthy();
});
it('shows empty state and ignores invalid cursors', async () => {
  vi.mocked(adminData).mockResolvedValue({ bugs: [], nextCursor: null });
  render(await BugReportsPage({ searchParams: Promise.resolve({ cursor: 'bad' }) }));
  expect(screen.getByText('No bug reports submitted yet.')).toBeTruthy();
  expect(screen.getByText('Development Bug Reports').getAttribute('href')).toBe('https://admin-dev.nexdoapp.com/bug-reports');
  expect(vi.mocked(adminData).mock.lastCall?.[0]).toBe('/api/admin/feedback/bugs');
});

it('autosaves the selected status and restores the previous value on failure', async () => {
  const id = '11111111-1111-4111-8111-111111111111';
  vi.mocked(adminData).mockResolvedValue({
    bugs: [{ id, reference: 'BR-123456', description: 'Calendar button broken', createdAt: '2026-10-11T10:00:00Z', status: 'open', hasScreenshot: false, metadata: null }],
    nextCursor: null,
  });
  vi.mocked(sessionToken).mockResolvedValue('admin-session');
  vi.mocked(backendFetch).mockResolvedValueOnce(new Response(null, { status: 200 }))
    .mockRejectedValueOnce(new Error('Network unavailable'));

  render(await BugReportsPage({ searchParams: Promise.resolve({}) }));
  const dropdown = screen.getByRole<HTMLSelectElement>('combobox', { name: 'Status for BR-123456' });
  expect(dropdown.value).toBe('open');
  expect(within(dropdown).getAllByRole('option').map(option => option.textContent))
    .toEqual(['Open', 'In Progress', 'Future', 'Not Applicable', 'Closed']);
  fireEvent.change(dropdown, { target: { value: 'in_progress' } });
  await waitFor(() => expect(dropdown.disabled).toBe(false));
  expect(backendFetch).toHaveBeenCalledWith('/api/admin/feedback/bugs', {
    method: 'PATCH', token: 'admin-session', body: { id, status: 'in_progress' },
  });
  expect(dropdown.value).toBe('in_progress');

  fireEvent.change(dropdown, { target: { value: 'future' } });
  expect((await screen.findByRole('alert')).textContent).toContain('Couldn’t save status');
  expect(dropdown.value).toBe('in_progress');
});
