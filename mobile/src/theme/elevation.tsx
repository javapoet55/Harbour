import { createContext, useContext } from 'react';

/**
 * Whether the subtree is inside a presented sheet, and so takes the *elevated* system background
 * colours (see `useTheme`).
 *
 * On iOS this is not a value a view passes down by hand — a sheet installs an elevated trait
 * collection and every descendant resolves `.systemBackground` and friends against it. Screens here
 * were calling `useTheme({ elevated: true })` for their own colours, but a shared component two
 * levels down had no way to know, so it resolved the *base* palette: in dark mode `ProfileCard`
 * painted itself `#1C1C1E` on a sheet that was also `#1C1C1E`, and the card stopped reading as a
 * card. A context is the closest equivalent to the trait collection, and it fixes every shared
 * component at once rather than threading a prop through each one.
 */
const ElevatedContext = createContext(false);

/** Wrap a screen that is presented as a sheet. */
export function ElevatedSurface({ children }: { children: React.ReactNode }) {
  return <ElevatedContext.Provider value={true}>{children}</ElevatedContext.Provider>;
}

export function useElevated(): boolean {
  return useContext(ElevatedContext);
}
