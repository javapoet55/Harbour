import { useNavigation } from 'expo-router';
import { useEffect, useState } from 'react';

import { useTheme } from '../theme';

/**
 * The surface of a `[.medium, .large]` sheet, which on iOS 26 depends on the detent (UI-parity pass 2).
 *
 * At `.medium` the sheet is a floating GLASS card, so both the sheet and its inset-grouped rows are
 * translucent greys: measured (233, 233, 235) and (216, 216, 224) on `today-attention-sheet-half`. At
 * `.large` it becomes an ordinary opaque sheet: the grouped background (242, 242, 247) with white rows
 * (`today-attention-sheet-full`). Android's bottom sheet has no glass, so the measured colours are used
 * as solid fills and switched on react-native-screens' `sheetDetentChange` event. Dark is the elevated
 * palette at both detents, as measured on `today-attention-sheet-dark`.
 *
 * A sheet STACKED on another sheet is lighter at `.medium`: (239, 239, 241) with (225, 225, 227) rows
 * (`today-reschedule-all`).
 */
export function useSheetSurface(initialDetent = 0, { stacked = false }: { stacked?: boolean } = {}): { background: string; row: string; detent: number } {
  const theme = useTheme({ elevated: true });
  const navigation = useNavigation();
  const [detent, setDetent] = useState(initialDetent);

  useEffect(() => {
    const listen = (navigation as unknown as {
      addListener?: (event: 'sheetDetentChange', callback: (event: { data: { index: number; stable: boolean } }) => void) => () => void;
    }).addListener;
    if (!listen) return undefined;
    return listen.call(navigation, 'sheetDetentChange', (event) => {
      if (event.data.stable) setDetent(event.data.index);
    });
  }, [navigation]);

  return { ...sheetSurface(theme.scheme, detent, stacked), detent };
}

export function sheetSurface(scheme: 'light' | 'dark', detent: number, stacked = false): { background: string; row: string } {
  if (scheme === 'dark') return { background: '#1C1C1E', row: '#2C2C2E' };
  if (detent !== 0) return { background: '#F2F2F7', row: '#FFFFFF' };
  return stacked ? { background: '#EFEFF1', row: '#E1E1E3' } : { background: '#E9E9EB', row: '#D8D8E0' };
}
