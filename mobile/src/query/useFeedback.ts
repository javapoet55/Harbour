import { useMutation } from '@tanstack/react-query';

import { bugReportApi, feedbackApi } from '../api/feedback';
import type { BugReportInput } from '../features/bugReport/model';

/**
 * `submit()` (ios/App/FeedbackView.swift:65-72): trims both texts before sending. `id` is the form's
 * own UUID, made once when it opens and reused on every retry, so a retry cannot file twice.
 */
export function useSubmitFeedback() {
  return useMutation({
    mutationFn: ({ id, title, description, stars }: { id: string; title: string; description: string; stars: number }) =>
      feedbackApi.submit({ id, title: title.trim(), description: description.trim(), stars }),
  });
}

/**
 * `send()` (ios/App/BugReportView.swift:184-195). The caller passes the FROZEN input from
 * `bugSubmission`, so Retry Send repeats the first request byte for byte and gets the same reference.
 * Show `bugFailureMessage(error)` on failure, and clear the draft only on success.
 */
export function useSubmitBugReport() {
  return useMutation({
    mutationFn: (input: BugReportInput) => bugReportApi.submit(input),
  });
}
