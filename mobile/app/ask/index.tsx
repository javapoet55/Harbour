import { useLocalSearchParams } from 'expo-router';

import { AskNexdoView } from '../../src/components/AskNexdoView';

/**
 * `AskNexdoView(initialPrompt:)` — the suggestions page (ios/App/AskNexdoView.swift:89, body :182).
 *
 * `prompt` carries `askPrompt` (RootView.swift:88): the Ask AI tab item opens it empty, and Weekly
 * Summary's "Plan next week" opens it with a prefilled prompt.
 */
export default function Ask() {
  const { prompt } = useLocalSearchParams<{ prompt?: string }>();
  return <AskNexdoView textPage={false} initialPrompt={typeof prompt === 'string' ? prompt : ''} />;
}
