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
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
