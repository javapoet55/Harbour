// Fails when a dependency that ships to production has a known high or critical vulnerability.
// Usage: node scripts/audit-production.mjs [package directory]   (default: the repository root)
// Reads the lockfile only: nothing is installed and no package script runs.
//
// An advisory that cannot be fixed yet, and that has been judged not to affect the running app, can be
// listed in .github/audit-accepted.json with the reason and a date to look again. Past that date it
// fails again. Everything else high or critical fails the check.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const directory = path.resolve(root, process.argv[2] ?? '.');
const accepted = JSON.parse(readFileSync(path.join(root, '.github/audit-accepted.json'), 'utf8'));
const today = new Date().toISOString().slice(0, 10);
const stillAccepted = new Map(accepted.filter((entry) => entry.reviewBy >= today).map((entry) => [entry.advisory, entry]));

let report;
try {
  report = execFileSync('npm', ['audit', '--package-lock-only', '--omit=dev', '--json'], { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
} catch (error) {
  report = error.stdout; // npm exits non-zero when it finds anything; the JSON is still on stdout.
}
let parsed;
try { parsed = JSON.parse(report); } catch { parsed = null; }
if (!parsed?.vulnerabilities) {
  console.error('npm audit did not return a report; cannot tell whether dependencies are safe.');
  process.exit(2);
}

const advisories = new Map();
for (const [name, entry] of Object.entries(parsed.vulnerabilities)) {
  for (const via of entry.via) {
    if (typeof via !== 'object' || !['high', 'critical'].includes(via.severity)) continue;
    const id = via.url.split('/').pop();
    advisories.set(id, { id, package: via.name ?? name, severity: via.severity, title: via.title, range: via.range, url: via.url });
  }
}

const open = [...advisories.values()].filter((advisory) => !stillAccepted.has(advisory.id));
for (const advisory of advisories.values()) {
  if (stillAccepted.has(advisory.id)) console.log(`accepted until ${stillAccepted.get(advisory.id).reviewBy}: ${advisory.id} ${advisory.package} (${advisory.severity})`);
}
if (open.length === 0) {
  console.log(`${path.relative(root, directory) || '.'}: no open high or critical advisories in production dependencies.`);
  process.exit(0);
}
console.error(`${path.relative(root, directory) || '.'}: ${open.length} high or critical advisor${open.length === 1 ? 'y' : 'ies'} in production dependencies:`);
for (const advisory of open) console.error(`  ${advisory.severity.padEnd(8)} ${advisory.package} ${advisory.range}  ${advisory.title}\n           ${advisory.url}`);
process.exit(1);
