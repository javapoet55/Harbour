import { useLocalSearchParams } from 'expo-router';

import { AskNexdoView } from '../../src/components/AskNexdoView';

/** `AskNexdoView(textPage: true)` — "Free form Text" (ios/App/AskNexdoView.swift:271). */
export default function AskText() {
  const { prompt } = useLocalSearchParams<{ prompt?: string }>();
  return <AskNexdoView textPage initialPrompt={typeof prompt === 'string' ? prompt : ''} />;
}
