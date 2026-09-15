import { configDefaults, defineConfig } from 'vitest/config';
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
    // mobile/ has its own Jest tests.
    exclude: [...configDefaults.exclude, 'mobile/**'],
    setupFiles: ['./vitest.setup.ts'],
    globalSetup: ['./vitest.global-setup.ts'],
    env: { HARBOR_DATABASE_URL: process.env.HARBOR_DATABASE_URL },
    testTimeout: 20000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
