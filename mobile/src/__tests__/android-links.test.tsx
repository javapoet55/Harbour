import { render, renderHook, screen } from '@testing-library/react-native';
import * as fs from 'fs';
import * as path from 'path';
import { Platform, StyleSheet } from 'react-native';

import { IOSSwitch } from '../components/IOSSwitch';
import { useAppearance } from '../store/appearance';
import { brand, palettes, stackHeaderOptions, useTheme } from '../theme';

/**
 * docs/android-polish.md §6: tappable text and icon tint on Android. In DARK it is the Ask screen's
 * blue (`askBlue`), not the deep brand indigo; in light, and on iOS, it stays the brand indigo.
 * Filled controls keep the brand indigo; destructive text keeps red.
 */
const dark = palettes.dark;
const onPlatform = (os: 'ios' | 'android') => jest.replaceProperty(Platform, 'OS', os);

afterEach(() => {
  jest.restoreAllMocks();
  useAppearance.setState({ appearance: 'system' });
});

describe('the link colour', () => {
  it('is the Ask blue on Android in dark', async () => {
    onPlatform('android');
    useAppearance.setState({ appearance: 'night' });
    const { result } = await renderHook(() => useTheme());
    expect(result.current.colors.link).toBe(dark.askBlue);
    expect(result.current.colors.link).toBe('#6BB8FF');
    // Not the lighter indigo `accent` a first pass used.
    expect(result.current.colors.link).not.toBe(dark.accent);
    // Filled controls still resolve to the brand indigo.
    expect(result.current.colors.tint).toBe(brand.nexdoIndigo);
  });

  it('is the brand indigo on Android in light', async () => {
    onPlatform('android');
    useAppearance.setState({ appearance: 'day' });
    const { result } = await renderHook(() => useTheme());
    expect(result.current.colors.link).toBe(brand.nexdoIndigo);
  });

  it.each(['day', 'night'] as const)('is the brand indigo on iOS (%s), unchanged', async (appearance) => {
    onPlatform('ios');
    useAppearance.setState({ appearance });
    const { result } = await renderHook(() => useTheme());
    expect(result.current.colors.link).toBe(result.current.colors.tint);
  });

  it('tints header back chevrons and header actions', async () => {
    onPlatform('android');
    useAppearance.setState({ appearance: 'night' });
    const { result } = await renderHook(() => useTheme());
    expect(stackHeaderOptions(result.current, '#000000').headerTintColor).toBe(dark.askBlue);
  });
});

/**
 * The guard for the audit: no text colour or icon tint in `app/` or `src/` reads the raw brand
 * indigo or `colors.tint` any more. A new link written the old way fails here.
 */
describe('the audit', () => {
  const roots = ['app', 'src'].map((dir) => path.join(__dirname, '..', '..', dir));
  const sources: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__') walk(full);
      } else if (/\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name) && !full.includes(`${path.sep}theme${path.sep}`)) {
        sources.push(full);
      }
    }
  };
  roots.forEach(walk);

  it('finds no text or icon colour on the raw brand indigo or tint', () => {
    const offending = /(?<![A-Za-z])color(?:: |=\{)(?:\w+\.colors\.tint|brand\.nexdoIndigo)(?![\w.(])|(?:headerTintColor|tabBarActiveTintColor): \w+\.colors\.tint/;
    const hits = sources.flatMap((file) =>
      fs
        .readFileSync(file, 'utf8')
        .split('\n')
        .map((line, index) => ({ line, at: `${path.relative(process.cwd(), file)}:${index + 1}` }))
        .filter(({ line }) => offending.test(line)),
    );
    expect(hits.map((hit) => hit.at)).toEqual([]);
    expect(sources.length).toBeGreaterThan(100);
  });
});

describe('switches on Android', () => {
  it('soften the on track in dark and outline the off track', async () => {
    onPlatform('android');
    useAppearance.setState({ appearance: 'night' });
    const { rerender } = await render(<IOSSwitch value={false} onValueChange={jest.fn()} testID="switch" />);
    const offTrack = StyleSheet.flatten(screen.getByTestId('switch-track').props.style);
    expect(offTrack).toMatchObject({ borderWidth: StyleSheet.hairlineWidth, borderColor: dark.fieldBorder });
    expect(dark.switchOff).toBe('#48484A');
    expect(dark.switchOn).toBe('rgba(61, 41, 240, 0.85)');

    await rerender(<IOSSwitch value onValueChange={jest.fn()} testID="switch" />);
    expect(screen.getByTestId('switch').props.accessibilityState.checked).toBe(true);
  });

  it('keep the Swift track on iOS', async () => {
    onPlatform('ios');
    await render(<IOSSwitch value={false} onValueChange={jest.fn()} testID="switch" />);
    expect(StyleSheet.flatten(screen.getByTestId('switch-track').props.style).borderWidth).toBeUndefined();
  });
});
