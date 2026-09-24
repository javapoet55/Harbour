import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '..');
const sources = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  if (entry.isDirectory()) return entry.name === 'node_modules' || entry.name.startsWith('.') ? [] : sources(full);
  return /\.(ts|tsx|mjs)$/.test(entry.name) && !entry.name.endsWith('.d.ts') ? [full] : [];
});
const specifiers = (file: string) => [...readFileSync(file, 'utf8').matchAll(/(?:from\s+|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g)].map((match) => match[1]);

describe('admin app boundaries', () => {
  it('never imports the backend source, Prisma or anything outside admin/', () => {
    const problems = sources(root).flatMap((file) => specifiers(file).filter((specifier) => {
      if (/^(@prisma|prisma)(\/|$)/.test(specifier) || specifier.includes('generated/prisma')) return true;
      if (!specifier.startsWith('.')) return false;
      return path.relative(root, path.resolve(path.dirname(file), specifier)).startsWith('..');
    }).map((specifier) => `${path.relative(root, file)} -> ${specifier}`));
    expect(problems).toEqual([]);
  });

  it('keeps backend-only packages out of the dependency list', () => {
    const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
    const names = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies });
    expect(names.filter((name) => /prisma|bcrypt|pg$|web-push/.test(name))).toEqual([]);
  });
});
