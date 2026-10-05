import { router } from 'expo-router';

import { FeedbackScreen } from '../../src/features/help/FeedbackScreen';
import { ElevatedSurface } from '../../src/theme';

/** `NavigationLink { FeedbackView() }` from Account (ProfileView.swift:67) and Help (HelpView.swift:77). */
export default function Feedback() {
  return (
    <ElevatedSurface>
      <FeedbackScreen onDone={() => router.back()} />
    </ElevatedSurface>
  );
}
