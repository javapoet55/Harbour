import { redactStructured } from '@/server/health/redaction';
type Level = 'info' | 'warn' | 'error';

export function log(level: Level, event: string, fields: Record<string, unknown> = {}) {
  const line = {
    ts: new Date().toISOString(),
    level,
    event,
    ...redactStructured(fields) as Record<string, unknown>,
  };
  if (level === 'error') console.error(JSON.stringify(line));
  else if (level === 'warn') console.warn(JSON.stringify(line));
  else console.info(JSON.stringify(line));
}
