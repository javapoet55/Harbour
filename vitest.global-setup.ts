import { execFileSync } from 'node:child_process';
import path from 'node:path';

export default function setup() {
  if (!process.env.HARBOR_DATABASE_URL?.includes('nexdo-tests-')) {
    throw new Error('Refusing to migrate a non-test database.');
  }
  const prismaCli = path.resolve('node_modules/prisma/build/index.js');
  const schema = path.resolve('prisma/schema.sqlite.prisma');
  execFileSync(process.execPath, [prismaCli, 'generate', '--schema', schema], {
    env: process.env,
    stdio: 'pipe',
  });
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy', '--schema', schema], {
    env: process.env,
    stdio: 'pipe',
  });
}
