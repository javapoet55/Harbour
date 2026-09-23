import { createStore, type StoreApi } from 'zustand';

import { isApiError } from '../../api/client';
import type {
  ArtworkResponse,
  CatalogResponse,
  DraftResponse,
  FestivalCatalogEntry,
  GenerateResponse,
  ImportantMoment,
  MomentCard,
  MomentOK,
  PlanResponse,
  WishDeliveryPlan,
  WishScheduleInput,
} from '../../api/moments';
import { isoString, keepTimeOnDay, momentDate, momentDay, parseInstant, zonedInstant } from './dates';
import {
  catalogNext,
  characterCount,
  fallbackWish,
  greetingHeading,
  greetingMessage,
  hasRecipient,
  isArchived,
  newFestivalSettings,
  normalizedPhone,
  planEditable,
  readFestivalSettings,
  stableStringify,
  typeLabel,
  validateRecipients,
  validateSchedule,
  type FestivalSettings,
  type ManagedRecipient,
  type MomentDisplayGroup,
} from './domain';
import { errorMessage, type MomentsState } from './store';

/**
 * `ManageFestivalModel` (ios/App/ManageFestivalModel.swift:4-233): the four-step manager behind
 * Manage Moment for every greeting-card occasion (birthday, anniversary, festival, Get Well Soon).
 *
 * A vanilla zustand store per screen, as Swift's is a `@StateObject` per view: the screen and every
 * sheet it presents share one instance.
 *
 * SWIFT PROPERTY OBSERVERS. `date` and `sendDate` and `notify` have `didSet`s that the initialiser
 * does not trigger (Swift never runs observers during `init`). They are the `setDate`, `setSendDate`
 * and `setNotify` actions here, and the constructor assigns the fields directly — so opening a moment
 * is never "dirty", while touching the send time afterwards is, because it writes `draftSendDate`.
 */

export const MANAGE_TABS = ['Details', 'Contacts', 'Wish Message', 'Schedule'] as const;
export type ManageTab = (typeof MANAGE_TABS)[number];

export type ImageVariation = { id: string; base64: string };

export type ManageDeps = {
  store: StoreApi<MomentsState>;
  images: { store(base64: string): string; load(id: string): string | null; delete(id: string): void };
  validateContacts: (recipients: ManagedRecipient[]) => Promise<void>;
  sha256Hex: (value: string) => Promise<string>;
  uuid: () => string;
  now: () => number;
  /** The finished card's image: captured from the mounted view, encoded, and sent to its own route. */
  cards: CardDeps;
};

export type CardDeps = {
  /** The mounted off-screen card as a temporary file URI, or `null` when none is mounted. */
  capture: () => Promise<string | null>;
  /** Base64 JPEG at quality 0.85, longest side at most 1600 px. */
  encode: (uri: string) => Promise<string>;
  /** The one retry after a 413: the same capture at a smaller size. */
  encodeSmaller: (uri: string) => Promise<string>;
  upload: (momentID: string, data: string) => Promise<MomentCard>;
  remove: (momentID: string) => Promise<void>;
  /** The stored card's bytes, for opening a moment whose card was made on another device. */
  fetch: (momentID: string) => Promise<{ base64: string; mime: string } | null>;
};

