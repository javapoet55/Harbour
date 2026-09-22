import { fireEvent, render, renderHook, screen } from '@testing-library/react-native';
import * as fs from 'fs';
import * as path from 'path';
import { Platform, StyleSheet } from 'react-native';

import { IOSSwitch } from '../components/IOSSwitch';
import { SettingsSegments } from '../components/SettingsControls';
import { DetailOutlineButton, DetailTextInput } from '../components/TaskDetailParts';
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
    // One accent (§7): the outlined-button and focus `accent` is the same blue, not §2's #8F85FF.
    expect(result.current.colors.accent).toBe(result.current.colors.link);
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

  it('finds the retired #8F85FF accent nowhere, theme included', () => {
    const theme = path.join(__dirname, '..', 'theme');
    const all = [...sources, ...fs.readdirSync(theme).filter((name) => /\.tsx?$/.test(name)).map((name) => path.join(theme, name))];
    const retired = /8F85FF|143, 133, 255/i;
    expect(all.filter((file) => retired.test(fs.readFileSync(file, 'utf8'))).map((file) => path.relative(process.cwd(), file))).toEqual([]);
  });
});

/** §7: one blue for everything tappable or active on Android in dark; indigo only for fills. */
describe('the single accent on Android in dark', () => {
  const flat = (testID: string) => StyleSheet.flatten(screen.getByTestId(testID).props.style);
  beforeEach(() => {
    onPlatform('android');
    useAppearance.setState({ appearance: 'night' });
  });

  it('is the Ask blue in every accent token', () => {
    expect(dark.accent).toBe(dark.askBlue);
    expect(dark.accentTint).toBe('rgba(107, 184, 255, 0.10)');
    expect(dark.accentBorder).toBe('rgba(107, 184, 255, 0.45)');
  });

  it('draws the outlined buttons in it', async () => {
    await render(<DetailOutlineButton title="Start task" onPress={jest.fn()} testID="start" />);
    expect(StyleSheet.flatten(screen.getByText('Start task').props.style).color).toBe('#6BB8FF');
    expect(flat('start-surface')).toMatchObject({ backgroundColor: dark.accentTint, borderColor: dark.accentBorder });
  });

  it('borders a focused field in it', async () => {
    await render(<DetailTextInput value="" onChangeText={jest.fn()} accessibilityLabel="Task title" testID="input" />);
    await fireEvent(screen.getByTestId('input'), 'focus');
    expect(flat('input')).toMatchObject({ borderColor: '#6BB8FF' });
  });

  it('marks the selected Appearance segment in it', async () => {
    await render(
      <SettingsSegments
        label="Appearance"
        options={[
          { value: 'system', title: 'System' },
          { value: 'night', title: 'Night' },
        ]}
        value="night"
        onChange={jest.fn()}
        testIDPrefix="appearance"
      />,
    );
    expect(StyleSheet.flatten(screen.getByText('Night').props.style).color).toBe('#6BB8FF');
    expect(flat('appearance-night')).toMatchObject({ backgroundColor: dark.accentTint, borderColor: dark.accentBorder });
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
