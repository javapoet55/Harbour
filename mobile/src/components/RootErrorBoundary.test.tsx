import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { RootErrorBoundary } from './RootErrorBoundary';

/**
 * The boundary's shape is Swift's app-wide failure alert (`ios/App/RootView.swift:63-65`): the title
 * "Unable to complete request", the message, and one OK.
 */

function Boom({ throws }: { throws: boolean }): React.ReactElement {
  if (throws) throw new Error('Something broke while rendering.');
  return <Text>Everything is fine</Text>;
}

let consoleError: jest.SpyInstance;
beforeEach(() => {
  // React logs the caught error itself; the boundary adds the component stack in development.
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => consoleError.mockRestore());

it('renders its children when nothing throws', async () => {
  await render(
    <RootErrorBoundary>
      <Boom throws={false} />
    </RootErrorBoundary>,
  );

  expect(screen.getByText('Everything is fine')).toBeTruthy();
  expect(screen.queryByTestId('root-error-boundary')).toBeNull();
});

it('shows Swift’s title and the error’s own message instead of a blank screen', async () => {
  await render(
    <RootErrorBoundary>
      <Boom throws />
    </RootErrorBoundary>,
  );

  expect(screen.getByTestId('root-error-boundary')).toBeTruthy();
  expect(screen.getByText('Unable to complete request')).toBeTruthy();
  expect(screen.getByText('Something broke while rendering.')).toBeTruthy();
  expect(screen.getByTestId('root-error-ok')).toBeTruthy();
});

it('reports the error to the caller', async () => {
  const onError = jest.fn();

  await render(
    <RootErrorBoundary onError={onError}>
      <Boom throws />
    </RootErrorBoundary>,
  );

  expect(onError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ componentStack: expect.any(String) }));
});

it('OK re-renders the tree', async () => {
  // A flag rather than `rerender`: re-rendering the whole tree from the test leaves React's
  // concurrent root in a state that upsets the tests after this one.
  let broken = true;
  function Flaky(): React.ReactElement {
    if (broken) throw new Error('Something broke while rendering.');
    return <Text>Everything is fine</Text>;
  }

  await render(
    <RootErrorBoundary>
      <Flaky />
    </RootErrorBoundary>,
  );
  expect(screen.getByTestId('root-error-boundary')).toBeTruthy();

  broken = false;
  fireEvent.press(screen.getByTestId('root-error-ok'));

  await waitFor(() => expect(screen.getByText('Everything is fine')).toBeTruthy());
});

it('falls back to a plain sentence when the error carries no message', async () => {
  function Silent(): React.ReactElement {
    throw new Error('');
  }

  await render(
    <RootErrorBoundary>
      <Silent />
    </RootErrorBoundary>,
  );

  expect(screen.getByText('Please try again.')).toBeTruthy();
});
