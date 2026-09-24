import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { register } from './instrumentation';

const lines: string[] = [];
beforeEach(() => {
  lines.length = 0;
  for (const method of ['info', 'warn'] as const) vi.spyOn(console, method).mockImplementation((...args: unknown[]) => { lines.push(String(args[0])); });
  vi.stubEnv('NEXT_RUNTIME', 'nodejs');
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

it('logs at startup how many admin emails NEXDO_ADMIN_EMAILS parsed, and never the addresses', async () => {
  vi.stubEnv('NEXDO_ADMIN_EMAILS', ' Ops@NexdoApp.com, owner@nexdoapp.com, ops@nexdoapp.com ,');
  await register();
  expect(lines).toHaveLength(1);
  expect(JSON.parse(lines[0])).toMatchObject({ level: 'info', event: 'admin_allowlist_loaded', count: 2 });
  expect(lines[0]).not.toMatch(/nexdoapp|@/i);
});

it('warns when no admin emails are configured', async () => {
  vi.stubEnv('NEXDO_ADMIN_EMAILS', '');
  await register();
  expect(JSON.parse(lines[0])).toMatchObject({ level: 'warn', event: 'admin_allowlist_loaded', count: 0 });
});

it('does nothing in the edge runtime', async () => {
  vi.stubEnv('NEXT_RUNTIME', 'edge');
  await register();
  expect(lines).toHaveLength(0);
});
