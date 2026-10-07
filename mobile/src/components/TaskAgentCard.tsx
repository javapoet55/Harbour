import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Image, Keyboard, Linking, Pressable, StyleSheet, TextInput, View, type ViewStyle } from 'react-native';

import { composeMessageOutcome } from '../actions/composers';
import { useCoordinator } from '../actions/coordinator';
import type { TaskAgentAction, TaskAgentCandidate, TaskAgentRun } from '../api/taskAgent';
import {
  DRAFT_LIMIT,
  RETIRED_QUESTION_KEYS,
  capitalizedWords,
  fallbackReason as fallbackReasonFor,
  hasBusinessResearch,
  httpsUrl,
  inlineWarnings,
  isFindingBusinesses,
  isSearchNotice,
  needsAutoSearch,
  preselectedCandidate,
  ratingEvidence,
  ratingText,
  reviewCountText,
  reviewLine,
  runControls,
  SEARCH_AGAIN_STATUSES,
  serviceLine,
  stars,
  statusTitle,
  webUrl,
} from '../lib/taskAgent';
import { useTaskAgent, useUpdateTaskAgent } from '../query/useTaskAgent';
import { brand, isAndroid, useTheme, type Theme } from '../theme';
import { Text } from './Text';
import { withAlpha } from './TaskDetailParts';

/**
 * Port of `TaskAgentCard` (ios/App/TaskAgentCard.swift): business research for a task, the FIRST
 * item in Task Details' scroll (TaskDetailsView.swift:39).
 *
 * The card loads `GET /api/tasks/:id/agent` and polls every 4 s while the run is QUEUED or RUNNING
 * (`:137-179`, here `useTaskAgent(taskId, { poll: true })`). It reports `onResearchAvailable(eligible ||
 * run != nil)` (`:165`), which switches Task Details into its business layout.
 *
 * NOTHING IS EVER SENT AUTOMATICALLY: "Open in Messages" opens the system composer with an editable
 * draft (`:354-363`), and the person taps Send there.
 */

/** `Color(red: 0.34, green: 0.08, blue: 1)` (TaskAgentCard.swift:181). */
const BUSINESS_PURPLE = '#5714FF';
/** `Color(red: 0.96, green: 0.95, blue: 1)` (TaskAgentCard.swift:182). */
const BUSINESS_WASH = '#F5F2FF';
/** The index badge, `Color(red: 0.93, green: 0.90, blue: 1)` (`:192`). */
const BADGE_FILL = '#EDE6FF';
/** `Color.purple` and `Color.orange` — the iOS system colours. */
const SYSTEM_PURPLE = '#AF52DE';
const SYSTEM_ORANGE = '#FF9500';
/** "Most reviewed": `Color(red: 0, green: 0.55, blue: 0.30)` on `Color.green.opacity(0.09)` (`:206-208`). */
const REVIEWED_GREEN = '#008C4D';
const REVIEWED_FILL = 'rgba(52, 199, 89, 0.09)';
/** "Google Maps", `Color(red: 0.37, green: 0.37, blue: 0.37)` (`:373`). */
const GOOGLE_GREY = '#5E5E5E';
/** The run card's wash (`:105`). */
const CARD_GRADIENT = ['#F2EBFF', '#EBF0FF', '#F7FAFF'] as const;
/** `resultsHeader`'s wash (`:454`). */
const RESULTS_GRADIENT = ['#F2EBFF', '#E6F0FF'] as const;
/** `AgentSearchButton` (`:509`). */
const SEARCH_GRADIENT = ['#1438FF', '#5C1AFF', '#AD08FF'] as const;
/** The Open in Maps tile: `Color.mint.opacity(0.12)` → businessWash (`:301`). */
const MAPS_GRADIENT = ['rgba(0, 199, 190, 0.12)', BUSINESS_WASH] as const;

const NO_CANDIDATES: TaskAgentCandidate[] = [];

const HERO = require('../../assets/task-agent/business-search-hero.png') as number;
const ART = require('../../assets/task-agent/agent-business-art.png') as number;

type IconName = ComponentProps<typeof Ionicons>['name'];

const MESSAGES_UNAVAILABLE = 'Messages is not available on this device. You can copy the draft and phone number instead.';
const MESSAGES_SUBMITTED = 'Message submitted to Messages. Delivery is not confirmed.';
const MESSAGES_FAILED = 'Messages could not send the message. Your draft is still available.';

export type TaskAgentField = 'agentLocation' | `agentDraft:${string}`;

export type TaskAgentCardProps = {
  taskId: string;
  /** `onResearchAvailable` (TaskAgentCard.swift:9). */
  onResearchAvailable?: (available: boolean) => void;
  /** `.focused($focusedField, equals:)`: Task Details hides its footer while one of these has focus. */
  onFieldFocus?: (field: TaskAgentField) => void;
  onFieldBlur?: (field: TaskAgentField) => void;
};

/** The colours the card resolves once per render: Swift's fixed light values, or dark stand-ins. */
function palette(theme: Theme) {
  const dark = theme.scheme === 'dark';
  return {
    dark,
    // `Color.nexdoIndigo` tint (`:122`) and `businessPurple` (`:286`). In dark the `link` token, the
    // app's dark-mode tappable colour (docs/android-polish.md §6).
    indigo: theme.colors.link,
    purple: dark ? theme.colors.link : BUSINESS_PURPLE,
    // Swift draws fixed white cards under adaptive ink — white on white in dark. Dark uses the theme
    // surface instead, as the other Phase 12 ports do.
    card: dark ? theme.colors.surface : '#FFFFFF',
    wash: dark ? 'rgba(255, 255, 255, 0.08)' : BUSINESS_WASH,
    badge: dark ? 'rgba(255, 255, 255, 0.12)' : BADGE_FILL,
    field: dark ? theme.colors.fieldSurface : 'rgba(255, 255, 255, 0.85)',
    gradient: dark ? ([theme.colors.surface, theme.colors.surface] as const) : CARD_GRADIENT,
    resultsGradient: dark ? ([theme.colors.surface, theme.colors.surface] as const) : RESULTS_GRADIENT,
    bubble: dark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.9)',
  };
}

