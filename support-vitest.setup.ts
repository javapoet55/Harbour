import { vi } from 'vitest';
// Support unit tests stay database-free; ledger integration is covered in the isolated backend suite.
vi.mock('@/server/health/telemetry', () => ({ observedFetch: (input: Parameters<typeof fetch>[0], init?: RequestInit) => fetch(input, init) }));
