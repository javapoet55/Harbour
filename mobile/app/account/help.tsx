import { router } from 'expo-router';

import { HelpScreen } from '../../src/features/help/HelpScreen';
import { ElevatedSurface } from '../../src/theme';

/** `NavigationLink { HelpView() }` (ProfileView.swift:66): pushed inside the Account sheet. */
export default function Help() {
  return (
    <ElevatedSurface>
      <HelpScreen onBack={() => router.back()} onFeedback={() => router.push('/account/feedback')} />
    </ElevatedSurface>
  );
}
