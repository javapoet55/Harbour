import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { mkdtempSync, closeSync, openSync } from 'node:fs';
import { tmpdir } from 'node:os';

// Never let integration tests fall back to the application's database.
const testDirectory = mkdtempSync(path.join(tmpdir(), 'nexdo-tests-'));
const databaseFile = path.join(testDirectory, 'test.db');
closeSync(openSync(databaseFile, 'wx'));
process.env.HARBOR_DATABASE_URL = `file:${databaseFile}`;

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    globalSetup: ['./vitest.global-setup.ts'],
    // Vitest loads .env into process.env. Real VAPID keys would switch the push provider off its mock
    // and fail every send for want of a browser subscription, so the suite pins them empty.
    env: { HARBOR_DATABASE_URL: process.env.HARBOR_DATABASE_URL, VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '' },
    testTimeout: 20000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
