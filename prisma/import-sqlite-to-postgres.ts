import { execFileSync } from 'node:child_process';
import { PrismaClient } from '../src/generated/prisma';
import { harborDatabaseUrl } from './local-sqlite';

const TABLES = [
  'User',
  'UserPreference',
  'EmailVerificationToken',
  'AuthIdentity',
  'PasswordResetToken',
  'TaskList',
  'Project',
  'Category',
  'Tag',
  'CalendarConnection',
  'Task',
  'TaskWorkSession',
  'Subtask',
  'TaskTag',
  'TaskDependency',
  'RecurrenceRule',
  'CalendarEvent',
  'Reminder',
  'NotificationAttempt',
  'VoiceSession',
  'VoiceTranscript',
  'AssistantAction',
  'ActivityLog',
  'PushSubscription',
  'UserMemory',
] as const;

const DATE_KEYS = /(?:At|until)$|fireAt/;
const BOOL_KEYS = new Set([
  'pushEnabled', 'emailEnabled', 'smsEnabled', 'morningSummary', 'eveningSummary', 'weeklySummary',
  'voiceEnabled', 'personalizationEnabled', 'splittable', 'notifyPush', 'notifyEmail', 'notifySms',
  'critical', 'visible', 'writeEnabled', 'allDay', 'executed',
]);

function sqliteTables(file: string) {
  const out = execFileSync('sqlite3', [file, '.tables'], { encoding: 'utf8' });
  return new Set(out.split(/\s+/).filter(Boolean));
}

function readTable(file: string, table: string) {
  const raw = execFileSync('sqlite3', ['-json', file, `SELECT * FROM "${table}"`], { encoding: 'utf8' }).trim();
  if (!raw) return [];
  return JSON.parse(raw) as Record<string, unknown>[];
}

function asDate(value: unknown) {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value < 1e12 ? value * 1000 : value);
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const n = Number(value);
    return new Date(n < 1e12 ? n * 1000 : n);
  }
  if (typeof value === 'string') return new Date(value);
  return value;
}

function convert(row: Record<string, unknown>) {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value === null || value === undefined) {
      next[key] = value;
      continue;
    }
    if (BOOL_KEYS.has(key)) {
      next[key] = value === true || value === 1 || value === '1';
      continue;
    }
    if (DATE_KEYS.test(key)) {
      next[key] = asDate(value);
      continue;
    }
    next[key] = value;
  }
  return next;
}

async function main() {
  const url = harborDatabaseUrl();
  if (!url.startsWith('postgres')) {
    throw new Error('Import requires HARBOR_DATABASE_URL to be a Postgres URL.');
  }
  const source = process.argv[2] || 'prisma/harbour-prod.db';
  const existing = sqliteTables(source);
  const prisma = new PrismaClient();
  const counts: Record<string, number> = {};
  try {
    for (const table of TABLES) {
      if (!existing.has(table)) continue;
      const rows = readTable(source, table).map(convert);
      if (!rows.length) continue;
      console.error(`importing ${table} (${rows.length})`);
      await (prisma as unknown as Record<string, { createMany: (args: { data: unknown[]; skipDuplicates?: boolean }) => Promise<unknown> }>)[
        table[0].toLowerCase() + table.slice(1)
      ].createMany({ data: rows, skipDuplicates: true });
      counts[table] = rows.length;
    }
    const users = await prisma.user.findMany({ select: { email: true, name: true } });
    console.log(JSON.stringify({ imported: counts, users: users.map((u) => u.email) }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
