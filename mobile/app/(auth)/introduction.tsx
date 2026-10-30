import { router } from 'expo-router';

import { InstallIntroduction } from '../../src/features/introduction/InstallIntroduction';
import { useIntroduction } from '../../src/store/introduction';

/**
 * The first-install introduction (`entryFlow`, ios/App/RootView.swift:128-137). Finishing it marks it
 * seen and puts sign-in in its place; Skip and Get Started open sign-in with Create Account already up
 * (`SignInView(startWithSignUp: true)`).
 *
 * The sign-up request rides on this one navigation as a param, so it cannot outlive it: Swift's
 * `startWithSignUp` is never reset and reopens the sheet after a later sign-out (§24 Swift bug 7).
 */
export default function Introduction() {
  return (
    <InstallIntroduction
      onFinish={(signUp) => {
        void useIntroduction.getState().complete();
        router.replace(signUp ? { pathname: '/sign-in', params: { signUp: '1' } } : '/sign-in');
      }}
    />
  );
}