export type ManageState = {
  tab: ManageTab;
  pendingTab: ManageTab | null;
  title: string;
  date: number;
  zone: string;
  yearly: boolean;
  active: boolean;
  recipients: ManagedRecipient[];
  settings: FestivalSettings;
  sendDate: number;
  notify: boolean;
  needsScheduleConfirmation: boolean;
  busy: boolean;
  generatingImage: boolean;
  error: string | null;
  notice: string | null;
  images: ImageVariation[];
  catalog: FestivalCatalogEntry[];
  savedPlans: WishDeliveryPlan[];
  scheduleCompleted: boolean;
  /** `imageData`: the chosen artwork, as a URI `<Image>` can show. */
  imageUri: string | null;
  originals: ImportantMoment[];
  baseline: string;
  savedImageID: string;
  stagedImages: string[];
  keys: Record<string, string>;
  draftIDs: Record<string, string>;
  imageGeneration: number;
  /** The card the server has for this moment, from `moment.card` in the snapshot. */
  card: MomentCard | null;
  /** True while the finished card is being captured, encoded and uploaded. */
  cardUploading: boolean;
  /** Set when the card saved but its image did not reach the server; drives the inline note and Retry. */
  cardFailed: boolean;
  /** `cardFingerprint` of the last successful upload, so an unrelated save does not re-send the image. */
  uploadedCardKey: string;

  setTitle(value: string): void;
  setDate(value: number): void;
  setZone(value: string): void;
  setYearly(value: boolean): void;
  setSendDate(value: number): void;
  setNotify(value: boolean): void;
  updateSettings(patch: Partial<FestivalSettings>): void;
  setRecipients(recipients: ManagedRecipient[]): void;
  updateRecipient(key: string, patch: Partial<ManagedRecipient>): void;
  setError(value: string | null): void;
  setNeedsScheduleConfirmation(value: boolean): void;
  setScheduleCompleted(value: boolean): void;
  showTab(tab: ManageTab): void;

  loadCatalog(): Promise<void>;
  useCatalog(): void;
  invalidateApproval(): void;
  setActive(value: boolean, cancelSchedules?: boolean): Promise<void>;
  changeTab(target: ManageTab): Promise<void>;
  cancelTabChange(): void;
  save(cancelSchedules?: boolean): Promise<void>;
  generate(aiConsent: boolean): Promise<void>;
  approve(cancelSchedules?: boolean): Promise<void>;
  generateImage(): void;
  saveGreetingCard(): Promise<boolean>;
  /** Captures, encodes and uploads the finished card. Safe to call when there is nothing to send. */
  uploadCard(): Promise<void>;
  /** "Retry" on the inline note. */
  retryCardUpload(): Promise<void>;
  /** "Remove card": drops the stored image so scheduled emails go back to text only. */
  removeCard(): Promise<void>;
  /** Shows a card saved on another device, when this one has no local artwork. */
  loadStoredCard(): Promise<void>;
  cancelImage(): void;
  chooseImage(image: ImageVariation): void;
  discardImageEdits(): void;
  removeImage(): void;
  delete(): Promise<boolean>;
  schedule(): Promise<void>;
};

export type ManageModel = StoreApi<ManageState>;

/** `occasionType`, `occasionLabel`, `source` (ManageFestivalModel.swift:51-53). */
export function occasionType(state: Pick<ManageState, 'originals'>): string {
  return state.originals[0]?.type ?? 'festival';
}
export function occasionLabel(state: Pick<ManageState, 'originals'>): string {
  return typeLabel(occasionType(state));
}
export function occasionSource(state: Pick<ManageState, 'originals'>): string {
  return state.originals[0]?.source ?? 'manual';
}

/** `selected` (`:59`). */
export function selectedRecipients(state: Pick<ManageState, 'recipients'>): ManagedRecipient[] {
  return state.recipients.filter((recipient) => recipient.selected);
}

/** `channel(_:)` (`:96`). */
export function recipientChannel(state: Pick<ManageState, 'settings'>, recipient: Pick<ManagedRecipient, 'key'>): string {
  return state.settings.channels[recipient.key] ?? 'messages';
}

/** `fingerprint` (`:63`) and `dirty` (`:61`). */
export function fingerprint(state: Pick<ManageState, 'title' | 'date' | 'zone' | 'yearly' | 'active' | 'recipients' | 'settings'>): string {
  return [
    state.title,
    momentDay(state.date, state.zone),
    state.zone,
    String(state.yearly),
    String(state.active),
    stableStringify(state.recipients),
    stableStringify(state.settings),
  ].join('|');
}
export function isDirty(state: ManageState): boolean {
  return fingerprint(state) !== state.baseline;
}

/** `reviewHeading(for:)` (`:89-91`). */
export function reviewHeading(state: Pick<ManageState, 'originals' | 'title'>, recipient: Pick<ManagedRecipient, 'name'>): string {
  return greetingHeading(occasionType(state), recipient.name) ?? state.title;
}

