/**
 * What a Daily Brief section page calls back into Ask with. Swift passes `ask` and `read` closures
 * into `BriefSectionDetailView` (DailyBriefView.swift:241-246); a route cannot take closures, so the
 * open `AskNexdoView` registers its own here while it is mounted.
 */
export type BriefHandlers = {
  ask: (query: string) => void;
  read: (index: number, text: string) => void;
};

let current: BriefHandlers | null = null;

export function setBriefHandlers(next: BriefHandlers | null) {
  current = next;
}

export function briefHandlers(): BriefHandlers | null {
  return current;
}
