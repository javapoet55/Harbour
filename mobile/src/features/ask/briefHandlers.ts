/**
 * What a Daily Brief section page calls back into Ask with. Swift passes `ask` and `read` closures
 * into `BriefSectionDetailView` (DailyBriefView.swift:106-111); a route cannot take closures, so the
 * open `AskNexdoView` registers its own here while it is mounted.
 */
export type BriefHandlers = {
  ask: (query: string) => void;
  /** Answers the message when reading cannot start (OpenAI sharing off), for the page to show; else `null`. */
  read: (index: number, text: string) => string | null;
};

let current: BriefHandlers | null = null;

export function setBriefHandlers(next: BriefHandlers | null) {
  current = next;
}

export function briefHandlers(): BriefHandlers | null {
  return current;
}
