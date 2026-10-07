// The Settings page is user-facing: no developer notes, commands or build-stage wording.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';

const page = readFileSync(path.join(__dirname, 'page.tsx'), 'utf8');

it('shows no developer text', () => {
  for (const text of ['db:reset', 'yarn ', 'demo account', 'MVP', 'in production']) expect(page).not.toContain(text);
});
