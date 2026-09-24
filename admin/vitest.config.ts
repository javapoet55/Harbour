import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    // Never read a developer's admin/.env: tests use a mocked backend only.
    env: { BACKEND_URL: 'http://backend.test', ADMIN_API_SECRET: 'test-admin-client-secret-0123456789abcdef' },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // server-only throws outside the react-server condition that Next applies; tests run server code directly.
      'server-only': path.resolve(__dirname, 'test/server-only.ts'),
    },
  },
});
