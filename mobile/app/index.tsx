import { Redirect } from 'expo-router';
import { useEffect } from 'react';

import { ErrorView, SplashView } from '../src/components';
import { useMe } from '../src/query/useMe';
import { useIntroduction } from '../src/store/introduction';

export default function Index() {
  const me = useMe();
  const introductionCompleted = useIntroduction((state) => state.completed);

  // A signed-in session is never a first install, so it settles the flag for good (docs/android-polish.md §48).
  const signedIn = me.data != null;
  useEffect(() => {
    if (signedIn && introductionCompleted === false) void useIntroduction.getState().complete();
  }, [signedIn, introductionCompleted]);

  if (me.data) return <Redirect href="/today" />;
  // `entryFlow` (RootView.swift:128-137): signed out, the introduction comes first until it has been seen.
  if (me.data === null && introductionCompleted !== undefined) return <Redirect href={introductionCompleted ? '/sign-in' : '/introduction'} />;
  if (me.isError) {
    return <ErrorView title="Nexdo can’t reach the server" error={me.error} onRetry={() => me.refetch()} retrying={me.isFetching} />;
  }
  // Undecided: the brand splash, never a flash of the sign-in screen.
  return <SplashView />;
}
