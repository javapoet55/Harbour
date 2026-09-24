// Runs once when each Next.js server instance starts.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const [{ adminAllowlistSummary }, { log }] = await Promise.all([import('./server/admin-allowlist'), import('./lib/logger')]);
  const { level, event, fields } = adminAllowlistSummary();
  log(level, event, fields);
}
