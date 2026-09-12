import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export function harborDatabaseUrl() {
  if (process.env.HARBOR_DATABASE_URL) return process.env.HARBOR_DATABASE_URL.trim().replace(/^["']|["']$/g, '');
  for (const file of ['.env', 'prisma/.env']) {
    const full = path.resolve(file);
    if (!existsSync(full)) continue;
    const match = readFileSync(full, 'utf8').match(/^HARBOR_DATABASE_URL=(.*)$/m);
    if (match) return match[1].trim().replace(/^["']|["']$/g, '');
  }
  return '';
}

export function assertLocalSqlite() {
  const url = harborDatabaseUrl();
  if (!url.startsWith('file:')) {
    throw new Error('Refusing to seed or reset a non-local database. Demo seed/reset is only allowed for a file: SQLite URL.');
  }
}
