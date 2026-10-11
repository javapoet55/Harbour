import { defineConfig } from 'vitest/config';
import path from 'node:path';
// Support chat does not read or write the database; keep these tests isolated from Prisma setup.
export default defineConfig({ test: { environment: 'node', setupFiles: ['./support-vitest.setup.ts'], include: ['src/server/support/*.test.ts', 'src/app/api/support/**/*.test.ts'], env: { OPENAI_API_KEY: '' } }, resolve: { alias: { '@': path.resolve(__dirname, 'src') } } });
