import { createContext, useContext } from 'react';

import type { ColorScheme } from './colors';

/**
 * A subtree drawn in a FIXED colour scheme, whatever the phone's: SwiftUI's `.environment(\.colorScheme)`
 * on a view whose design is fixed light (Moments' Review schedule and Schedule confirmed use
 * `ScheduleDesign`'s fixed colours). Shared controls inside — date pills, fields, switches — then
 * resolve the same palette as the design around them instead of the phone's dark one.
 */
const SchemeContext = createContext<ColorScheme | null>(null);

export function FixedScheme({ scheme, children }: { scheme: ColorScheme; children: React.ReactNode }) {
  return <SchemeContext.Provider value={scheme}>{children}</SchemeContext.Provider>;
}

export function useFixedScheme(): ColorScheme | null {
  return useContext(SchemeContext);
}
