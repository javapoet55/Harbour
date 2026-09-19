import { Platform } from 'react-native';

import { mediumDate, momentLabel, shortTimeIn } from '../features/moments/dates';
import { menuPlacement } from '../features/moments/form';
import { pushedBarHeight } from './PushedHeader';
import { sheetSurface } from './SheetSurface';

/** UI-parity pass 2: the shared pieces, measured off the Swift captures. */

describe('menuPlacement (SwiftUI menu popover, `moments-filter-menu`)', () => {
  const screen = { width: 384, height: 853 };

  it('opens OVER a button on the right, trailing edges aligned, 250pt wide', () => {
    const button = { x: 310, y: 170, width: 56, height: 44 };
    const place = menuPlacement(button, 6, screen.width, screen.height);
    expect(place.width).toBe(250);
    expect(place.left + place.width).toBe(button.x + button.width);
    expect(place.top).toBe(button.y);
  });

  it('aligns leading edges for a button on the left', () => {
    const place = menuPlacement({ x: 20, y: 300, width: 80, height: 44 }, 3, screen.width, screen.height);
    expect(place.left).toBe(20);
  });

  it('never leaves the screen', () => {
    const place = menuPlacement({ x: 360, y: 100, width: 20, height: 44 }, 2, screen.width, screen.height);
    expect(place.left + place.width).toBeLessThanOrEqual(screen.width - 12);
  });

  it('opens upward from a button near the bottom, ending at its bottom edge', () => {
    const button = { x: 20, y: 760, width: 100, height: 44 };
    const place = menuPlacement(button, 6, screen.width, screen.height);
    expect(place.top + place.maxHeight).toBe(button.y + button.height);
  });
});

describe('sheetSurface (`today-attention-sheet-half`, `-full`, `today-reschedule-all`)', () => {
  it('is glass at .medium and opaque grouped at .large', () => {
    expect(sheetSurface('light', 0)).toEqual({ background: '#E9E9EB', row: '#D8D8E0' });
    expect(sheetSurface('light', 1)).toEqual({ background: '#F2F2F7', row: '#FFFFFF' });
  });

  it('is lighter for a sheet stacked on a sheet', () => {
    expect(sheetSurface('light', 0, true)).toEqual({ background: '#EFEFF1', row: '#E1E1E3' });
  });

  it('uses the elevated dark palette at both detents', () => {
    expect(sheetSurface('dark', 0)).toEqual(sheetSurface('dark', 1));
  });
});

describe('dates follow the locale, built with .format() (SHARED-REQUESTS "DateField")', () => {
  const at = Date.parse('2026-09-19T17:20:00.000Z');

  it('orders the parts by locale', () => {
    expect(mediumDate(at, 'Asia/Kolkata', 'en-GB')).toBe('19 Sept 2026');
    expect(mediumDate(at, 'Asia/Kolkata', 'en-US')).toBe('Sep 19, 2026');
  });

  it('joins medium date and short time with "at", as iOS 26 does in English', () => {
    expect(momentLabel(at, 'Asia/Kolkata', 'en-US')).toBe('Sep 19, 2026 at 10:50 PM');
    expect(shortTimeIn(at, 'Asia/Kolkata', 'en-US')).toBe('10:50 PM');
  });
});

describe('pushedBarHeight', () => {
  it('is the status bar plus the toolbar', () => {
    expect(pushedBarHeight(31.5)).toBe(31.5 + (Platform.OS === 'android' ? 56 : 44));
  });
});
