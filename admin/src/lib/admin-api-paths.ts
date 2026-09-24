/** from/to query string for backend endpoints that take an exact reporting range. */
export const rangeQuery = (range: { from: string; to: string }) => new URLSearchParams({ from: range.from, to: range.to }).toString();
