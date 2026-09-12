import { defineConfig } from 'vitest/config';
import path from 'node:path';
export default defineConfig({ cacheDir: './.voice-test-cache', test: { environment: 'node', include: ['src/server/voice/*.test.ts', 'src/app/api/realtime/**/*.test.ts'] }, resolve: { alias: { '@': path.resolve(__dirname, 'src') } } });
