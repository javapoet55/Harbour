import { router } from 'expo-router';

import { ChangePasswordScreen } from '../../src/features/help/ChangePasswordScreen';
import { useSession } from '../../src/store/session';
import { ElevatedSurface } from '../../src/theme';

/** `NavigationLink { ChangePasswordView() }` (ProfileView.swift:69): pushed inside the Account sheet. */
export default function ChangePassword() {
  return (
    <ElevatedSurface>
      <ChangePasswordScreen
        onBack={() => router.back()}
        // `PasswordResetView(initialEmail: model.profile?.email ?? "")` (ProfileView.swift:204-206).
        onForgotPassword={() => router.push({ pathname: '/account/reset-password', params: { email: useSession.getState().profile?.email ?? '' } })}
      />
    </ElevatedSurface>
  );
}
