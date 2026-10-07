import type { TaskAgentCandidate, TaskAgentEnvelope, TaskAgentEvidence, TaskAgentRun } from '../api/taskAgent';
import { getApiUrl } from '../config';

/**
 * The pure parts of `TaskAgentCard` (ios/App/TaskAgentCard.swift): status copy, which buttons a run
 * offers, warning filters and the rating summary. Kept apart from the view so each rule is testable.
 */

/** `label` (TaskAgentCard.swift:33-45). */
export function statusTitle(status: string | null | undefined): string {
  switch (status) {
    case 'NEEDS_INPUT':
      return 'One detail before I start';
    case 'QUEUED':
      return 'Research queued';
    case 'RUNNING':
      return 'NexDo is working on this';
    case 'PAUSED':
      return 'Research paused';
    case 'BLOCKED':
      return 'Search connections needed';
    case 'READY_FOR_REVIEW':
      return 'Shortlist and drafts ready';
    case 'NO_RESULTS':
      return 'No matching providers found';
    case 'CANCELLED':
      return 'Research cancelled';
    default:
      return 'Research needs a retry';
  }
}

export const SEARCHING_STATUSES = ['QUEUED', 'RUNNING'];

/** The question keys Swift no longer asks; a run left there is searched straight away (`:67`, `:154-159`). */
export const RETIRED_QUESTION_KEYS = ['urgency', 'preferences'];

/** `findingBusinesses` (TaskAgentCard.swift:46-48). */
export function isFindingBusinesses(run: TaskAgentRun | null | undefined, searchRequestPending: boolean, error: string | null): boolean {
  return searchRequestPending || (error === null && SEARCHING_STATUSES.includes(run?.status ?? ''));
}

/** `hasBusinessResearch` (TaskAgentCard.swift:165): eligible, or a run already exists. */
export function hasBusinessResearch(envelope: TaskAgentEnvelope | null | undefined): boolean {
  return envelope?.intent?.eligible === true || (envelope?.run ?? null) !== null;
}

/**
 * Whether a contact action with no saved person is for a business (TodayActionsView.swift:113-123,
 * TaskActionView.swift:331): a business already chosen, an eligible task, or research under way. Android
 * ahead of iOS: Swift counts any run, so a person task whose research was once cancelled (or failed) still
 * asked to "Find a business"; a cancelled or failed run no longer counts.
 */
export function isBusinessAction(envelope: TaskAgentEnvelope | null | undefined, businessCandidateID: string | null | undefined): boolean {
  const run = envelope?.run ?? null;
  return businessCandidateID != null || envelope?.intent?.eligible === true || (run !== null && !['CANCELLED', 'FAILED'].includes(run.status));
}

/** `fallbackReason` (TaskAgentCard.swift:166). */
export function fallbackReason(envelope: TaskAgentEnvelope | null | undefined): string | null {
  const category = envelope?.intent?.category ?? '';
  return ['PROCUREMENT', 'RESEARCH', 'LOGISTICS'].includes(category) ? (envelope?.intent?.reason ?? null) : null;
}

/**
 * The resume at `TaskAgentCard.swift:154-159`: a run left at a retired question with a location
 * already known is searched on load, without asking.
 */
export function needsAutoSearch(run: TaskAgentRun | null | undefined): boolean {
  return (
    !!run &&
    run.status === 'NEEDS_INPUT' &&
    !!run.question &&
    RETIRED_QUESTION_KEYS.includes(run.question.key) &&
    run.slots.location.trim().length > 0
  );
}

/** `isSearchNotice(_:)` (TaskAgentCard.swift:404-406). */
export function isSearchNotice(text: string): boolean {
  return text.startsWith('Listings are not a license check') || text.startsWith('Some businesses were hidden');
}

/** The warnings shown inline (TaskAgentCard.swift:94): not Yelp's, and not a search notice. */
export function inlineWarnings(warnings: string[]): string[] {
  return warnings.filter((warning) => !warning.startsWith('Yelp is not connected.') && !isSearchNotice(warning));
}

export type RunControl = { title: string; action: 'pause' | 'resume' | 'retry' | 'cancel' | 'search' };

/** Finished runs the server starts a new search from (f12ef09). */
export const SEARCH_AGAIN_STATUSES = ['NO_RESULTS', 'CANCELLED'];

