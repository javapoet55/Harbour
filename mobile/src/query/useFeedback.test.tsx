import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react-native';

const mockSubmit = jest.fn();
jest.mock('../api/feedback', () => ({ feedbackApi: { submit: (...args: unknown[]) => mockSubmit(...args) } }));

import { useSubmitFeedback } from './useFeedback';

test('submits trimmed text under the form id, and a retry reuses that id', async () => {
  mockSubmit.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ ok: true });
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false, gcTime: Infinity } } });
  let mutation: ReturnType<typeof useSubmitFeedback> | undefined;
  function Probe() {
    mutation = useSubmitFeedback();
    return null;
  }
  await render(
    <QueryClientProvider client={queryClient}>
      <Probe />
    </QueryClientProvider>,
  );
  const input = { id: 'F1', title: '  Idea ', description: ' More themes\n', stars: 4 };
  await act(async () => {
    await expect(mutation!.mutateAsync(input)).rejects.toThrow('offline');
  });
  await act(async () => {
    await mutation!.mutateAsync(input);
  });
  expect(mockSubmit).toHaveBeenNthCalledWith(1, { id: 'F1', title: 'Idea', description: 'More themes', stars: 4 });
  expect(mockSubmit).toHaveBeenNthCalledWith(2, { id: 'F1', title: 'Idea', description: 'More themes', stars: 4 });
  queryClient.clear();
});
