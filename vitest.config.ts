import { configDefaults, defineConfig } from 'vitest/config';
import path from 'node:path';
import { mkdtempSync, closeSync, openSync } from 'node:fs';
import { tmpdir } from 'node:os';

// Never let integration tests fall back to the application's database.
const testDirectory = mkdtempSync(path.join(tmpdir(), 'nexdo-tests-'));
const databaseFile = path.join(testDirectory, 'test.db');
closeSync(openSync(databaseFile, 'wx'));
// Every test worker writes to this one SQLite file, and SQLite lets one writer in at a time. Prisma
// gives up waiting for that lock after 5 seconds ("Socket timeout"), which a busy suite can exceed;
// socket_timeout is that wait in seconds. Test database only: production runs on Postgres.
process.env.HARBOR_DATABASE_URL = `file:${databaseFile}?socket_timeout=60`;

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    globalSetup: ['./vitest.global-setup.ts'],
    // Vitest loads .env into process.env, which would hand the tests a developer's real provider
    // credentials: web-push failing for want of a browser subscription, and SendGrid and Twilio
    // actually posting to the network from a test run. Every outbound key is pinned empty so each
    // provider takes its mock branch. A test that needs a configured provider stubs it for itself.
    env: {
      HARBOR_DATABASE_URL: process.env.HARBOR_DATABASE_URL,
      VAPID_PUBLIC_KEY: '',
      VAPID_PRIVATE_KEY: '',
      SENDGRID_API_KEY: '',
      TWILIO_ACCOUNT_SID: '',
    },
    testTimeout: 20000,
    // The admin frontend runs its own Vitest suite (cd admin && npm test).
    exclude: [...configDefaults.exclude, 'admin/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
