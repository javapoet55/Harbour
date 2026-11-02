import * as fs from 'fs';
import * as path from 'path';

/**
 * QA M-02 (android-polish.md §68): `StatusBarOwner` is the only status-bar style setter. Any other —
 * a `<StatusBar>` component (React Native's or expo-status-bar's), a screen's `statusBarStyle` (which
 * react-native-screens would apply natively on every screen change) or a direct `setBarStyle` — would
 * fight it, and the last one to run wins.
 */
const SETTERS = /from 'expo-status-bar'|<StatusBar\b|\bstatusBarStyle\b|\bsetBarStyle\(|\bsetStatusBarStyle\(/;
const OWNER = path.join('src', 'components', 'StatusBarOwner.tsx');

describe('one status-bar owner', () => {
  const root = path.join(__dirname, '..', '..');
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__' && entry.name !== 'node_modules') walk(full);
      } else if (/\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name)) files.push(full);
    }
  };
  walk(path.join(root, 'src'));
  walk(path.join(root, 'app'));

  it('finds no other status-bar style setter in app/ or src/', () => {
    const setters = files.map((file) => path.relative(root, file)).filter((file) => SETTERS.test(fs.readFileSync(path.join(root, file), 'utf8')));
    expect(setters).toEqual([OWNER]);
  });

  it('is mounted by the root layout', () => {
    expect(fs.readFileSync(path.join(root, 'app', '_layout.tsx'), 'utf8')).toMatch(/<StatusBarOwner scheme=\{theme\.scheme\} \/>/);
  });

  it('leaves the native theme alone: no status-bar style in the app config', () => {
    const config = fs.readFileSync(path.join(root, 'app.config.ts'), 'utf8');
    expect(config).not.toMatch(/'expo-status-bar'|windowLightStatusBar|androidStatusBar/);
  });
});
