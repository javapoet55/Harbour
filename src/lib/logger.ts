type Level = 'info' | 'warn' | 'error';

const SECRET_KEYS = /secret|token|password|authorization|cookie|api[_-]?key/i;

function redact(value: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    out[key] = SECRET_KEYS.test(key) ? '[redacted]' : entry;
  }
  return out;
}

export function log(level: Level, event: string, fields: Record<string, unknown> = {}) {
  const line = {
    ts: new Date().toISOString(),
    level,
    event,
    ...redact(fields),
  };
  if (level === 'error') console.error(JSON.stringify(line));
  else if (level === 'warn') console.warn(JSON.stringify(line));
  else console.info(JSON.stringify(line));
}