/** `deliveryMessage(for:)` (`:92-95`). */
export function deliveryMessage(state: Pick<ManageState, 'originals' | 'settings'>, recipient: Pick<ManagedRecipient, 'key' | 'name'>): string {
  const custom = state.settings.overrides[recipient.key];
  if (custom !== undefined) return custom;
  return greetingMessage(state.settings.baseMessage, occasionType(state), recipient.name);
}

/** `emailReady` (`:60`). */
export function emailReady(store: Pick<MomentsState, 'snapshot'>): boolean {
  return store.snapshot?.automaticEmailEnabled === true && store.snapshot?.emailAccount?.status === 'connected';
}

/** `hasSchedules` (`:54-58`). */
export function hasSchedules(state: Pick<ManageState, 'originals' | 'savedPlans'>, store: Pick<MomentsState, 'snapshot'>): boolean {
  const moments = store.snapshot?.moments ?? [];
  const current = state.originals.map((original) => moments.find((moment) => moment.id === original.id) ?? original);
  const active = (plan: WishDeliveryPlan) => planEditable(plan) || plan.status === 'SENDING';
  return current.some((moment) => moment.drafts.some((draft) => (draft.plans ?? []).some(active))) || state.savedPlans.some(active);
}

class ManageError extends Error {}

/**
 * Everything the rendered card shows. An ordinary moment save — a new title, a moved date, a changed
 * recipient — runs through the same `save()` as a card edit, so this is what tells the two apart and
 * keeps a rename from re-uploading a megabyte of unchanged image.
 */
export function cardFingerprint(state: Pick<ManageState, 'settings' | 'title'>): string {
  return [state.settings.imageID, state.title, state.settings.cardGreeting ?? state.settings.baseMessage, state.settings.cardSignature ?? ''].join('|');
}

