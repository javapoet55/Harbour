// AI replies, task titles, wish messages and every other piece of user or model text reach the page as
// React text nodes, which React escapes. These are the ways around that escaping; none may appear in the
// web app or the admin app. (ESLint enforces the JSX half as react/no-danger.)
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';

const root = path.resolve(__dirname, '../..');
const sinks = /dangerouslySetInnerHTML|\.innerHTML\b|\.outerHTML\b|insertAdjacentHTML|document\.write|\beval\(|new Function\(|srcDoc=/;

function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'generated' ? [] : sources(file);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [file] : [];
  });
}

it('never renders text as raw HTML or evaluates it as code', () => {
  const offenders = [path.join(root, 'src'), path.join(root, 'admin/src')]
    .flatMap(sources)
    .filter((file) => sinks.test(readFileSync(file, 'utf8')))
    .map((file) => path.relative(root, file));
  expect(offenders).toEqual([]);
});
