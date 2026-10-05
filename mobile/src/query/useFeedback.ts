import { useMutation } from '@tanstack/react-query';

import { feedbackApi } from '../api/feedback';

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
