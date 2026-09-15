import { Redirect } from 'expo-router';

import { ErrorView, LoadingView } from '../src/components';
import { useMe } from '../src/query/useMe';

export default function Index() {
  const me = useMe();
  if (me.data) return <Redirect href="/today" />;
  if (me.data === null) return <Redirect href="/sign-in" />;
  if (me.isError) {
    return <ErrorView title="Nexdo can’t reach the server" error={me.error} onRetry={() => me.refetch()} retrying={me.isFetching} />;
  }
  return <LoadingView />;
}
