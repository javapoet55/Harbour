import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { fittedScale } from '../../../components/AskParts';
import { ShoppingActionBar } from '../components';

/**
 * The action bar labels are `.lineLimit(2).minimumScaleFactor(0.78)` (ShoppingViews.swift:314-323):
 * SwiftUI wraps them between words and shrinks rather than split one. On a OnePlus the RN label
 * painted "AI Powered Reco / mmendations", because `adjustsFontSizeToFit` does nothing on Android.
 */
describe('ShoppingActionBar labels', () => {
  const layout = async (node: Parameters<typeof fireEvent>[0], width: number) =>
    await fireEvent(node, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width, height: 20 } } });

  // The measured words sit in a layer hidden from accessibility.
  const word = (text: string) => screen.getByText(text, { includeHiddenElements: true });

  const fontSizeOf = (label: string) => StyleSheet.flatten(screen.getByText(label).props.style).fontSize;

  const renderBar = () => render(<ShoppingActionBar busy={false} onComplete={jest.fn()} onRecommendations={jest.fn()} />);

  it('shrinks the label until its widest word fits a line', async () => {
    await renderBar();
    const label = screen.getByText('AI Powered Recommendations');
    await layout(label.parent!, 110);
    await layout(word('AI'), 16);
    await layout(word('Powered'), 60);
    await layout(word('Recommendations'), 125);

    expect(fontSizeOf('AI Powered Recommendations')).toBeCloseTo(15 * (110 / 125));
    expect(screen.getByText('AI Powered Recommendations').props.numberOfLines).toBe(2);
  });

  it('keeps the full size when every word already fits', async () => {
    await renderBar();
    await layout(screen.getByText('Complete Shopping').parent!, 120);
    await layout(word('Complete'), 70);
    await layout(word('Shopping'), 66);

    expect(fontSizeOf('Complete Shopping')).toBe(15);
  });

  it('stops at the 0.78 scale factor, as SwiftUI does', async () => {
    await renderBar();
    await layout(screen.getByText('AI Powered Recommendations').parent!, 80);
    await layout(word('Recommendations'), 125);

    expect(fontSizeOf('AI Powered Recommendations')).toBeCloseTo(15 * 0.78);
  });
});

describe('fittedScale', () => {
  it('is 1 until both widths are known, or when the run fits', () => {
    expect(fittedScale(0, 125, 0.78)).toBe(1);
    expect(fittedScale(110, 0, 0.78)).toBe(1);
    expect(fittedScale(130, 125, 0.78)).toBe(1);
  });

  it('scales by the ratio, clamped at the minimum', () => {
    expect(fittedScale(100, 125, 0.78)).toBeCloseTo(0.8);
    expect(fittedScale(50, 125, 0.78)).toBe(0.78);
  });
});
