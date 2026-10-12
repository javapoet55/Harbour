// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AdminDataAssistant } from './admin-data-assistant';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('fills each of the fifteen prompts without sending and submits the selected question and date range on Enter', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ answer: 'The requested metric is unavailable.', chart: null }));
  vi.stubGlobal('fetch', fetch);
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => { callback(); return 1; });
  render(<AdminDataAssistant days={7} from="2026-10-01" to="2026-10-07"/>);
  const input = screen.getByRole('textbox') as HTMLTextAreaElement;
  const prompts = screen.getByLabelText('Suggested questions').querySelectorAll('button');
  expect(prompts).toHaveLength(15);
  for (const prompt of prompts) {
    fireEvent.click(prompt);
    expect(input.value).toBe(prompt.textContent);
    expect(document.activeElement).toBe(input);
    expect(fetch).not.toHaveBeenCalled();
  }
  fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
  fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: 'Enter' });
  await waitFor(() => expect(screen.getByText('The requested metric is unavailable.')).toBeTruthy());
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
    question: 'What is estimated monthly revenue by plan? Use plan-based estimates, not verified payments.', days: 7, from: '2026-10-01', to: '2026-10-07',
  });
});
