import { execFileSync } from 'node:child_process';
import path from 'node:path';

export default function setup() {
  if (!process.env.HARBOR_DATABASE_URL?.includes('nexdo-tests-')) {
    throw new Error('Refusing to migrate a non-test database.');
  }
  execFileSync(process.execPath, [path.resolve('node_modules/prisma/build/index.js'), 'migrate', 'deploy'], {
    env: process.env,
    stdio: 'pipe',
  });
}