/**
 * The controls row (TaskAgentCard.swift:99-103), in Swift's order. Android ahead of iOS: NO_RESULTS and
 * CANCELLED were dead ends in Swift; the server now starts a new search from either (f12ef09), so they offer
 * "Search again". It sends `search` with the area in the card's field, so the area can be changed.
 */
export function runControls(status: string): RunControl[] {
  const controls: RunControl[] = [];
  if (SEARCH_AGAIN_STATUSES.includes(status)) controls.push({ title: 'Search again', action: 'search' });
  if (SEARCHING_STATUSES.includes(status)) controls.push({ title: 'Pause', action: 'pause' });
  if (['PAUSED', 'FAILED', 'BLOCKED'].includes(status)) {
    controls.push(status === 'PAUSED' ? { title: 'Resume', action: 'resume' } : { title: 'Retry', action: 'retry' });
  }
  if (!['CANCELLED', 'READY_FOR_REVIEW', 'NO_RESULTS'].includes(status)) controls.push({ title: 'Cancel search', action: 'cancel' });
  return controls;
}

/** `String.capitalized`: every word's first letter upper-cased, the rest lower-cased. */
export function capitalizedWords(value: string): string {
  return value.toLowerCase().replace(/(^|\s)(\S)/g, (_, space: string, letter: string) => space + letter.toUpperCase());
}

/** `service.prefix(1).uppercased() + service.dropFirst()` (TaskAgentCard.swift:462). */
export function capitalizedFirst(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** The subtitle under the status title (TaskAgentCard.swift:462). */
export function serviceLine(run: TaskAgentRun): string {
  return `${capitalizedFirst(run.service)} · ${run.slots.location.length === 0 ? 'Location needed' : run.slots.location}`;
}

/** `ratingSummary`'s evidence (TaskAgentCard.swift:217): Google's, else the first. */
export function ratingEvidence(candidate: TaskAgentCandidate): TaskAgentEvidence | undefined {
  return candidate.evidence.find((item) => item.source === 'Google') ?? candidate.evidence[0];
}

/** `String(format: "%.1f", rating)`, or "Not rated". */
export function ratingText(evidence: TaskAgentEvidence | undefined): string {
  return typeof evidence?.rating === 'number' ? evidence.rating.toFixed(1) : 'Not rated';
}

/** `"(\(reviews.formatted()) reviews)"`, or "Reviews unavailable" (TaskAgentCard.swift:228). */
export function reviewCountText(evidence: TaskAgentEvidence | undefined): string {
  return typeof evidence?.reviews === 'number' ? `(${new Intl.NumberFormat().format(evidence.reviews)} reviews)` : 'Reviews unavailable';
}

export type StarKind = 'full' | 'half' | 'empty';

/** The five stars (TaskAgentCard.swift:223-225). */
export function stars(rating: number): StarKind[] {
  return [0, 1, 2, 3, 4].map((i) => (rating >= i + 1 ? 'full' : rating > i ? 'half' : 'empty'));
}

/** A review's line: `"\(rating "%.0f" ?? "—")/5 · \(published)"` (TaskAgentCard.swift:383). */
export function reviewLine(rating: number | null | undefined, published: string): string {
  return `${typeof rating === 'number' ? rating.toFixed(0) : '—'}/5 · ${published}`;
}

/** `URL(string:)` with `url.scheme == "https"` (TaskAgentCard.swift:262, :314). */
export function httpsUrl(value: string | null | undefined): string | null {
  return value && /^https:\/\//i.test(value.trim()) ? value.trim() : null;
}

/**
 * `AppEnvironment.web(path)` (NexdoApp.swift:12, APIEnvironment.swift:37-40): a page on the same
 * server as the API.
 */
export function webUrl(path: string): string {
  const base = getApiUrl().replace(/\/+$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

/** The preselected business (TaskAgentCard.swift:162): the stored action's choice, else the first. */
export function preselectedCandidate(candidates: TaskAgentCandidate[], storedChoice: string | null | undefined): string | null {
  if (candidates.length === 0) return null;
  return candidates.find((candidate) => candidate.id === storedChoice)?.id ?? candidates[0].id;
}

/** The outreach draft's limit: `String($0.prefix(2000))` (TaskAgentCard.swift:330). */
export const DRAFT_LIMIT = 2000;
