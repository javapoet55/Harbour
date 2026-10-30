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

/**
 * A subtree whose tappable and active colour is `Color.wellnessAccent`: Swift's `.tint(.wellnessAccent)` on
 * the Important Moments screens (ce6d20a). Inside it `useTheme` resolves `link`, `accent` (with its tint and
 * border) and `switchOn` to the Wellness accent; a toolbar item asks `useTheme({ toolbar: true })` to keep
 * the app's own `link` (§24 bug 4: the toolbar icons stay readable in dark on Android).
 */
const WellnessTintContext = createContext(false);

export function WellnessTint({ children }: { children: React.ReactNode }) {
  return <WellnessTintContext.Provider value>{children}</WellnessTintContext.Provider>;
}

export function useWellnessTint(): boolean {
  return useContext(WellnessTintContext);
}

/** A route's default export, drawn inside `WellnessTint`. */
export function withWellnessTint<P extends object>(Screen: React.ComponentType<P>): React.ComponentType<P> {
  function Tinted(props: P) {
    return (
      <WellnessTint>
        <Screen {...props} />
      </WellnessTint>
    );
  }
  Tinted.displayName = `WellnessTint(${Screen.displayName ?? Screen.name})`;
  return Tinted;
}
