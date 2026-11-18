/**
 * What a Daily Brief section page calls back into Ask with. Swift passes `ask` and `stopVoiceReply` closures
 * into `BriefSectionDetailView` (DailyBriefView.swift:110-113, 04fa8d8); a route cannot take closures, so the
 * open `AskNexdoView` registers its own here while it is mounted.
 */
export type BriefHandlers = {
  ask: (query: string) => void;
  /** `stopSpeech` (AskNexdoView.swift:238): the page reads on the phone, after Ask's voice reply stops. */
  stopVoiceReply: () => void;
};

let current: BriefHandlers | null = null;

export function setBriefHandlers(next: BriefHandlers | null) {
  current = next;
}

export function briefHandlers(): BriefHandlers | null {
  return current;
}