export function TaskAgentCard({ taskId, onResearchAvailable, onFieldFocus, onFieldBlur }: TaskAgentCardProps) {
  const theme = useTheme();
  const colors = palette(theme);
  const query = useTaskAgent(taskId, { poll: true });
  const mutation = useUpdateTaskAgent(taskId);
  const storedAction = useCoordinator((state) => state.actions.find((action) => action.taskId === taskId));

  const [answer, setAnswer] = useState('');
  /** The area typed for "Search again"; `null` shows the area last searched. */
  const [area, setArea] = useState<string | null>(null);
  const [showingSearchNotices, setShowingSearchNotices] = useState(false);
  const [selectedBusiness, setSelectedBusiness] = useState<string | null>(null);
  const [draftExpanded, setDraftExpanded] = useState<Set<string>>(new Set());
  const [businessTabs, setBusinessTabs] = useState<Record<string, number>>({});
  const [expandedReviews, setExpandedReviews] = useState<Set<string>>(new Set());
  /** Each review's full line count, measured unclamped, so "Show more" appears only for a review cut off at 3 lines. */
  const [reviewLines, setReviewLines] = useState<Record<string, number>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [searchRequestPending, setSearchRequestPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Android ahead of iOS: "Phone number copied." and "Draft copied." are confirmations. Swift puts them in
  // `error`, so they read as errors and hide the search spinner; here they have their own line.
  const [notice, setNotice] = useState<string | null>(null);
  const autoSearched = useRef<string | null>(null);
  // An update that failed keeps its message until the next action, so a 400 is never wiped by the
  // reload that follows it — which would leave the retired-question step showing a bare spinner.
  const [actionFailed, setActionFailed] = useState(false);

  const envelope = query.data;
  const run = envelope?.run ?? null;
  const eligible = envelope?.intent?.eligible === true;
  const fallbackReason = fallbackReasonFor(envelope);
  const candidates = run?.candidates ?? NO_CANDIDATES;

  // A load that succeeds clears the message line, unless an action is in flight; one that fails sets
  // it (`:161-173`). Adjusted while rendering, React's pattern for state that follows a changing value.
  const [seenDataAt, setSeenDataAt] = useState(query.dataUpdatedAt);
  if (query.dataUpdatedAt !== seenDataAt) {
    setSeenDataAt(query.dataUpdatedAt);
    if (!busy && !actionFailed) setError(null);
    setNotice(null);
  }
  const [seenErrorAt, setSeenErrorAt] = useState(0);
  if (query.isError && query.errorUpdatedAt !== seenErrorAt) {
    setSeenErrorAt(query.errorUpdatedAt);
    setError(`Could not refresh task research. ${query.error.message}`);
  }

  // Preselect the stored action's business, else the first, when the shortlist arrives (`:162`).
  const hasCandidates = candidates.length > 0;
  const [hadCandidates, setHadCandidates] = useState(false);
  if (hasCandidates !== hadCandidates) {
    setHadCandidates(hasCandidates);
    if (hasCandidates) setSelectedBusiness(preselectedCandidate(candidates, storedAction?.businessCandidateID));
  }

  const finding = isFindingBusinesses(run, searchRequestPending, error);
  // `loading = run == nil && !eligible` until the first answer (`:150`), and again after Retry.
  const loading = query.isLoading || (query.isFetching && envelope === undefined && error === null);

  // `onResearchAvailable(eligible || run != nil)` after every load (`:165`).
  const available = hasBusinessResearch(envelope);
  const loaded = envelope !== undefined;
  useEffect(() => {
    if (loaded) onResearchAvailable?.(available);
  }, [available, loaded, onResearchAvailable]);

  // "Resume tasks left at the retired optional-question step." (`:154-159`)
  const autoSearch = mutation.mutate;
  useEffect(() => {
    if (!run || busy || !needsAutoSearch(run)) return;
    const key = `${run.id}:${run.version}`;
    if (autoSearched.current === key) return;
    autoSearched.current = key;
    autoSearch(
      { action: 'search', version: run.version, answer: run.slots.location },
      {
        onError: (cause) => {
          setActionFailed(true);
          setError(`Could not refresh task research. ${cause.message}`);
        },
      },
    );
  }, [run, busy, autoSearch]);

  /** `act(_:key:answer:candidateID:)` (TaskAgentCard.swift:489-501). */
  const act = (action: TaskAgentAction, options: { key?: string; answer?: string; candidateId?: string } = {}) => {
    if (run === null && action !== 'prepare') return;
    setActionFailed(false);
    setNotice(null);
    setBusy(true);
    const searching = action === 'search' || action === 'resume' || action === 'retry';
    setSearchRequestPending(searching);
    if (searching) {
      Keyboard.dismiss();
      setError(null);
    }
    mutation.mutate(
      { action, version: run?.version ?? 0, key: options.key, answer: options.answer, candidateId: options.candidateId },
      {
        onSuccess: () => {
          setAnswer('');
          setArea(null);
          setError(null);
        },
        onError: (cause) => {
          setActionFailed(true);
          setError(cause.message);
        },
        onSettled: () => {
          setBusy(false);
          setSearchRequestPending(false);
        },
      },
    );
  };

  const showNotice = (message: string) => Alert.alert('Messages', message, [{ text: 'OK', style: 'cancel' }]);

  const draftFor = (candidate: TaskAgentCandidate) => drafts[candidate.id] ?? candidate.draft;

  /** "Open in Messages" (TaskAgentCard.swift:354-363) and the composer's result (`:124-133`). */
  const openInMessages = async (candidate: TaskAgentCandidate) => {
    Keyboard.dismiss();
    let outcome;
    try {
      outcome = await composeMessageOutcome({ recipient: candidate.phone, body: draftFor(candidate) });
    } catch {
      showNotice(MESSAGES_UNAVAILABLE);
      return;
    }
    if (outcome === 'submitted') showNotice(MESSAGES_SUBMITTED);
    else if (outcome === 'failed') showNotice(MESSAGES_FAILED);
    // `.cancelled`, `.saved`, and Android's unconfirmable `unknown`: nothing to say.
  };

  const searchProgress = (
    <View accessible accessibilityLabel="Finding the best business near your place…" accessibilityLiveRegion="polite" style={styles.progress} testID="agent-progress">
      <ActivityIndicator size="large" color={colors.indigo} />
      <Text style={[styles.subheadlineSemibold, styles.centred, { color: theme.colors.ink }]}>Finding the best business near your place…</Text>
    </View>
  );

  const link = (title: string, url: string, style: object, testID?: string) => (
    <Pressable accessibilityRole="link" accessibilityLabel={title} onPress={() => void Linking.openURL(url)} testID={testID} hitSlop={6}>
      <Text style={style}>{title}</Text>
    </Pressable>
  );

  /** `searchTerms(_:)` (TaskAgentCard.swift:408-429). */
  const searchTerms = (current: TaskAgentRun) => {
    const notices = current.warnings.filter(isSearchNotice);
    return (
      <View style={styles.searchTerms}>
        <View style={styles.row}>
          {link('Search terms and privacy', webUrl('/places-policy'), [styles.captionSemibold, { color: colors.indigo }], 'agent-search-terms')}
          <View style={styles.grow} />
          {notices.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={showingSearchNotices ? 'Hide search notices' : 'Show search notices'}
              accessibilityValue={{ text: showingSearchNotices ? 'Expanded' : 'Collapsed' }}
              onPress={() => setShowingSearchNotices((shown) => !shown)}
              style={styles.noticeToggle}
              testID="agent-search-notices"
            >
              <Ionicons name={showingSearchNotices ? 'remove-circle-outline' : 'add-circle-outline'} size={24} color={colors.indigo} />
            </Pressable>
          ) : null}
        </View>
        {showingSearchNotices
          ? notices.map((notice) => (
              <Text key={notice} style={[styles.caption, { color: theme.colors.secondary }]}>
                {notice}
              </Text>
            ))
          : null}
      </View>
    );
  };

  /** `searchIntroduction(_:)` (TaskAgentCard.swift:467-483). */
  const searchIntroduction = (current: TaskAgentRun) => (
    <View style={styles.introRow}>
      <View style={[styles.grow, styles.gap10]}>
        <Text style={[styles.small, { color: theme.colors.secondary }]}>
          Search uses your city and service with Google Places (and Yelp when connected). NexDo never calls, messages, or shares your contact details with businesses. You review and send drafts yourself.
        </Text>
        {searchTerms(current)}
        {current.urgency === 'urgent' ? <Text style={[styles.captionSemibold, { color: theme.colors.ink }]}>Urgent — prioritizing availability</Text> : null}
      </View>
      <View style={styles.introArt} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Text style={[styles.introBubble, { color: colors.indigo, backgroundColor: colors.dark ? colors.bubble : 'rgba(255, 255, 255, 0.65)' }]}>
          I’ll find the best options near you!
        </Text>
        <Image source={ART} style={styles.introImage} resizeMode="contain" />
      </View>
    </View>
  );

  /** `resultsHeader(_:)` (TaskAgentCard.swift:431-455). */
  const resultsHeader = (current: TaskAgentRun) => (
    <LinearGradient colors={colors.resultsGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.resultsHeader} testID="agent-results-header">
      <Eyebrow color={colors.purple} tracking={1.2} />
      <Text style={[styles.resultsTitle, { color: theme.colors.ink }]}>
        {current.service === 'plumber' ? 'I found the best plumbers ' : 'I found the best businesses '}
        <Text style={{ color: colors.purple }}>near you</Text>
      </Text>
      <View style={styles.introRow}>
        <View style={[styles.grow, styles.gap10]}>
          <Text style={[styles.caption, { color: theme.colors.secondary }]}>
            Here are the best options based on Google reviews, location, and services. You can view details, copy contact info, or open a draft message — all in one place.
          </Text>
          <Text style={[styles.captionMedium, { color: theme.colors.ink }]}>{`${capitalizedWords(current.service)} · ${current.slots.location}`}</Text>
          {searchTerms(current)}
        </View>
        <View style={styles.heroArt} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <Text style={[styles.heroBubble, { color: colors.purple, backgroundColor: colors.bubble }]}>{'Businesses\nnear you!'}</Text>
          <Image source={HERO} style={styles.heroImage} resizeMode="contain" />
        </View>
      </View>
    </LinearGradient>
  );

  /** `assistantHeader(_:)` (TaskAgentCard.swift:457-465). */
  const assistantHeader = (current: TaskAgentRun) =>
    current.candidates.length > 0 ? (
      resultsHeader(current)
    ) : (
      <View style={styles.gap10}>
        <Eyebrow color={colors.indigo} tracking={2} />
        <Text accessibilityRole="header" style={[styles.statusTitle, { color: theme.colors.ink }]}>
          {statusTitle(current.status)}
        </Text>
        <Text style={[styles.subheadline, { color: theme.colors.ink }]}>{serviceLine(current)}</Text>
      </View>
    );

  /** `ratingSummary(_:)` (TaskAgentCard.swift:216-232). */
  const ratingSummary = (candidate: TaskAgentCandidate) => {
    const evidence = ratingEvidence(candidate);
    const rating = evidence?.rating;
    return (
      <View style={styles.rating} testID={`agent-rating-${candidate.id}`}>
        <Text style={[styles.caption, { color: theme.colors.ink }]}>{ratingText(evidence)}</Text>
        {typeof rating === 'number' ? (
          <View style={styles.stars}>
            {stars(rating).map((kind, index) => (
              <Ionicons key={index} name={kind === 'full' ? 'star' : kind === 'half' ? 'star-half' : 'star-outline'} size={10} color={SYSTEM_ORANGE} />
            ))}
          </View>
        ) : null}
        <Text style={[styles.caption, { color: theme.colors.secondary }]}>{reviewCountText(evidence)}</Text>
      </View>
    );
  };

  /** `businessContact(_:)` (TaskAgentCard.swift:289-322). */
  const businessContact = (candidate: TaskAgentCandidate) => {
    const google = candidate.evidence.find((item) => item.source === 'Google');
    const website = httpsUrl(candidate.website);
    return (
      <View style={styles.contact}>
        <View style={styles.addressRow}>
          <View style={[styles.grow, styles.iconLabel]}>
            <Ionicons name="location" size={18} color={theme.colors.ink} />
            <Text style={[styles.subheadline, styles.grow, { color: theme.colors.ink }]}>{candidate.address.length === 0 ? 'Address unavailable' : candidate.address}</Text>
          </View>
          {google && google.url.length > 0 ? (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`Open ${candidate.name} in Google Maps`}
              onPress={() => void Linking.openURL(google.url)}
              testID={`agent-maps-${candidate.id}`}
            >
              <LinearGradient colors={colors.dark ? ([colors.wash, colors.wash] as const) : MAPS_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.mapsTile}>
                <Ionicons name="map" size={32} color={colors.purple} />
                <View style={styles.iconLabelTight}>
                  <Ionicons name="open-outline" size={10} color={theme.colors.ink} />
                  <Text style={[styles.tiny, { color: theme.colors.ink }]}>Open in Maps</Text>
                </View>
              </LinearGradient>
            </Pressable>
          ) : null}
        </View>
        <View style={styles.phoneRow}>
          <Ionicons name="call" size={17} color={colors.purple} />
          <Text style={[styles.subheadline, { color: theme.colors.ink }]}>{candidate.phone.length === 0 ? 'Phone unavailable' : candidate.phone}</Text>
          <View style={styles.grow} />
          {candidate.phone.length > 0 ? (
            <CompactButton
              title="Copy"
              icon="copy-outline"
              colors={colors}
              onPress={() => {
                void Clipboard.setStringAsync(candidate.phone);
                setNotice('Phone number copied.');
              }}
              testID={`agent-copy-phone-${candidate.id}`}
            />
          ) : null}
        </View>
        {website ? (
          <View style={styles.phoneRow}>
            <Ionicons name="globe-outline" size={17} color={theme.colors.ink} />
            <Text style={[styles.subheadline, styles.grow, { color: theme.colors.ink }]}>Website</Text>
            <CompactButton title="Open" icon="open-outline" colors={colors} onPress={() => void Linking.openURL(website)} link testID={`agent-website-${candidate.id}`} />
          </View>
        ) : null}
      </View>
    );
  };

  /** `businessReviews(_:)` (TaskAgentCard.swift:370-402). */
  const businessReviews = (candidate: TaskAgentCandidate) => {
    const feedback = candidate.feedback ?? [];
    if (candidate.googlePlaceId === null || candidate.googlePlaceId === undefined) {
      return <Text style={[styles.caption, { color: theme.colors.ink }]}>No written reviews available.</Text>;
    }
    return (
      <View style={styles.gap12}>
        <Text style={[styles.googleMaps, { color: colors.dark ? theme.colors.secondary : GOOGLE_GREY }]}>Google Maps</Text>
        <Text style={[styles.caption, { color: theme.colors.ink }]}>Customer feedback · Limited selection, newest first.</Text>
        {feedback.length === 0 ? <Text style={[styles.caption, { color: theme.colors.ink }]}>No written reviews available.</Text> : null}
        {feedback.map((review) => {
          const reviewId = candidate.id + review.url;
          const expanded = expandedReviews.has(reviewId);
          const toggleLabel = expanded ? 'Show less' : 'Show more';
          // Android ahead of iOS: Swift shows "Show more" under any review, however short (:386).
          const truncated = (reviewLines[reviewId] ?? 0) > 3;
          return (
            <View key={review.url} style={styles.review}>
              <View style={styles.reviewAuthor}>
                {review.photoUrl ? <Image source={{ uri: review.photoUrl }} style={styles.avatar} accessibilityIgnoresInvertColors /> : null}
                {review.authorUrl
                  ? link(review.author, review.authorUrl, [styles.body, { color: colors.purple }])
                  : <Text style={[styles.body, { color: theme.colors.ink }]}>{review.author}</Text>}
              </View>
              <Text style={[styles.caption, { color: theme.colors.ink }]}>{reviewLine(review.rating, review.published)}</Text>
              <View>
                <Text numberOfLines={expanded ? undefined : 3} style={[styles.subheadline, { color: theme.colors.ink }]}>
                  {review.text}
                </Text>
                {/* An invisible, unclamped copy over the same width: its line count decides "Show more". */}
                <Text
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  onTextLayout={(event) => {
                    const lines = event.nativeEvent.lines.length;
                    setReviewLines((current) => (current[reviewId] === lines ? current : { ...current, [reviewId]: lines }));
                  }}
                  pointerEvents="none"
                  style={[styles.subheadline, styles.measure]}
                  testID={`agent-review-measure-${reviewId}`}
                >
                  {review.text}
                </Text>
              </View>
              {truncated || expanded ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${toggleLabel} of ${review.author}’s review`}
                  accessibilityValue={{ text: expanded ? 'Expanded' : 'Collapsed' }}
                  onPress={() =>
                    setExpandedReviews((current) => {
                      const next = new Set(current);
                      if (next.has(reviewId)) next.delete(reviewId);
                      else next.add(reviewId);
                      return next;
                    })
                  }
                  hitSlop={6}
                >
                  <Text style={[styles.subheadlineSemibold, { color: colors.purple }]}>{toggleLabel}</Text>
                </Pressable>
              ) : null}
              {review.url.length > 0 ? link('Read review on Google Maps', review.url, [styles.body, { color: colors.purple }]) : null}
            </View>
          );
        })}
      </View>
    );
  };

  /** The Services tab (TaskAgentCard.swift:256-265). */
  const businessServices = (candidate: TaskAgentCandidate) => {
    const website = httpsUrl(candidate.website);
    return (
      <View style={styles.gap10}>
        <View style={styles.iconLabel}>
          <Ionicons name="construct-outline" size={20} color={colors.purple} />
          <Text style={[styles.headline, { color: colors.purple }]}>{run ? capitalizedWords(run.service) : 'Local services'}</Text>
        </View>
        <Text style={[styles.subheadline, { color: theme.colors.secondary }]}>{candidate.reason}</Text>
        <Text style={[styles.caption, { color: theme.colors.secondary }]}>Ask the business to confirm the services, pricing, and availability for your request.</Text>
        {website ? link('Explore services on website ↗', website, [styles.subheadlineSemibold, { color: colors.purple }]) : null}
      </View>
    );
  };

  /** `outreachSection(_:)` (TaskAgentCard.swift:324-368). */
  const outreachSection = (candidate: TaskAgentCandidate) => {
    const expanded = draftExpanded.has(candidate.id);
    const draft = draftFor(candidate);
    const field: TaskAgentField = `agentDraft:${candidate.id}`;
    const canMessage = candidate.phone.trim().length > 0 && draft.trim().length > 0;
    return (
      <View style={styles.gap12}>
        <View style={[styles.disclosure, { backgroundColor: colors.wash }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            onPress={() => {
              Keyboard.dismiss();
              setDraftExpanded((current) => {
                const next = new Set(current);
                if (next.has(candidate.id)) next.delete(candidate.id);
                else next.add(candidate.id);
                return next;
              });
            }}
            style={styles.disclosureLabel}
            testID={`agent-draft-toggle-${candidate.id}`}
          >
            <View style={[styles.draftIcon, { backgroundColor: withAlpha(BUSINESS_PURPLE, 0.07) }]}>
              <Ionicons name="document-text-outline" size={22} color={colors.purple} />
            </View>
            <View style={[styles.grow, styles.gap4]}>
              <Text style={[styles.subheadlineSemibold, { color: theme.colors.ink }]}>Review or edit outreach draft</Text>
              <Text style={[styles.caption, { color: theme.colors.secondary }]}>Your message is ready to personalize.</Text>
            </View>
            <Ionicons name={expanded ? 'chevron-down' : 'chevron-forward'} size={15} color={colors.indigo} />
          </Pressable>
          {expanded ? (
            <View style={styles.gap12}>
              <TextInput
                accessibilityLabel={`Draft for ${candidate.name}`}
                placeholder="Write your message"
                placeholderTextColor={theme.colors.placeholder}
                value={draft}
                maxLength={DRAFT_LIMIT}
                onChangeText={(text) => setDrafts((current) => ({ ...current, [candidate.id]: text.slice(0, DRAFT_LIMIT) }))}
                onFocus={() => onFieldFocus?.(field)}
                onBlur={() => onFieldBlur?.(field)}
                multiline
                style={[styles.draftInput, { backgroundColor: colors.card, color: theme.colors.ink }]}
                testID={`agent-draft-${candidate.id}`}
              />
              <View style={styles.row}>
                <TextButton
                  title="Save draft"
                  color={colors.purple}
                  onPress={() => {
                    Keyboard.dismiss();
                    act('saveDraft', { answer: draft, candidateId: candidate.id });
                  }}
                  testID={`agent-save-draft-${candidate.id}`}
                />
                <View style={styles.grow} />
                <TextButton
                  title="Copy draft"
                  color={colors.purple}
                  onPress={() => {
                    Keyboard.dismiss();
                    void Clipboard.setStringAsync(draft);
                    setNotice('Draft copied.');
                  }}
                  testID={`agent-copy-draft-${candidate.id}`}
                />
              </View>
            </View>
          ) : null}
        </View>
        <GradientButton
          title="Open in Messages"
          leading="chatbubble"
          trailing="chevron-forward"
          disabled={!canMessage}
          onPress={() => void openInMessages(candidate)}
          testID={`agent-messages-${candidate.id}`}
        />
        <View style={styles.infoRow}>
          <Ionicons name="information-circle-outline" size={14} color={theme.colors.secondary} />
          <Text style={[styles.caption, styles.grow, { color: theme.colors.secondary }]}>
            Review the number and message, then tap Send. Some business numbers cannot receive texts.
          </Text>
        </View>
      </View>
    );
  };

  /** `businessDetails(_:)` (TaskAgentCard.swift:234-287). */
  const businessDetails = (candidate: TaskAgentCandidate) => {
    const tab = businessTabs[candidate.id] ?? 0;
    const tabs: { title: string; icon: IconName }[] = [
      { title: 'Business info', icon: 'storefront-outline' },
      { title: 'Reviews', icon: 'star' },
      { title: 'Services', icon: 'construct-outline' },
    ];
    const chosen = storedAction?.businessCandidateID === candidate.id;
    return (
      <View style={styles.gap16}>
        <View style={[styles.tabs, { backgroundColor: colors.wash }]} accessibilityRole="tablist">
          {tabs.map((item, index) => {
            const selected = tab === index;
            const color = selected ? colors.purple : theme.colors.secondary;
            return (
              <Pressable
                key={item.title}
                accessibilityRole="tab"
                accessibilityLabel={item.title}
                accessibilityState={{ selected }}
                onPress={() => {
                  Keyboard.dismiss();
                  setBusinessTabs((current) => ({ ...current, [candidate.id]: index }));
                }}
                style={[styles.tab, selected && { backgroundColor: colors.card }]}
                testID={`agent-tab-${candidate.id}-${index}`}
              >
                <Ionicons name={item.icon} size={12} color={color} />
                <Text style={[styles.tabLabel, { color }]}>{item.title}</Text>
              </Pressable>
            );
          })}
        </View>
        {tab === 1 ? businessReviews(candidate) : tab === 2 ? businessServices(candidate) : businessContact(candidate)}
        {(candidate.attributions ?? []).map((attribution, index) =>
          attribution.url ? (
            <View key={index}>{link(attribution.provider, attribution.url, [styles.caption, { color: colors.purple }])}</View>
          ) : (
            <Text key={index} style={[styles.caption, { color: theme.colors.ink }]}>
              {attribution.provider}
            </Text>
          ),
        )}
        {storedAction ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={chosen ? 'Selected for this task' : 'Choose this business'}
            accessibilityState={{ selected: chosen }}
            onPress={() =>
              useCoordinator.getState().update(storedAction.id, (action) => ({
                ...action,
                businessCandidateID: candidate.id,
                contactIdentifier: null,
                manualRecipient: null,
              }))
            }
            style={[styles.prominent, { backgroundColor: BUSINESS_PURPLE }]}
            testID={`business.select.${candidate.id}`}
          >
            <Ionicons name={chosen ? 'checkmark-circle' : 'checkmark-circle-outline'} size={20} color="#FFFFFF" />
            <Text style={[styles.prominentLabel, { color: '#FFFFFF' }]}>{chosen ? 'Selected for this task' : 'Choose this business'}</Text>
          </Pressable>
        ) : null}
        <View style={[styles.divider, { backgroundColor: withAlpha(BUSINESS_PURPLE, 0.06) }]} />
        {outreachSection(candidate)}
      </View>
    );
  };

  /** `businessCard(_:index:)` (TaskAgentCard.swift:184-214). */
  const businessCard = (candidate: TaskAgentCandidate, index: number) => {
    const expanded = selectedBusiness === candidate.id;
    return (
      <View key={candidate.id} style={[styles.businessCard, { backgroundColor: colors.card }, isAndroid() && { borderWidth: 1, borderColor: theme.colors.fieldBorder }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityHint="Expand or collapse business details"
          accessibilityState={{ expanded }}
          onPress={() => {
            Keyboard.dismiss();
            setSelectedBusiness(expanded ? null : candidate.id);
          }}
          style={styles.businessRow}
          testID={`agent-business-${candidate.id}`}
        >
          <View style={[styles.indexBadge, { backgroundColor: colors.badge }]}>
            <Text style={[styles.indexLabel, { color: colors.purple }]}>{index + 1}</Text>
          </View>
          <View style={[styles.grow, styles.gap6]}>
            <Text style={[styles.headline, { color: theme.colors.ink }]}>{candidate.name}</Text>
            {ratingSummary(candidate)}
          </View>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-forward'} size={17} color={theme.colors.ink} />
        </Pressable>
        {expanded ? (
          <>
            {index === 0 ? (
              <View style={[styles.reviewedBadge, { backgroundColor: REVIEWED_FILL }]} testID="agent-most-reviewed">
                <Ionicons name="trophy" size={12} color={REVIEWED_GREEN} />
                <Text style={[styles.captionSemibold, { color: REVIEWED_GREEN }]}>Most reviewed</Text>
              </View>
            ) : null}
            {businessDetails(candidate)}
          </>
        ) : null}
      </View>
    );
  };

  /** The "City or ZIP code" field (TaskAgentCard.swift:72-79). */
  const locationField = (value: string, onChange: (text: string) => void) => (
    <View style={[styles.locationField, { backgroundColor: colors.field, borderColor: withAlpha(SYSTEM_PURPLE, 0.65) }]}>
      <View style={[styles.locationIcon, { backgroundColor: withAlpha(SYSTEM_PURPLE, 0.06) }]}>
        <Ionicons name="location" size={22} color={SYSTEM_PURPLE} />
      </View>
      <TextInput
        accessibilityLabel="City or ZIP code"
        placeholder="City or ZIP code"
        placeholderTextColor={theme.colors.placeholder}
        value={value}
        onChangeText={onChange}
        returnKeyType="done"
        onSubmitEditing={() => Keyboard.dismiss()}
        onFocus={() => onFieldFocus?.('agentLocation')}
        onBlur={() => onFieldBlur?.('agentLocation')}
        style={[styles.locationInput, { color: theme.colors.ink }]}
        testID="agent-location"
      />
    </View>
  );

  /** The location question (TaskAgentCard.swift:67-87). */
  const questionStep = (current: TaskAgentRun) => {
    const question = current.question;
    if (finding || !question || RETIRED_QUESTION_KEYS.includes(question.key)) return null;
    return (
      <>
        <Text style={[styles.question, { color: theme.colors.ink }]}>{question.text}</Text>
        {question.key === 'discovery' ? (
          <View style={styles.row}>
            <TextButton title="Find a professional" color={colors.indigo} onPress={() => act('answer', { key: 'discovery', answer: 'yes' })} />
            <View style={styles.grow} />
            <TextButton title="Keep as a task" color={colors.indigo} onPress={() => act('cancel')} />
          </View>
        ) : (
          <>
            {locationField(answer, setAnswer)}
            <GradientButton
              title={current.service === 'plumber' ? 'Search Plumbers' : 'Search businesses'}
              leading="search-outline"
              trailing="arrow-forward"
              disabled={answer.trim().length === 0}
              // Android ahead of iOS: Swift always sends `key: "location"` (:82); this sends the question's own key.
              onPress={() => act('search', { key: question.key, answer })}
              testID="agent-search"
            />
          </>
        )}
        {question.key === 'location' && current.slots.location.length > 0 ? (
          <TextButton
            title={`Use ${current.slots.location}`}
            color={colors.indigo}
            onPress={() => act('search', { key: 'location', answer: current.slots.location })}
            testID="agent-use-location"
          />
        ) : null}
      </>
    );
  };

  /** The run body (TaskAgentCard.swift:62-106). */
  const runCard = (current: TaskAgentRun) => {
    const empty = current.candidates.length === 0;
    // Android ahead of iOS: a NO_RESULTS or CANCELLED run can be searched again, in the same or a new area.
    const searchAgain = !finding && SEARCH_AGAIN_STATUSES.includes(current.status);
    const searchArea = area ?? current.slots.location;
    const retired = !finding && current.question && RETIRED_QUESTION_KEYS.includes(current.question.key);
    const body = (
      <View style={[styles.gap12, busy && styles.inert]}>
        {assistantHeader(current)}
        {empty ? <View style={[styles.divider, { backgroundColor: withAlpha(brand.nexdoIndigo, 0.08) }]} /> : null}
        {finding ? searchProgress : null}
        {questionStep(current)}
        {empty && !finding ? searchIntroduction(current) : null}
        {retired ? (
          error === null ? (
            searchProgress
          ) : (
            <GradientButton title="Retry search" onPress={() => act('search', { answer: current.slots.location })} testID="agent-retry-search" />
          )
        ) : null}
        {current.error ? <Text style={[styles.caption, { color: theme.colors.ink }]}>{current.error}</Text> : null}
        {inlineWarnings(current.warnings).map((warning) => (
          <Text key={warning} style={[styles.caption, { color: theme.colors.secondary }]}>
            {warning}
          </Text>
        ))}
        {current.candidates.map(businessCard)}
        {searchAgain ? locationField(searchArea, setArea) : null}
        <View style={styles.controls}>
          {runControls(current.status).map((control) =>
            control.action === 'cancel' ? (
              <Pressable
                key={control.action}
                accessibilityRole="button"
                accessibilityLabel={control.title}
                onPress={() => act('cancel')}
                style={styles.cancel}
                testID="agent-cancel"
              >
                <Ionicons name="close" size={20} color={theme.colors.secondary} />
                <Text style={[styles.body, { color: theme.colors.secondary }]}>{control.title}</Text>
              </Pressable>
            ) : control.action === 'search' ? (
              <TextButton
                key={control.action}
                title={control.title}
                color={colors.indigo}
                disabled={searchArea.trim().length === 0}
                onPress={() => act('search', { answer: searchArea.trim() })}
                testID="agent-search-again"
              />
            ) : (
              <TextButton key={control.action} title={control.title} color={colors.indigo} onPress={() => act(control.action)} testID={`agent-${control.action}`} />
            ),
          )}
        </View>
        {error !== null ? (
          <Text accessibilityLiveRegion="polite" style={[styles.caption, { color: theme.colors.ink }]} testID="agent-message">
            {error}
          </Text>
        ) : notice !== null ? (
          <Text accessibilityLiveRegion="polite" style={[styles.caption, { color: theme.colors.ink }]} testID="agent-notice">
            {notice}
          </Text>
        ) : null}
      </View>
    );
    if (!empty) return body;
    return (
      <LinearGradient
        colors={colors.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.runCard, isAndroid() && { borderWidth: 1, borderColor: theme.colors.fieldBorder }]}
        testID="agent-run-card"
      >
        {body}
      </LinearGradient>
    );
  };

  let content: ReactNode = null;
  if (run) {
    content = runCard(run);
  } else if (eligible) {
    // "Find local businesses" (TaskAgentCard.swift:107-113).
    content = (
      <View style={[styles.eligible, { backgroundColor: withAlpha(brand.nexdoIndigo, 0.06) }]} testID="agent-eligible">
        <View style={styles.iconLabel}>
          <Ionicons name="search-outline" size={18} color={theme.colors.ink} />
          <Text style={[styles.headline, { color: theme.colors.ink }]}>Find local businesses</Text>
        </View>
        <Text style={[styles.subheadline, { color: theme.colors.ink }]}>
          Google Places can find providers with phone numbers, addresses, ratings and quote-request drafts. Confirm your city to begin.
        </Text>
        <TextButton title="Find businesses" color={colors.indigo} disabled={busy} onPress={() => act('prepare')} testID="agent-prepare" />
        {error !== null ? <Text style={[styles.caption, { color: theme.colors.ink }]}>{error}</Text> : null}
      </View>
    );
  } else if (loading) {
    content = searchProgress;
  } else if (error !== null) {
    content = (
      <>
        <Text style={[styles.caption, { color: theme.colors.ink }]} testID="agent-message">
          {error}
        </Text>
        <TextButton
          title="Retry business search"
          color={colors.indigo}
          onPress={() => {
            setActionFailed(false);
            setError(null);
            void query.refetch();
          }}
          testID="agent-retry-load"
        />
      </>
    );
  } else if (fallbackReason) {
    content = <Text style={[styles.subheadline, { color: theme.colors.secondary }]}>{fallbackReason}</Text>;
  }

  // Swift keeps a concrete view mounted before the first response (`:60`); an empty view here.
  return (
    <View style={styles.gap12} testID="agent-card">
      {content}
    </View>
  );
}

/** "AI ASSISTANT" with sparkles (TaskAgentCard.swift:433, :460). */
function Eyebrow({ color, tracking }: { color: string; tracking: number }) {
  return (
    <View style={styles.iconLabel}>
      <Ionicons name="sparkles" size={12} color={color} />
      <Text style={[styles.eyebrow, { color, letterSpacing: tracking }]}>AI ASSISTANT</Text>
    </View>
  );
}

/** A plain SwiftUI `Button` in the card's tint. */
function TextButton({ title, color, onPress, disabled = false, testID }: { title: string; color: string; onPress: () => void; disabled?: boolean; testID?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      style={[styles.textButton, disabled && styles.dimmed]}
      testID={testID}
    >
      <Text style={[styles.body, { color }]}>{title}</Text>
    </Pressable>
  );
}

/** `AgentSearchButton` (TaskAgentCard.swift:504-512). */
function GradientButton({
  title,
  leading,
  trailing,
  disabled = false,
  onPress,
  testID,
}: {
  title: string;
  leading?: IconName;
  trailing?: IconName;
  disabled?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [{ opacity: disabled ? 0.45 : pressed ? 0.75 : 1 }]}
      testID={testID}
    >
      <LinearGradient colors={SEARCH_GRADIENT} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.gradientButton}>
        {leading ? <Ionicons name={leading} size={17} color="#FFFFFF" /> : null}
        <Text style={[styles.subheadlineSemibold, { color: '#FFFFFF' }]}>{title}</Text>
        {trailing ? <Ionicons name={trailing} size={trailing === 'chevron-forward' ? 12 : 17} color="#FFFFFF" /> : null}
      </LinearGradient>
    </Pressable>
  );
}

/** `BusinessCompactButton` (TaskAgentCard.swift:514-521). */
function CompactButton({
  title,
  icon,
  colors,
  onPress,
  link = false,
  testID,
}: {
  title: string;
  icon: IconName;
  colors: ReturnType<typeof palette>;
  onPress: () => void;
  link?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole={link ? 'link' : 'button'}
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [styles.compact, { backgroundColor: colors.wash, opacity: pressed ? 0.65 : 1 } as ViewStyle]}
      testID={testID}
    >
      <Ionicons name={icon} size={12} color={colors.purple} />
      <Text style={[styles.captionSemibold, { color: colors.purple }]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  centred: { textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
  gap4: { gap: 4 },
  gap6: { gap: 6 },
  gap10: { gap: 10 },
  gap12: { gap: 12 },
  gap16: { gap: 16 },
  dimmed: { opacity: 0.45 },
  // `.disabled(busy)` on the run card (TaskAgentCard.swift:106).
  inert: { pointerEvents: 'none' },
  // Type: `.caption` 12, `.subheadline` 15, `.headline` 17 semibold, `.body` 17.
  caption: { fontSize: 12, lineHeight: 16 },
  captionSemibold: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  captionMedium: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
  small: { fontSize: 12, lineHeight: 15 },
  tiny: { fontSize: 10, lineHeight: 13, fontWeight: '600' },
  subheadline: { fontSize: 15, lineHeight: 20 },
  subheadlineSemibold: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 17, lineHeight: 22 },
  googleMaps: { fontSize: 14, lineHeight: 18 },
  eyebrow: { fontSize: 12, lineHeight: 16, fontWeight: '700' },
  // `.system(size: 20, weight: .bold).tracking(-0.6)`
  statusTitle: { fontSize: 20, lineHeight: 25, fontWeight: '700', letterSpacing: -0.6 },
  // `.title3.bold()`
  resultsTitle: { fontSize: 20, lineHeight: 26, fontWeight: '700' },
  // `.system(size: 16, weight: .semibold)`
  question: { fontSize: 16, lineHeight: 21, fontWeight: '600' },
  iconLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  iconLabelTight: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  // `searchProgress`: `.padding(.vertical, 24)`, `VStack(spacing: 14)`.
  progress: { alignItems: 'center', gap: 14, paddingVertical: 24 },
  // `.padding(18)` in a 20pt rounded rectangle, with the indigo shadow.
  runCard: {
    padding: 18,
    borderRadius: 20,
    shadowColor: '#3D29F0',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
  },
  divider: { height: StyleSheet.hairlineWidth },
  searchTerms: { gap: 8 },
  noticeToggle: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  introRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  introArt: { width: 94, alignItems: 'center' },
  introBubble: { fontSize: 12, lineHeight: 15, fontWeight: '500', textAlign: 'center', padding: 10, borderRadius: 20, overflow: 'hidden', transform: [{ rotate: '-8deg' }] },
  introImage: { width: 94, height: 100 },
  resultsHeader: { padding: 16, gap: 12, borderRadius: 20 },
  heroArt: { width: 100, alignItems: 'center' },
  heroBubble: { fontSize: 11, lineHeight: 14, fontWeight: '500', textAlign: 'center', padding: 10, borderRadius: 22, overflow: 'hidden', transform: [{ rotate: '-10deg' }] },
  heroImage: { width: 105, height: 105 },
  // `.padding(8)` in a 12pt field with a purple stroke.
  locationField: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 8, borderRadius: 12, borderWidth: 1 },
  locationIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  locationInput: { flex: 1, fontSize: 17, minHeight: 36, paddingVertical: 0 },
  gradientButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 50, borderRadius: 15, paddingHorizontal: 16 },
  controls: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 16 },
  cancel: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
  textButton: { minHeight: 44, justifyContent: 'center' },
  eligible: { padding: 16, gap: 12, borderRadius: 18 },
  // `.padding(16)` in a 22pt white card with the indigo shadow.
  businessCard: {
    padding: 16,
    gap: 16,
    borderRadius: 22,
    shadowColor: '#3D29F0',
    shadowOpacity: 0.07,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
  },
  businessRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  indexBadge: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  indexLabel: { fontSize: 20, lineHeight: 25, fontWeight: '700' },
  rating: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5 },
  stars: { flexDirection: 'row', gap: 1 },
  reviewedBadge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  tabs: { flexDirection: 'row', gap: 2, padding: 4, borderRadius: 18 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 38, borderRadius: 999 },
  tabLabel: { fontSize: 11, lineHeight: 14, fontWeight: '600' },
  contact: { gap: 16, paddingTop: 4 },
  addressRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  mapsTile: { width: 112, height: 82, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 5 },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  compact: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, minHeight: 36, borderRadius: 12 },
  review: { gap: 6, paddingVertical: 6 },
  measure: { position: 'absolute', top: 0, left: 0, right: 0, opacity: 0 },
  reviewAuthor: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatar: { width: 32, height: 32, borderRadius: 16 },
  prominent: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 8, paddingHorizontal: 14, minHeight: 44, borderRadius: 999 },
  prominentLabel: { fontSize: 17, lineHeight: 22 },
  disclosure: { padding: 12, gap: 12, borderRadius: 16 },
  disclosureLabel: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  draftIcon: { width: 38, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  // `.lineLimit(5...)` with `.padding(12)` on white, 12pt corners.
  draftInput: { fontSize: 17, minHeight: 5 * 22 + 24, padding: 12, paddingTop: 12, borderRadius: 12, textAlignVertical: 'top' },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
});
