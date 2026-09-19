// Applies the Postgres migrations. Railway runs this before each deploy (preDeployCommand in railway.json).
import { execFileSync, spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
  // Adopt an existing deployment only when every table, column, and index matches.
  // This includes Moments tables previously installed with reviewed PostgreSQL SQL.
  if (state.hasTables && !state.hasHistory) {
    const comparison = spawnSync(process.execPath, [
      path.join(root, 'node_modules/prisma/build/index.js'), 'migrate', 'diff',
      '--from-url', process.env.HARBOR_DATABASE_URL,
      '--to-schema-datamodel', path.join(root, 'prisma/schema.prisma'), '--exit-code'
    ], { cwd: root, encoding: 'utf8' });
    if (comparison.status !== 0) {
      throw new Error('Existing database has no migration history and does not match the current schema. Review schema differences before baselining; no migrations were applied.');
    }
    const migrations = readdirSync(path.join(root, 'prisma/migrations'), { withFileTypes: true })
      .filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
    console.log('Existing database matches the current schema. Recording its migrations as applied.');
    for (const migration of migrations) prismaCommand('migrate', 'resolve', '--applied', migration);
  }
} finally {
  await prisma.$disconnect();
}
prismaCommand('migrate', 'deploy');
