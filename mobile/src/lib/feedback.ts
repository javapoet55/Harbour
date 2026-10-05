/**
 * The Feedback form's rules (ios/App/FeedbackView.swift:14-17, `:22-40`, `:67-71`). Lengths are UTF-16
 * units, as Swift counts `utf16` and the server's `max` does — which is JavaScript's `length`.
 */

export const FEEDBACK_TITLE_LIMIT = 160;
export const FEEDBACK_DESCRIPTION_LIMIT = 5000;

/** `valid`: both texts non-blank and within their limits, and 1–5 stars. */
export function feedbackValid({ title, description, stars }: { title: string; description: string; stars: number }): boolean {
  return (
    title.trim() !== '' &&
    title.length <= FEEDBACK_TITLE_LIMIT &&
    description.trim() !== '' &&
    description.length <= FEEDBACK_DESCRIPTION_LIMIT &&
    Number.isInteger(stars) &&
    stars >= 1 &&
    stars <= 5
  );
}

/** The counter under a field ("12/160"), red once over. */
export function feedbackCounter(text: string, limit: number): { label: string; over: boolean } {
  return { label: `${text.length}/${limit}`, over: text.length > limit };
}

/** The caption under the stars (`:39`). */
export function starsCaption(stars: number): string {
  return stars === 0 ? 'Choose 1 to 5 stars.' : `${stars} out of 5 stars`;
}

/** Each star's accessibility label (`:35`). */
export function starLabel(value: number): string {
  return `${value} ${value === 1 ? 'star' : 'stars'}`;
}

export const FEEDBACK_THANKS = {
  title: 'Thank you for your feedback!',
  message: 'Your feedback has been received. Thank you for helping us make Nexdo better.',
};
