import { render } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { StyleSheet } from 'react-native';

import { Text } from '../../../components/Text';
import { useAppearance } from '../../../store/appearance';
import type { WellnessModule } from '../art';
import { WellnessChooser } from '../WellnessChooser';
import { WellnessModuleGuide } from '../WellnessModuleGuide';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(() => ({ width: 393, height: 852, scale: 3, fontScale: 1 })),
}));

/**
 * The module guides keep Swift's FIXED light design in both phone themes (WellnessModuleGuide.swift:102):
 * every text, icon, plate and background is a literal colour, never a theme token. So the whole rendered
 * tree must come out IDENTICAL with the app in Day and in Night. The chooser has its own dark mode since
 * 4185501 and is checked against Swift's instead. Swift's own dark-mode rendering is a bug ("For the team",
 * §22); this is the design, not that bug.
 */
type Node = { type: string; props: Record<string, unknown>; children: (Node | string)[] | null };

/**
 * Each node's style FLATTENED, i.e. what is drawn. `Text` puts the theme's ink first in its style array
 * and the caller's colour after it, so the raw tree carries an overridden theme entry that never shows.
 */
function drawn(node: unknown): unknown {
  if (node == null || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map(drawn);
  const { type, props, children } = node as Node;
  return { type, props: { ...props, style: StyleSheet.flatten(props.style as never) }, children: drawn(children) };
}

async function rendered(ui: ReactElement, appearance: 'day' | 'night', mustShow: string): Promise<string> {
  useAppearance.setState({ appearance });
  const view = await render(ui);
  const tree = JSON.stringify(drawn(view.toJSON()));
  await view.unmount();
  // Guard against a vacuous pass: two blank renders would compare equal.
  expect(tree).toContain(mustShow);
  return tree;
}

afterEach(() => {
  useAppearance.setState({ appearance: 'system' });
});

describe('Wellness screens in dark mode', () => {
  it('the comparison catches a themed colour (control)', async () => {
    // A `Text` with no colour takes the theme's ink, which differs between Day and Night.
    expect(await rendered(<Text>Themed</Text>, 'night', 'Themed')).not.toBe(await rendered(<Text>Themed</Text>, 'day', 'Themed'));
  });

  /**
   * 4185501: Swift's chooser now has its own dark mode (WellnessChooserView.swift `isDark`), so it is
   * no longer identical in Night. Light is untouched; dark swaps the art for a moon, the ink for
   * `.primary`, the module colours for `darkAccent`, and the surfaces for system backgrounds.
   */
  it('the chooser follows Swift’s dark mode in Night, and is unchanged in Day', async () => {
    const ui = <WellnessChooser onModule={jest.fn()} onExit={jest.fn()} />;
    const day = await rendered(ui, 'day', 'A little time');
    const night = await rendered(ui, 'night', 'A little time');
    expect(night).not.toBe(day);
    expect(day).toContain('#090930');
    expect(day).not.toContain('wellness-hero-moon');
    expect(day).toContain('wellness.shopping.art');
    expect(night).toContain('wellness-hero-moon');
    expect(night).not.toContain('wellness.shopping.art');
    expect(night).not.toContain('#090930');
    for (const accent of ['#59E59E', '#FFA861', '#B8A6FF', '#FF7AB3']) expect(night).toContain(accent);
  });

  it.each<WellnessModule>(['calories', 'pomodoro', 'moments', 'shopping'])('the %s guide renders exactly as in light mode', async (kind) => {
    const ui = <WellnessModuleGuide kind={kind} onContinue={jest.fn()} onHome={jest.fn()} />;
    expect(await rendered(ui, 'night', 'How It Works')).toBe(await rendered(ui, 'day', 'How It Works'));
  });

  it('keeps the guide Back button on the light glass plate in Night', async () => {
    const tree = await rendered(<WellnessModuleGuide kind="moments" onContinue={jest.fn()} onHome={jest.fn()} />, 'night', 'How It Works');
    expect(tree).toContain('rgba(255, 255, 255, 0.78)');
    expect(tree).not.toContain('rgba(120, 120, 128, 0.2)');
  });
});