function bytesToUuid(hex: string): string {
  const bytes = hex
    .slice(0, 32)
    .match(/.{2}/g)!
    .map((pair) => parseInt(pair, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const h = bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** `init(group:store:…)` (ManageFestivalModel.swift:64-79). */
export function createManageModel(group: MomentDisplayGroup, deps: ManageDeps): ManageModel {
  const store = deps.store;
  const first = group.moments[0];
  const saved = readFestivalSettings(first.festivalSettings) ?? newFestivalSettings(deps.uuid());
  const recipients: ManagedRecipient[] = group.moments.filter(hasRecipient).map((moment) => {
    const prefix = `${moment.type}:${saved.groupID}:`;
    const key = moment.sourceKey.startsWith(prefix) ? moment.sourceKey.slice(prefix.length) : moment.id;
    return {
      momentID: moment.id,
      key,
      name: moment.firstName,
      phone: moment.phone,
      email: moment.email,
      selected: saved.selected[key] ?? moment.enabled,
      contactIdentifier: saved.contactIDs[key] ?? '',
    };
  });
  const settings: FestivalSettings = { ...saved, channels: { ...saved.channels } };
  if (settings.baseMessage === '') {
    settings.baseMessage =
      first.drafts[0]?.body ??
      (first.type === 'getWellSoon'
        ? 'Get well soon. Wishing you comfort, rest, and brighter days ahead.'
        : first.type === 'festival'
          ? fallbackWish(first.title, 'Warm')
          : `${first.title}! Sending you warm wishes on your special day.`);
  }
  for (const recipient of recipients) {
    if (settings.channels[recipient.key] === undefined) {
      settings.channels[recipient.key] = recipient.phone === '' ? (recipient.email === '' ? 'share' : 'email') : 'messages';
    }
  }
  const date = momentDate(first.nextOccurrence, first.timeZoneID, deps.now());
  let zone = first.timeZoneID;
  let sendDate = zonedInstant(first.nextOccurrence, 8, 0, first.timeZoneID) ?? date;
  const draft = parseInstant(settings.draftSendDate);
  if (draft !== null) sendDate = draft;
  const upcoming = group.moments
    .map((moment) =>
      moment.drafts
        .flatMap((item) => item.plans ?? [])
        .filter((plan) => ['SCHEDULED', 'AWAITING_CONFIRMATION'].includes(plan.status) && momentDay(parseInstant(plan.scheduledAtUTC) ?? 0, moment.timeZoneID) === moment.nextOccurrence)
        .sort((a, b) => (parseInstant(a.scheduledAtUTC) ?? 0) - (parseInstant(b.scheduledAtUTC) ?? 0))[0],
    )
    .find((plan) => plan !== undefined);
  if (upcoming) {
    sendDate = parseInstant(upcoming.scheduledAtUTC) ?? sendDate;
    zone = upcoming.timeZoneID;
  }

  let imageTimer = 0;

  const model = createStore<ManageState>()((set, get) => {
    const isBusy = () => get().busy;

    async function persist(cancelSchedules: boolean): Promise<void> {
      const state = get();
      if (state.title.trim() === '' || characterCount(state.title) > 150) throw new ManageError('Enter a moment name of 1–150 characters.');
      if (state.recipients.length > 0) {
        const issue = validateRecipients(state.recipients, state.settings);
        if (issue) throw new ManageError(issue);
      }
      await deps.validateContacts(state.recipients);
      const nextSettings: FestivalSettings = {
        ...state.settings,
        contactIDs: { ...state.settings.contactIDs },
        selected: { ...state.settings.selected },
      };
      for (const recipient of state.recipients) {
        nextSettings.contactIDs[recipient.key] = recipient.contactIdentifier;
        nextSettings.selected[recipient.key] = recipient.selected;
      }
      set({ settings: nextSettings });
      const input = {
        ids: state.originals.map((moment) => moment.id),
        title: state.title,
        date: momentDay(state.date, state.zone),
        timeZoneID: state.zone,
        yearly: state.yearly,
        active: state.active,
        recipients: state.recipients.map((recipient) => ({
          ...(recipient.momentID ? { id: recipient.momentID } : {}),
          key: recipient.key,
          name: recipient.name,
          phone: normalizedPhone(recipient.phone),
          email: recipient.email.trim(),
          selected: recipient.selected,
        })),
        settings: JSON.parse(stableStringify(nextSettings)) as FestivalSettings,
        cancelSchedules,
      };
      await store.getState().request<MomentOK>('festivalSave', input);
      await store.getState().refresh();
      const type = occasionType(get());
      const updated = (store.getState().snapshot?.moments ?? []).filter(
        (moment) => !isArchived(moment) && moment.type === type && readFestivalSettings(moment.festivalSettings)?.groupID === nextSettings.groupID,
      );
      if (updated.length === 0) throw new ManageError('Saved. Refresh Moments before continuing.');
      const nextRecipients = get().recipients.map((recipient) => {
        const match = updated.find((moment) => moment.id === recipient.momentID || moment.sourceKey === `${type}:${nextSettings.groupID}:${recipient.key}`);
        return match ? { ...recipient, momentID: match.id } : recipient;
      });
      const current = get();
      if (current.savedImageID !== current.settings.imageID) deps.images.delete(current.savedImageID);
      for (const id of current.stagedImages) if (id !== current.settings.imageID) deps.images.delete(id);
      set({ originals: updated, recipients: nextRecipients, stagedImages: [], savedImageID: current.settings.imageID });
      set({ baseline: fingerprint(get()), keys: {}, draftIDs: {}, savedPlans: [] });
    }

    return {
      tab: 'Details',
      pendingTab: null,
      title: first.title,
      date,
      zone,
      yearly: first.yearly,
      active: group.moments.some((moment) => moment.enabled),
      recipients,
      settings,
      sendDate,
      notify: settings.draftNotify ?? true,
      needsScheduleConfirmation: false,
      busy: false,
      generatingImage: false,
      error: null,
      notice: settings.catalogNotice ?? null,
      images: [],
      catalog: [],
      savedPlans: [],
      scheduleCompleted: false,
      imageUri: deps.images.load(settings.imageID),
      originals: group.moments,
      baseline: '',
      savedImageID: settings.imageID,
      stagedImages: [],
      keys: {},
      draftIDs: {},
      imageGeneration: 0,
      card: first.card ?? null,
      cardUploading: false,
      cardFailed: false,
      uploadedCardKey: '',

      setTitle: (title) => set({ title }),
      setDate(value) {
        const { date: old, zone: currentZone, sendDate: currentSend, settings: currentSettings } = get();
        if (momentDay(value, currentZone) === momentDay(old, currentZone)) {
          set({ date: value });
          return;
        }
        // Move the proposed delivery to the edited day, preserving its local send time. Existing
        // deliveries still go through the cancel-and-save confirmation.
        const moved = keepTimeOnDay(currentSend, momentDay(value, currentZone), currentZone);
        set({ date: value, sendDate: moved, settings: { ...currentSettings, draftSendDate: isoString(moved) } });
      },
      setZone: (zone) => set({ zone }),
      setYearly: (yearly) => set({ yearly }),
      setSendDate: (value) => set((state) => ({ sendDate: value, settings: { ...state.settings, draftSendDate: isoString(value) } })),
      setNotify: (value) => set((state) => ({ notify: value, settings: { ...state.settings, draftNotify: value } })),
      updateSettings: (patch) => set((state) => ({ settings: { ...state.settings, ...patch } })),
      setRecipients: (next) => set({ recipients: next }),
      updateRecipient: (key, patch) => set((state) => ({ recipients: state.recipients.map((recipient) => (recipient.key === key ? { ...recipient, ...patch } : recipient)) })),
      setError: (error) => set({ error }),
      setNeedsScheduleConfirmation: (value) => set({ needsScheduleConfirmation: value }),
      setScheduleCompleted: (value) => set({ scheduleCompleted: value }),
      showTab: (tab) => set({ tab }),

      async loadCatalog() {
        if (occasionType(get()) !== 'festival') return;
        try {
          const response = await store.getState().request<CatalogResponse>('festivalCatalog', {});
          set({ catalog: response.entries });
        } catch {
          set({ notice: 'Catalog updates are unavailable. You can manage the festival date manually.' });
        }
      },

      useCatalog() {
        const state = get();
        const entry = state.catalog.find((item) => item.id === state.settings.catalogID);
        const day = entry ? catalogNext(entry, momentDay(deps.now(), state.zone)) : undefined;
        if (!day) {
          set({ error: 'No verified future catalog date is available.', settings: { ...state.settings, catalogManaged: false } });
          return;
        }
        get().setDate(momentDate(day, state.zone, deps.now()));
        set({ yearly: false, notice: 'Catalog date applied. Saving will require rescheduling any existing wishes.' });
      },

      invalidateApproval() {
        set((state) => ({ settings: { ...state.settings, approvedAt: null }, draftIDs: {}, keys: {} }));
      },

      async setActive(value, cancelSchedules = false) {
        const old = get().active;
        set({ active: value });
        await get().save(cancelSchedules);
        if (get().error !== null) set({ active: old });
      },

      async changeTab(target) {
        const state = get();
        if (target === state.tab || state.busy) return;
        set({ pendingTab: target });
        if (isDirty(get())) await get().save();
        else set({ tab: target, pendingTab: null });
      },

      cancelTabChange: () => set({ pendingTab: null }),

      async save(cancelSchedules = false) {
        if (isBusy()) return;
        if (!isDirty(get())) {
          set({ error: null, notice: 'No changes to save. Your existing schedule is unchanged.' });
          return;
        }
        set({ busy: true, error: null, notice: null });
        try {
          await persist(cancelSchedules);
          const target = get().pendingTab;
          if (target) set({ tab: target, pendingTab: null });
          set({ notice: cancelSchedules ? 'Changes saved. Review and schedule your updated wish again.' : 'Moment changes saved.' });
          // Manage Moment saves the card through this path, not `greetingCardSave`, so the upload
          // has to hang off it too. `uploadCard` no-ops when the card has not changed.
          await get().uploadCard();
        } catch (error) {
          if (isApiError(error) && error.status === 409 && error.message.includes('Existing schedules')) set({ needsScheduleConfirmation: true });
          else {
            // A failed ordinary save keeps the edits and shows the error, but still lets the
            // person move between steps (ManageFestivalModel.swift:117).
            const target = get().pendingTab;
            set({ error: errorMessage(error), ...(target ? { tab: target } : {}), pendingTab: null });
          }
        } finally {
          set({ busy: false });
        }
      },

      async generate(aiConsent) {
        if (isBusy()) return;
        set({ busy: true, error: null });
        try {
          get().invalidateApproval();
          const state = get();
          const firstMoment = state.originals[0];
          const offline = () => fallbackWish(state.title, state.settings.tone, occasionType(state));
          if (!aiConsent || !firstMoment) {
            set({ settings: { ...get().settings, baseMessage: offline(), manuallyEdited: false }, notice: 'Offline draft — review before saving.' });
            return;
          }
          try {
            const result = await store.getState().request<GenerateResponse>('generate', {
              momentID: firstMoment.id,
              tone: state.settings.tone,
              personalContext: state.settings.personalContext,
              festivalName: state.title,
              aiConsent: true,
              shared: true,
            });
            set({
              settings: { ...get().settings, baseMessage: result.draft.body, manuallyEdited: false },
              notice: result.usedAI ? 'AI draft ready for review.' : 'AI unavailable; an editable fallback draft is ready.',
            });
          } catch {
            set({ settings: { ...get().settings, baseMessage: offline() }, notice: 'Offline fallback — review before saving.' });
          }
        } finally {
          set({ busy: false });
        }
      },

      async approve(cancelSchedules = false) {
        if (isBusy()) return;
        const { settings: current } = get();
        const valid = (text: string) => text.trim() !== '' && characterCount(text) <= 500;
        if (!valid(current.baseMessage) || !Object.values(current.overrides).every(valid)) {
          set({ error: 'Each message must contain 1–500 characters.' });
          return;
        }
        set({ settings: { ...current, approvedAt: isoString(deps.now()) } });
        await get().save(cancelSchedules);
        if (get().error !== null || get().needsScheduleConfirmation) set((state) => ({ settings: { ...state.settings, approvedAt: null } }));
        else set({ notice: 'Message approved and saved. Nothing has been sent.' });
      },

      generateImage() {
        const state = get();
        const firstMoment = state.originals[0];
        if (state.generatingImage || !firstMoment) return;
        const token = ++imageTimer;
        set({ generatingImage: true, error: null, imageGeneration: token });
        void (async () => {
          try {
            const result = await store.getState().request<ArtworkResponse>('greetingArtwork', {
              momentID: firstMoment.id,
              festival: state.title,
              style: state.settings.imageStyle,
              aspect: state.settings.imageAspect,
              prompt: state.settings.imagePrompt,
              aiConsent: true,
            });
            if (get().imageGeneration !== token) return;
            if (typeof result.data !== 'string' || result.data === '' || (result.data.length * 3) / 4 > 5_000_000) {
              throw new ManageError('The artwork could not be opened. Please try again.');
            }
            set({ images: [{ id: deps.uuid(), base64: result.data }] });
          } catch (error) {
            if (get().imageGeneration === token) set({ error: errorMessage(error) });
          } finally {
            if (get().imageGeneration === token) set({ generatingImage: false });
          }
        })();
      },

      async saveGreetingCard() {
        const firstMoment = get().originals[0];
        if (isBusy() || !firstMoment) return false;
        set({ busy: true, error: null });
        try {
          const { settings: current } = get();
          await store.getState().request<MomentOK>('greetingCardSave', {
            momentID: firstMoment.id,
            settings: {
              groupID: current.groupID,
              imageID: current.imageID,
              imageStyle: current.imageStyle,
              imageAspect: current.imageAspect,
              imagePrompt: current.imagePrompt,
              ...(current.cardSignature != null ? { cardSignature: current.cardSignature } : {}),
              ...(current.cardGreeting != null ? { cardGreeting: current.cardGreeting } : {}),
            },
          });
          const state = get();
          if (state.savedImageID !== state.settings.imageID) deps.images.delete(state.savedImageID);
          for (const id of state.stagedImages) if (id !== state.settings.imageID) deps.images.delete(id);
          set({ stagedImages: [], savedImageID: state.settings.imageID });
          await store.getState().refresh();
          set({ notice: 'Greeting card saved.' });
          await get().uploadCard();
          return true;
        } catch (error) {
          set({ error: errorMessage(error) });
          return false;
        } finally {
          set({ busy: false });
        }
      },

      /**
       * The finished card, rendered and sent to `PUT /api/moments/{id}/card` so scheduled emails can
       * embed it. Runs after the card is saved by either route — `greetingCardSave` from the card
       * editor, and the ordinary `festivalSave` that Manage Moment's "Save Message" uses — because a
       * card edited on that screen is never sent through `greetingCardSave`.
       *
       * The card itself is already saved by the time this runs, so a failure here never surfaces as
       * the screen's error: it sets `cardFailed`, which draws the inline note and its Retry.
       */
      async uploadCard() {
        const state = get();
        const firstMoment = state.originals[0];
        // No artwork means no card to attach; a moment that never had one is not a failure.
        if (!firstMoment || state.imageUri === null || state.cardUploading) return;
        // Unchanged since the last successful upload: the stored image is already the finished card.
        const key = cardFingerprint(state);
        if (key === state.uploadedCardKey && state.card !== null && !state.cardFailed) return;
        set({ cardUploading: true });
        try {
          const captured = await deps.cards.capture();
          if (captured === null) return;
          const data = await deps.cards.encode(captured);
          let card: MomentCard;
          try {
            card = await deps.cards.upload(firstMoment.id, data);
          } catch (error) {
            // 413 is the server saying the bytes are over its 1.5 MB limit. Re-encode the same
            // capture smaller and send it once more; a second failure is a failure.
            if (!isApiError(error) || error.status !== 413) throw error;
            card = await deps.cards.upload(firstMoment.id, await deps.cards.encodeSmaller(captured));
          }
          set({ card, cardFailed: false, uploadedCardKey: key });
        } catch {
          set({ cardFailed: true });
        } finally {
          set({ cardUploading: false });
        }
      },

      async retryCardUpload() {
        // Clearing the key is what makes the retry actually re-send rather than see "unchanged".
        set({ cardFailed: false, uploadedCardKey: '' });
        await get().uploadCard();
      },

      async removeCard() {
        const firstMoment = get().originals[0];
        if (!firstMoment || get().cardUploading) return;
        set({ cardUploading: true, error: null });
        try {
          await deps.cards.remove(firstMoment.id);
          set({ card: null, cardFailed: false, notice: 'Card removed. Scheduled emails will send the text only.' });
        } catch (error) {
          set({ error: errorMessage(error) });
        } finally {
          set({ cardUploading: false });
        }
      },

      /**
       * The stored card, for opening the editor on a device that never held the artwork. The bytes
       * become a local image exactly as generated artwork does, so the preview, the capture and a
       * re-save all work afterwards without a special case.
       */
      async loadStoredCard() {
        const state = get();
        const firstMoment = state.originals[0];
        if (!firstMoment || state.imageUri !== null || state.card === null) return;
        try {
          const stored = await deps.cards.fetch(firstMoment.id);
          if (stored === null || get().imageUri !== null) return;
          const id = deps.images.store(stored.base64);
          set((current) => ({ settings: { ...current.settings, imageID: id }, savedImageID: id, imageUri: deps.images.load(id) }));
        } catch {
          // A card that will not download is not worth an error on a screen that otherwise works.
        }
      },

      /** Swift cancels the request; here its answer is ignored when it lands. */
      cancelImage() {
        if (!get().generatingImage) return;
        imageTimer++;
        set({ generatingImage: false, imageGeneration: imageTimer });
      },

      chooseImage(image) {
        try {
          const id = deps.images.store(image.base64);
          set((state) => ({
            settings: { ...state.settings, imageID: id },
            stagedImages: [...state.stagedImages, id],
            imageUri: deps.images.load(id),
            images: [],
          }));
          get().invalidateApproval();
        } catch {
          set({ error: 'Could not save image preview.' });
        }
      },

      discardImageEdits() {
        for (const id of get().stagedImages) deps.images.delete(id);
        set({ stagedImages: [] });
      },

      removeImage() {
        set((state) => ({ settings: { ...state.settings, imageID: '', includeImage: false }, imageUri: null }));
        get().invalidateApproval();
      },

      async delete() {
        if (isBusy()) return false;
        set({ busy: true });
        try {
          await store.getState().request<MomentOK>('festivalDelete', { ids: get().originals.map((moment) => moment.id) });
          deps.images.delete(get().savedImageID);
          get().discardImageEdits();
          get().removeImage();
          await store.getState().refresh();
          return true;
        } catch (error) {
          set({ error: errorMessage(error) });
          return false;
        } finally {
          set({ busy: false });
        }
      },

      async schedule() {
        if (isBusy()) return;
        set({ error: null });
        const initial = get();
        const ready = emailReady(store.getState());
        const issue = validateSchedule({ settings: initial.settings, date: initial.sendDate, active: initial.active, emailReady: ready, recipients: initial.recipients, now: deps.now() });
        if (issue) {
          set({ error: issue });
          return;
        }
        if (selectedRecipients(initial).some((recipient) => characterCount(deliveryMessage(initial, recipient)) > 500)) {
          set({ error: 'A personalized message exceeds 500 characters. Shorten the wish before scheduling.' });
          return;
        }
        if (isDirty(initial)) {
          set({ error: 'Save your changes before scheduling.' });
          return;
        }
        set({ busy: true });
        try {
          await deps.validateContacts(initial.recipients);
          const selected = selectedRecipients(get());
          if (get().notify || selected.some((recipient) => recipientChannel(get(), recipient) !== 'email' || get().settings.automatic[recipient.key] !== true)) {
            await store.getState().authorizeNotifications();
          }
          for (const recipient of selected) {
            const state = get();
            if (state.savedPlans.some((plan) => plan.idempotencyKey === state.keys[recipient.key])) continue;
            if (!recipient.momentID) throw new ManageError('Save recipients first.');
            if (state.draftIDs[recipient.key] === undefined) {
              const generated = await store.getState().request<DraftResponse>('generate', { momentID: recipient.momentID, tone: state.settings.tone, aiConsent: false });
              const approved = await store.getState().request<DraftResponse>('approve', { id: generated.draft.id, body: deliveryMessage(get(), recipient), approved: true });
              set((current) => ({ draftIDs: { ...current.draftIDs, [recipient.key]: approved.draft.id } }));
            }
            if (get().keys[recipient.key] === undefined) {
              const seed = [get().settings.groupID, recipient.key, get().settings.approvedAt ?? '', isoString(get().sendDate), recipientChannel(get(), recipient)].join('|');
              const key = bytesToUuid(await deps.sha256Hex(seed));
              set((current) => ({ keys: { ...current.keys, [recipient.key]: key } }));
            }
            const channel = recipientChannel(get(), recipient);
            const input: WishScheduleInput = {
              draftID: get().draftIDs[recipient.key],
              channel,
              recipient: channel === 'email' ? recipient.email : normalizedPhone(recipient.phone),
              scheduledAtUTC: isoString(get().sendDate),
              timeZoneID: get().zone,
              automaticDelivery: channel === 'email' && get().settings.automatic[recipient.key] === true,
              reminderOffset: get().notify ? 60 : 0,
              repeatYearly: false,
              idempotencyKey: get().keys[recipient.key],
              sendNow: false,
              approved: true,
            };
            const response = await store.getState().request<PlanResponse>('schedule', input);
            set((current) => ({ savedPlans: [...current.savedPlans, response.plan] }));
          }
          await store.getState().refresh();
          const moments = store.getState().snapshot?.moments ?? [];
          set((current) => ({
            originals: current.originals.map((original) => moments.find((moment) => moment.id === original.id) ?? original),
            notice: `${current.savedPlans.length} wishes scheduled. Messages requires confirmation.`,
            scheduleCompleted: true,
          }));
        } catch (error) {
          set({ error: `${get().savedPlans.length} scheduled. ${errorMessage(error)} Retry continues remaining recipients.` });
          await store.getState().refresh();
        } finally {
          set({ busy: false });
        }
      },
    };
  });

  model.setState({ baseline: fingerprint(model.getState()) });
  return model;
}
