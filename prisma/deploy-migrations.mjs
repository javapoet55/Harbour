// Applies the Postgres migrations. Railway runs this before each deploy (preDeployCommand in railway.json).
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASELINE = '20260914000000_init';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const { PrismaClient } = require(path.join(root, 'src/generated/prisma'));

function prismaCommand(...args) {
  const cli = path.join(root, 'node_modules/prisma/build/index.js');
  execFileSync(process.execPath, [cli, ...args, '--schema', path.join(root, 'prisma/schema.prisma')], { cwd: root, stdio: 'inherit' });
}

const prisma = new PrismaClient();
try {
  const [state] = await prisma.$queryRaw`SELECT to_regclass('public."_prisma_migrations"') IS NOT NULL AS "hasHistory", to_regclass('public."User"') IS NOT NULL AS "hasTables"`;
  // Databases created with `prisma db push` already have the baseline schema but no migration history.
  if (state.hasTables && !state.hasHistory) {
    console.log(`Existing schema without migration history: recording ${BASELINE} as already applied.`);
    prismaCommand('migrate', 'resolve', '--applied', BASELINE);
  }
} finally {
  await prisma.$disconnect();
}
prismaCommand('migrate', 'deploy');
