import { router } from 'expo-router';

import { ChangePasswordScreen } from '../../src/features/help/ChangePasswordScreen';
import { ElevatedSurface } from '../../src/theme';

/** `NavigationLink { ChangePasswordView() }` (ProfileView.swift:69): pushed inside the Account sheet. */
export default function ChangePassword() {
  return (
    <ElevatedSurface>
      <ChangePasswordScreen onBack={() => router.back()} />
    </ElevatedSurface>
  );
}
