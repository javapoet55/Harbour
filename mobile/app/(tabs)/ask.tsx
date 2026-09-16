import { Redirect } from 'expo-router';

/**
 * UNREACHABLE by design, and deliberately so in Swift too: `NexdoTabShell` keeps a `case .askAI`
 * branch in its content switch (ios/App/RootView.swift:102) that nothing can select, because the
 * tab-bar button opens the Ask sheet instead of changing `selection` (`:120`).
 *
 * The route still has to exist for `Tabs.Screen name="ask"` to render its tab-bar item. If it is ever
 * reached — a deep link, say — it forwards to the sheet rather than showing an empty tab.
 */
export default function AskTab() {
  return <Redirect href="/ask" />;
}
