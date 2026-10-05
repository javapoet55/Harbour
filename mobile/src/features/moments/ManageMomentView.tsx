import Ionicons from '@expo/vector-icons/Ionicons';
import * as Crypto from 'expo-crypto';
import { router, Stack } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Keyboard, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useStore } from 'zustand';

import { ownerKeyFor } from '../../actions/persistence';
import { momentsApi } from '../../api/moments';
import { KeyboardAwareScrollView } from '../../components/keyboard';
import { Text } from '../../components/Text';
import { TodayBackdrop } from '../../components/TodayShell';
import { FitText } from '../../components/FitText';
import { IOSSwitch } from '../../components/IOSSwitch';
import { SegmentRow } from '../../components/SegmentRow';
import { GlassCapsule } from '../../components/PushedHeader';
import { withAlpha } from '../../components/SignInBackdrop';
import { androidLabel, androidSeparator, ANDROID_LABEL_GAP, brand, isAndroid, textStyles, useTheme } from '../../theme';
import {
  BorderedButton,
  caption,
  ErrorText,
  headline,
  IconLabel,
  KEYBOARD_DONE_BAR_HEIGHT,
  KeyboardDoneBar,
  MomentCard,
  MomentIconTile,
  MomentPrimary,
  MomentSegments,
  MomentSheet,
  Secondary,
  systemColors,
} from './components';
import { captureCard, GreetingCardCapture } from './cardCapture';
import { MomentConnectSection } from './MomentConnectSection';
import { ScheduleReviewSheet, ScheduleSuccess } from './ScheduleReview';
import { CARD_NOT_ATTACHED, cardEncoder, encodeCard, encodeSmallerCard } from './cardImage';
import { sendDayLabel } from './dates';
import { contactChoice, contactFullName, imageStorage, pickContact, validatePickedContacts, type ContactChoice } from './device';
import { RecipientSheet, type RecipientSheetRequest } from './RecipientSheet';
import { recordRecipient, updateContactLinks } from './contactLinks';
import {
  capitalized,
  characterCount,
  maskedAddress,
  planStatusLabel,
  recipientInitials,
  sortedPlans,
  validateSchedule,
  MOMENT_TYPES,
  PREPARATION_CHOICES,
  preparationMinutes,
  typeLabel,
  withPreparationMinutes,
  type ManagedRecipient,
  type MomentDisplayGroup,
  defaultChannel,
  type RecipientDraft,
} from './domain';
import { DateField, Disclosure, FormField, FormScroll, FormSection, FormRow, FormToggle, FormButton, MenuPicker, PopoverMenu, usePopoverMenu, ZonePicker, genericZoneName } from './form';
import { FestivalGreetingCard, GreetingCardEditor } from './GreetingCard';
import {
  cardMessage,
  createManageModel,
  deliveryMessage,
  emailReady as isEmailReady,
  hasSchedules,
  isDirty,
  MANAGE_TABS,
  messageSuggestion,
  occasionLabel,
  occasionSource,
  occasionType,
  pendingChange,
  recipientChannel,
  reviewHeading,
  selectedRecipients,
  type ManageModel,
} from './manageModel';
import { festivalModelFor, momentsStore, releaseFestivalModel, retainFestivalModel, useMoments } from './store';
import { needsCancelPrompt } from './wishMessage';

/** The model's device dependencies, shared with Review Wish's greeting-card section. */
export function newManageModel(group: MomentDisplayGroup): ManageModel {
  const model: ManageModel = createManageModel(group, {
    store: momentsStore,
    images: imageStorage,
    validateContacts: (recipients) => validatePickedContacts(recipients),
    sha256Hex: (value) => ownerKeyFor(value),
    uuid: () => Crypto.randomUUID().toUpperCase(),
    now: () => Date.now(),
    cards: {
      // The captor is registered by the off-screen `GreetingCardCapture` this screen mounts, so the
      // model is handed its own store to look itself up by once that view exists.
      capture: (message) => captureCard(model, message),
      encode: (uri) => encodeCard(uri, cardEncoder),
      encodeSmaller: (uri) => encodeSmallerCard(uri, cardEncoder),
      upload: async (momentID, data) => (await momentsApi.uploadCard(momentID, data)).card,
      remove: async (momentID) => {
        await momentsApi.deleteCard(momentID);
      },
      fetch: (momentID) => momentsApi.card(momentID),
    },
  });
  return model;
}

/**
 * The one live model for a moment's group, retained while this screen shows it. Manage Moment and the
 * greeting-card section on the moment editor share it, so a wish edited in either is the same wish.
 */
export function useManageModel(group: MomentDisplayGroup): ManageModel {
  const [model] = useState(() => festivalModelFor(group, newManageModel));
  useEffect(() => {
    retainFestivalModel(model);
    return () => releaseFestivalModel(model);
  }, [model]);
  return model;
}

const TONES = ['Warm', 'Personal', 'Short', 'Fun'] as const;

/**
 * `ManageFestivalView` (ios/App/ManageFestivalView.swift:89-278): the header summary card with the
 * Active toggle, the Contacts / Message / Schedule step tabs (Phase 12: Details folded into Schedule; a
 * tab change auto-saves pending edits and a failed save stays put; a successful Save goes on to the next
 * step), Edit Moment, every sheet and dialog, and — once "Confirm Schedule" succeeds —
 * `FestivalScheduleSuccess` with its confetti (`:348-387`).
 *
 * `onDone` is the `onDone` closure Swift threads through: Done on the success screen, and nothing else.
 */
/**
 * A heading over one of the form cards (Reminder & Repeat, Send time, Delivery). iOS keeps the
 * Swift `.title2` heading, the content's 20 above the card. Android draws the one shared field label
 * (docs/android-polish.md §4), 8 above its card, so these read like every other form's labels.
 */
function CardHeading({ title, children }: { title: string; children: ReactNode }) {
  const theme = useTheme();
  if (!isAndroid()) {
    return (
      <>
        <Text style={[textStyles.title2, styles.bold, { color: theme.colors.label }]}>{title}</Text>
        {children}
      </>
    );
  }
  return (
    <View style={styles.androidCardSection}>
      <Text style={androidLabel(theme)}>{title}</Text>
      {children}
    </View>
  );
}

export function ManageMomentView({ group, onDone }: { group: MomentDisplayGroup; onDone: () => void }) {
  const theme = useTheme();
  const model = useManageModel(group);
  const state = useStore(model);
  // Android (docs/android-polish.md §14-15): while a wish is being written the tab holds its wish
  // controls only. iOS keeps its screen-wide "Saving…" hold for the draft, as before.
  const writingWish = isAndroid() && state.generatingWish;
  const screenBusy = state.busy || (!isAndroid() && state.generatingWish);
  const snapshot = useMoments((store) => store.snapshot);
  const ready = isEmailReady({ snapshot });
  const dirty = isDirty(state);
  const type = occasionType(state);
  const selected = selectedRecipients(state);

  const [showAllContacts, setShowAllContacts] = useState(false);
  const [manual, setManual] = useState(false);
  const [personalize, setPersonalize] = useState(false);
  const [imageSheet, setImageSheet] = useState(false);
  const [scheduleConfirm, setScheduleConfirm] = useState(false);
  const [reviewKey, setReviewKey] = useState(0);
  // `momentEditor` (:97): Edit Moment, from the Moment card on Schedule.
  const [momentEditor, setMomentEditor] = useState(false);
  const [momentEditorKey, setMomentEditorKey] = useState(0);
  const [aiConsent, setAiConsent] = useState(false);
  const approveAfterCancel = useRef(false);
  const [contactChoices, setContactChoices] = useState<ContactChoice[]>([]);
  // Android: Add Contact, Enter recipient manually and Edit recipient share one sheet (RecipientSheet.tsx).
  const [recipientSheet, setRecipientSheet] = useState<RecipientSheetRequest | null>(null);
  // The picked contact's numbers and addresses, by recipient key, so Edit offers them again this session.
  const [addressChoices, setAddressChoices] = useState<Record<string, { phones: string[]; emails: string[] }>>({});
  const [choicePhone, setChoicePhone] = useState('');
  const [choiceEmail, setChoiceEmail] = useState('');
  const optionsAnchor = useRef<View>(null);
  const optionsMenu = usePopoverMenu(optionsAnchor);
  const messageRef = useRef<TextInput>(null);
  const [openedAt] = useState(() => Date.now());

  // `.task { await model.loadCatalog() }`, `.onDisappear { model.cancelImage() }`
  useEffect(() => {
    void model.getState().loadCatalog();
    // A card made on another device has no local artwork, so fetch the stored image to show it.
    void model.getState().loadStoredCard();
    return () => model.getState().cancelImage();
  }, [model]);

  // `.alert("Save changes to scheduled wishes?", isPresented: $model.needsScheduleConfirmation)`
  useEffect(() => {
    // Edit Moment asks its own question about schedules (MomentDetailsSheet), so not twice.
    if (!state.needsScheduleConfirmation || momentEditor) return;
    Alert.alert(
      'Save changes to scheduled wishes?',
      'Saving these changes cancels the existing schedules for this moment. After saving, review and schedule your updated wishes again.',
      [
        {
          text: 'Cancel schedules and save',
          onPress: () => {
            model.getState().setNeedsScheduleConfirmation(false);
            if (approveAfterCancel.current) void model.getState().approve(true);
            else void model.getState().save(true);
          },
        },
        {
          text: 'Keep schedules',
          style: 'cancel',
          onPress: () => {
            model.getState().setNeedsScheduleConfirmation(false);
            model.getState().cancelTabChange();
          },
        },
      ],
      { cancelable: false },
    );
  }, [model, state.needsScheduleConfirmation, momentEditor]);

  const back = () => {
    if (!dirty) {
      router.back();
      return;
    }
    Alert.alert('Discard unsaved changes?', undefined, [
      {
        text: 'Discard changes',
        style: 'destructive',
        onPress: () => {
          model.getState().discardImageEdits();
          router.back();
        },
      },
      { text: 'Keep editing', style: 'cancel' },
    ]);
  };

  const confirmDelete = () =>
    Alert.alert('Delete Moment?', 'Contacts will be disconnected, scheduled wishes cancelled, and saved drafts deleted. Sent history remains.', [
      {
        text: 'Delete Moment',
        style: 'destructive',
        onPress: () => {
          void model
            .getState()
            .delete()
            .then((deleted) => deleted && router.back());
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);

  const setActive = (value: boolean) => {
    if (!value && hasSchedules(model.getState(), momentsStore.getState())) {
      Alert.alert('Disable this moment? Pending wishes will be cancelled. Contacts and messages are preserved.', undefined, [
        { text: 'Disable and cancel wishes', style: 'destructive', onPress: () => void model.getState().setActive(false, true) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    } else void model.getState().setActive(value);
  };

  /** `save(approve:)` (ManageFestivalView.swift:152). */
  /**
   * `save(approve:)` (ManageFestivalView.swift:167). Asks to cancel schedules only for a change to who,
   * when or how a wish is delivered, or a message saved without approving it. An approved message-only
   * save goes straight through with `cancelSchedules:false` — the server rewrites the pending wishes'
   * text rather than cancelling them.
   */
  const save = (approve = false) => {
    Keyboard.dismiss();
    // Phase 12: a successful save goes on to the next step (Contacts → Message → Schedule).
    model.getState().prepareNextTabAfterSave();
    approveAfterCancel.current = approve;
    const current = model.getState();
    const scheduled = hasSchedules(current, momentsStore.getState());
    if (needsCancelPrompt(pendingChange(current), approve, scheduled)) current.setNeedsScheduleConfirmation(true);
    else if (approve) void current.approve();
    else void current.save();
  };

  const addContact = async () => {
    Keyboard.dismiss();
    try {
      const contact = await pickContact();
      if (!contact) return;
      const choice = contactChoice(contact);
      if (isAndroid()) {
        setRecipientSheet({
          mode: 'add',
          draft: {
            key: Crypto.randomUUID().toUpperCase(),
            // The name is used as a first name in greetings, so the given name comes first.
            name: contact.firstName || contactFullName(contact) || choice.name,
            phone: choice.phones[0] ?? '',
            email: choice.emails[0] ?? '',
            contactIdentifier: contact.id,
          },
          choices: { phones: choice.phones, emails: choice.emails },
        });
        return;
      }
      setChoicePhone(choice.phones[0] ?? '');
      setChoiceEmail(choice.emails[0] ?? '');
      setContactChoices([choice]);
    } catch (error) {
      model.getState().setError(error instanceof Error ? error.message : String(error));
    }
  };

  /**
   * The recipient sheet's Add / Save (Android). A new person joins selected, with the default channel
   * (Messages when there is a phone, else Email). An edit keeps the person's moment and selection; a
   * channel whose address was removed falls back to the default (`saveRecipient`, ManageFestivalModel).
   * Which addresses came from the contact card is recorded on the device (`contactLinks.ts`).
   */
  const submitRecipient = (draft: RecipientDraft) => {
    const request = recipientSheet;
    if (!request) return;
    const current = model.getState();
    const previous = request.mode === 'edit' ? current.recipients.find((recipient) => recipient.key === draft.key) : undefined;
    const choices = request.choices;
    void updateContactLinks((links) => recordRecipient(links, { ...draft, phoneChoices: choices?.phones ?? [], emailChoices: choices?.emails ?? [] }, previous)).catch(() => undefined);
    if (choices && (choices.phones.length > 0 || choices.emails.length > 0)) setAddressChoices((known) => ({ ...known, [draft.key]: choices }));
    const contactIdentifier = draft.contactIdentifier;
    if (request.mode === 'add') {
      current.setRecipients([...current.recipients, { ...draft, contactIdentifier, selected: true }]);
      current.updateSettings({ channels: { ...current.settings.channels, [draft.key]: defaultChannel(draft) } });
    } else {
      current.updateRecipient(draft.key, { name: draft.name, phone: draft.phone, email: draft.email, contactIdentifier });
      const channel = current.settings.channels[draft.key];
      if ((channel === 'messages' && draft.phone === '') || (channel === 'email' && draft.email === '')) {
        current.updateSettings({ channels: { ...current.settings.channels, [draft.key]: defaultChannel(draft) } });
      }
    }
    current.invalidateApproval();
    setRecipientSheet(null);
  };

  const addSelectedRecipient = async () => {
    const choice = contactChoices[0];
    if (!choice) return;
    const key = await ownerKeyFor(choice.id);
    const current = model.getState();
    if (!current.recipients.some((recipient) => recipient.key === key || recipient.contactIdentifier === choice.id)) {
      current.setRecipients([...current.recipients, { key, name: choice.name, phone: choicePhone, email: choiceEmail, selected: true, contactIdentifier: choice.id }]);
      current.updateSettings({ channels: { ...current.settings.channels, [key]: choicePhone === '' ? 'email' : 'messages' } });
      current.invalidateApproval();
    }
    const rest = contactChoices.slice(1);
    setContactChoices(rest);
    if (rest[0]) {
      setChoicePhone(rest[0].phones[0] ?? '');
      setChoiceEmail(rest[0].emails[0] ?? '');
    }
  };

  const scheduleWish = () => {
    const current = model.getState();
    const issue = validateSchedule({ settings: current.settings, date: current.sendDate, active: current.active, emailReady: ready, recipients: current.recipients });
    if (issue) current.setError(issue);
    else if (isDirty(current)) current.setError('Save changes first.');
    else {
      // A fresh review each time (`FestivalScheduleReview.init`): the parent re-keys it.
      setReviewKey((key) => key + 1);
      setScheduleConfirm(true);
    }
  };

  if (state.scheduleCompleted) {
    const firstSelected = selected[0];
    return (
      <ScheduleSuccess
        occasion={type}
        plans={state.savedPlans}
        wish={firstSelected ? { heading: reviewHeading(state, firstSelected), message: deliveryMessage(state, firstSelected) } : null}
        done={onDone}
      />
    );
  }

  const planLinks = sortedPlans(snapshot?.moments ?? []).filter(
    (plan) => plan.status !== 'CANCELLED' && state.originals.some((moment) => moment.drafts.some((draft) => draft.id === plan.draftID)),
  );
  const automaticCount = selected.filter((recipient) => recipientChannel(state, recipient) === 'email' && state.settings.automatic[recipient.key] === true).length;
  const zoneOptions = (value: string, onChange: (zone: string) => void, testID: string) => (
    <View style={styles.inline}>
      <Text style={[textStyles.body, styles.grow, { color: theme.colors.label }]}>Time zone</Text>
      <ZonePicker hideLabel value={value} onChange={onChange} testID={testID} format={genericZoneName} />
    </View>
  );

  // "Connect me on the day" (MomentConnectSection, ManageFestivalView.swift:237): the selected
  // recipients' saved moments.
  const connectMoments = selected.flatMap((recipient) => (snapshot?.moments ?? []).filter((moment) => moment.id === recipient.momentID));
  const connectSection = <MomentConnectSection moments={connectMoments} />;

  const saveButtons = (
    <>
      <MomentPrimary title="Save Changes" onPress={() => save()} testID="festival-save" />
      <Pressable accessibilityRole="button" accessibilityLabel="Delete Moment" onPress={confirmDelete} style={styles.deleteButton} testID="festival-delete">
        <Ionicons name="trash-outline" size={17} color={theme.colors.danger} />
        <Text style={[textStyles.body, { color: theme.colors.danger }]}>Delete Moment</Text>
      </Pressable>
    </>
  );

  return (
    <View style={styles.fill}>
      <Stack.Screen
        options={{
          title: 'Manage Moment',
          headerBackVisible: false,
          gestureEnabled: false,
          headerLeft: () => (
            <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={back} hitSlop={6} testID="festival-back">
              {/* A custom back (it auto-saves first), so SwiftUI draws it as a tinted glass capsule. */}
              <GlassCapsule>
                <Ionicons name="chevron-back" size={24} color={theme.colors.link} />
              </GlassCapsule>
            </Pressable>
          ),
          headerRight: () => (
            <Pressable accessibilityRole="button" accessibilityLabel="Moment options" collapsable={false} onPress={optionsMenu.open} hitSlop={6} ref={optionsAnchor} testID="festival-options">
              <GlassCapsule>
                <Ionicons name="ellipsis-horizontal" size={22} color={theme.colors.link} />
              </GlassCapsule>
            </Pressable>
          ),
        }}
      />
      <TodayBackdrop />
      <View style={styles.fill} pointerEvents={screenBusy ? 'none' : 'auto'} testID="festival-screen">
        <KeyboardAwareScrollView bottomOffset={KEYBOARD_DONE_BAR_HEIGHT} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content} testID="festival-scroll">
          {/* identity (:100-118) */}
          <MomentCard testID="festival-identity">
            <View style={styles.identity}>
              <MomentIconTile type={type} title={state.title} />
              <View style={styles.identityText}>
                <Text style={[textStyles.title2, styles.bold, { color: theme.colors.label }]}>{state.title}</Text>
                <Secondary>{occasionLabel(state)}</Secondary>
              </View>
              <View style={styles.activeColumn}>
                <IOSSwitch
                  accessibilityLabel="Moment active"
                  onValueChange={setActive}
                  testID="festival-active"
                  value={state.active}
                />
                <Text style={[caption, { color: theme.colors.label }]}>{state.active ? 'Active' : 'Inactive'}</Text>
              </View>
            </View>
            <View testID="festival-send-date">
              {/* `Label(MomentDates.sendDayLabel(model.date, …), systemImage: "calendar")` (:155): the
                  moment's own date, which Edit Moment changes. */}
              <IconLabel icon="calendar-outline" title={sendDayLabel(state.date, state.zone)} color={theme.colors.secondaryLabel} style={textStyles.subheadline} size={15} />
            </View>
          </MomentCard>

          {/* tabs (:120). Android (docs/android-polish.md §9): the shared `SegmentRow` — every tab at one
              size, each as wide as its label, one step smaller together or scrolling if they do not fit. */}
          {isAndroid() ? (
            <SegmentRow
              labels={MANAGE_TABS}
              selected={MANAGE_TABS.indexOf(state.tab)}
              base={textStyles.subheadline}
              labelStyle={styles.tabLabel}
              gap={3}
              inset={5}
              style={[styles.tabs, { backgroundColor: theme.colors.glassFill }]}
              testID="festival-tabs"
              renderSegment={(index, fit, segmentStyle) => {
                const tab = MANAGE_TABS[index];
                const active = state.tab === tab;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={tab}
                    onPress={() => {
                      Keyboard.dismiss();
                      approveAfterCancel.current = false;
                      void model.getState().changeTab(tab);
                    }}
                    style={[styles.androidTab, segmentStyle, active && { backgroundColor: brand.nexdoIndigo }]}
                    testID={`festival-tab-${tab}`}
                  >
                    <Text
                      numberOfLines={1}
                      style={[styles.tabLabel, { fontSize: fit.fontSize, lineHeight: fit.lineHeight, color: active ? '#FFFFFF' : theme.colors.link }]}
                    >
                      {tab}
                    </Text>
                  </Pressable>
                );
              }}
            />
          ) : (
          <View style={[styles.tabs, { backgroundColor: theme.colors.glassFill }]}>
            {MANAGE_TABS.map((tab) => {
              const active = state.tab === tab;
              return (
                <Pressable
                  key={tab}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={tab}
                  onPress={() => {
                    Keyboard.dismiss();
                    approveAfterCancel.current = false;
                    void model.getState().changeTab(tab);
                  }}
                  style={[styles.tab, active && { backgroundColor: brand.nexdoIndigo }]}
                  testID={`festival-tab-${tab}`}
                >
                  {/* `.lineLimit(1).minimumScaleFactor(0.7)` (ManageFestivalView.swift:161): a label
                      shrinks to fit its third rather than truncating. */}
                  <FitText
                    fontSize={textStyles.subheadline.fontSize}
                    lineHeight={textStyles.subheadline.lineHeight}
                    minimumScale={0.7}
                    style={[styles.tabLabel, { color: active ? '#FFFFFF' : theme.colors.link }]}
                  >
                    {tab}
                  </FitText>
                </Pressable>
              );
            })}
          </View>
          )}

          {state.tab === 'Contacts' ? (
            <>
              <Text style={[textStyles.largeTitle, styles.bold, { color: theme.colors.label }]}>Recipients</Text>
              <Secondary>{`${selected.length} selected`}</Secondary>
              {state.recipients.length === 0 ? (
                <Text style={[textStyles.subheadline, { color: theme.colors.secondaryLabel }]} testID="moment-no-recipients">
                  No contacts added yet. Add a contact to choose who receives this wish.
                </Text>
              ) : (
                <MomentCard grouped>
                  {state.recipients
                    .filter((recipient, index) => showAllContacts || index < 3)
                    .map((recipient) => (
                      <RecipientEditor
                        key={recipient.key}
                        recipient={recipient}
                        channel={recipientChannel(state, recipient)}
                        onChange={(patch) => model.getState().updateRecipient(recipient.key, patch)}
                        onEdit={
                          isAndroid()
                            ? () => {
                                Keyboard.dismiss();
                                setRecipientSheet({ mode: 'edit', draft: recipient, choices: addressChoices[recipient.key] ?? null });
                              }
                            : undefined
                        }
                        onRemove={() => {
                          model.getState().setRecipients(model.getState().recipients.filter((item) => item.key !== recipient.key));
                          model.getState().invalidateApproval();
                        }}
                      />
                    ))}
                </MomentCard>
              )}
              {state.recipients.length > 3 ? (
                <Pressable accessibilityRole="button" onPress={() => setShowAllContacts(!showAllContacts)} style={styles.centerButton} testID="festival-show-contacts">
                  <Text style={[textStyles.body, { color: theme.colors.link }]}>{showAllContacts ? 'Show less' : `Show more (${state.recipients.length - 3})`}</Text>
                </Pressable>
              ) : null}
              <BorderedButton full icon="add" title="Add Contact" onPress={() => void addContact()} testID="festival-add-contact" />
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  isAndroid()
                    ? setRecipientSheet({ mode: 'add', draft: { key: Crypto.randomUUID().toUpperCase(), name: '', phone: '', email: '', contactIdentifier: '' }, choices: null })
                    : setManual(true)
                }
                style={styles.plainButton}
                testID="festival-manual"
              >
                <Text style={[textStyles.body, { color: theme.colors.link }]}>Enter recipient manually</Text>
              </Pressable>
              <IconLabel icon="lock-closed" title="Only selected contacts receive this wish." color={theme.colors.secondaryLabel} style={textStyles.subheadline} size={15} />
              {saveButtons}
            </>
          ) : null}

          {state.tab === 'Message' ? (
            <>
              <Text style={[textStyles.largeTitle, styles.bold, { color: theme.colors.label }]}>Wish Message</Text>
              <View style={styles.inline}>
                <View style={styles.grow}>
                  <IconLabel icon="people" title={`For ${selected.length} selected contact${selected.length === 1 ? '' : 's'}`} style={textStyles.subheadline} size={15} />
                </View>
                <Pressable accessibilityRole="button" onPress={() => setPersonalize(true)} style={styles.plainButton} testID="festival-personalize">
                  <Text style={[textStyles.body, { color: theme.colors.link }]}>Personalize</Text>
                </Pressable>
              </View>
              <MomentSegments options={TONES} value={state.settings.tone as (typeof TONES)[number]} onChange={(tone) => model.getState().updateSettings({ tone })} testIDPrefix="festival-tone" disabled={writingWish} />
              <MomentCard fill={{ colors: [withAlpha(systemColors.blue, 0.22), withAlpha(systemColors.cyan, 0.1)], start: { x: 0, y: 0 }, end: { x: 1, y: 1 } }}>
                <TextInput
                  ref={messageRef}
                  accessibilityLabel={`${occasionLabel(state)} wish message`}
                  editable={!writingWish}
                  multiline
                  onChangeText={(value) => model.getState().setMessage(value)}
                  placeholder={messageSuggestion(state)}
                  placeholderTextColor={theme.colors.placeholder}
                  style={[styles.editor, { color: theme.colors.label }, writingWish && styles.writing]}
                  testID="festival-message"
                  textAlignVertical="top"
                  value={state.settings.baseMessage}
                />
                <Text style={[caption, styles.counter, { color: characterCount(state.settings.baseMessage) > 500 ? theme.colors.danger : theme.colors.secondaryLabel }]}>
                  {`${characterCount(state.settings.baseMessage)}/500`}
                </Text>
                {/* The suggestion is placeholder wording; this is the only thing that saves it. */}
                {state.settings.baseMessage.trim() === '' ? (
                  <BorderedButton icon="add-circle-outline" title="Use suggestion" onPress={() => model.getState().useSuggestion()} testID="wish-use-suggestion" />
                ) : null}
              </MomentCard>
              <View style={styles.inline}>
                <BorderedButton
                  icon="sparkles"
                  title={writingWish ? 'Writing your wish…' : 'Regenerate'}
                  loading={writingWish}
                  disabled={writingWish}
                  onPress={() => {
                    if (writingWish) return;
                    if (model.getState().settings.manuallyEdited) {
                      Alert.alert('Replace the edited message with a new draft?', undefined, [
                        { text: 'Regenerate', onPress: () => void model.getState().generate(aiConsent) },
                        { text: 'Cancel', style: 'cancel' },
                      ]);
                    } else void model.getState().generate(aiConsent);
                  }}
                  testID="festival-regenerate"
                />
                <View style={styles.grow} />
                <BorderedButton icon="pencil" title="Edit" onPress={() => messageRef.current?.focus()} disabled={writingWish} testID="festival-edit-message" />
              </View>
              <FormToggle label="Use AI for this draft" value={aiConsent} onValueChange={setAiConsent} disabled={writingWish} testID="festival-ai" />
              <Text style={[caption, { color: theme.colors.secondaryLabel }]}>Shares only occasion, tone and your optional context. Generated text is a draft for your review.</Text>
              <Text style={[textStyles.title2, styles.bold, { color: theme.colors.label }]}>Greeting Card</Text>
              {state.imageUri ? (
                <FestivalGreetingCard artwork={state.imageUri} title={state.title} message={cardMessage(state)} signature={state.settings.cardSignature ?? ''} />
              ) : (
                <MomentCard>
                  <IconLabel icon="albums-outline" title="Create a personal greeting card" style={headline} />
                  <Secondary>AI artwork, your greeting, and your signature in one beautiful card.</Secondary>
                </MomentCard>
              )}
              <BorderedButton prominent icon="sparkles" title={state.imageUri ? 'Edit Greeting Card' : 'Create AI Greeting Card'} onPress={() => setImageSheet(true)} testID="festival-card" />
              <Text style={[caption, { color: theme.colors.secondaryLabel }]}>Share your finished card from the editor. Scheduled emails include your saved card; Messages send the text only.</Text>
              {/*
                The card is saved either way — this note is only about its image not reaching the
                server, so it is a note with a Retry rather than the screen's error.
              */}
              {state.cardFailed ? (
                <View style={styles.cardNote}>
                  <Text style={[caption, styles.grow, { color: theme.colors.secondaryLabel }]} testID="festival-card-upload-note">
                    {CARD_NOT_ATTACHED}
                  </Text>
                  <Pressable accessibilityRole="button" accessibilityLabel="Retry attaching the card" disabled={state.cardUploading} onPress={() => void model.getState().retryCardUpload()} testID="festival-card-retry">
                    <Text style={[textStyles.body, { color: theme.colors.link }]}>Retry</Text>
                  </Pressable>
                </View>
              ) : null}
              {/* One action for both halves: the artwork here and the image scheduled emails use. */}
              {state.imageUri || state.card ? (
                <Pressable accessibilityRole="button" disabled={state.cardUploading} onPress={() => void model.getState().removeCard()} testID="festival-remove-card">
                  <Text style={[textStyles.body, { color: theme.colors.danger }]}>Remove card</Text>
                </Pressable>
              ) : null}
              {/* ManageFestivalView.swift:168: nothing to approve while the message is blank,
                  and the server rejects one over 500 characters. */}
              {state.error ? <ErrorText testID="wish-message-error">{state.error}</ErrorText> : null}
              <MomentPrimary
                title="Save Message"
                onPress={() => save(true)}
                disabled={writingWish || state.settings.baseMessage.trim() === '' || characterCount(state.settings.baseMessage) > 500}
                testID="festival-save-message"
              />
            </>
          ) : null}

          {state.tab === 'Schedule' ? (
            <>
              {/* `momentSection` (:162-178): the moment itself, with Edit Moment. */}
              <CardHeading title="Moment">
                <MomentCard testID="festival-moment">
                  <View style={styles.momentRow}>
                    <MomentIconTile type={type} title={state.title} />
                    <View style={styles.grow}>
                      <Text style={[headline, { color: theme.colors.label }]}>{state.title}</Text>
                      <Secondary>{occasionLabel(state)}</Secondary>
                      <Text style={[textStyles.subheadline, { color: theme.colors.label }]} testID="festival-moment-date">
                        {sendDayLabel(state.date, state.zone)}
                      </Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Edit Moment"
                      hitSlop={6}
                      onPress={() => {
                        Keyboard.dismiss();
                        setMomentEditorKey((key) => key + 1);
                        setMomentEditor(true);
                      }}
                      style={styles.editMoment}
                      testID="moment-edit"
                    >
                      <Ionicons name="pencil" size={17} color={theme.colors.link} />
                      <Text style={[textStyles.body, { color: theme.colors.link }]}>Edit</Text>
                    </Pressable>
                  </View>
                  {occasionSource(state) === 'festivalCatalog' && type === 'festival' ? (
                    <>
                      <FormToggle
                        label="Update festival date automatically"
                        value={state.settings.catalogManaged}
                        onValueChange={(value) => {
                          model.getState().updateSettings({ catalogManaged: value });
                          if (value) model.getState().useCatalog();
                        }}
                        testID="festival-catalog-managed"
                      />
                      <MenuPicker
                        hideLabel
                        label="Catalog festival"
                        options={[{ value: '', title: 'Select festival' }, ...state.catalog.map((entry) => ({ value: entry.id, title: entry.name }))]}
                        value={state.settings.catalogID}
                        onChange={(value) => model.getState().updateSettings({ catalogID: value })}
                        testID="festival-catalog"
                      />
                      <Text style={[caption, { color: theme.colors.label }]}>Only verified catalog dates are used. If no date is available, confirm it manually.</Text>
                    </>
                  ) : (
                    <>
                      <FormToggle label="Repeat every year" value={state.yearly} onValueChange={(value) => model.getState().setYearly(value)} testID="moment-repeat-yearly" />
                      <Text style={[caption, { color: theme.colors.secondaryLabel }]}>
                        {type === 'festival'
                          ? 'Dates repeat yearly; festivals may move.\nConfirm the date and schedule each year.'
                          : 'Repeats on this date each year.\nReview and schedule each wish separately.'}
                      </Text>
                    </>
                  )}
                </MomentCard>
              </CardHeading>
              <CardHeading title="Send time">
                <MomentCard grouped>
                  <DateField includeTime label="Date and time" value={state.sendDate} onChange={(value) => model.getState().setSendDate(value)} zone={state.zone} minimum={openedAt} testID="festival-send-time" />
                  {zoneOptions(state.zone, (zone) => model.getState().setZone(zone), 'moment-time-zone')}
                  <View style={[styles.divider, { backgroundColor: theme.colors.separator }, androidSeparator(theme)]} />
                  {/* `preparationPicker` (:179-186): hours or days before; reminds only. */}
                  <View style={styles.inline}>
                    <Text style={[textStyles.body, styles.grow, { color: theme.colors.label }]}>Prepare reminder</Text>
                    <MenuPicker
                      hideLabel
                      label="Prepare reminder"
                      options={PREPARATION_CHOICES}
                      value={preparationMinutes(state.settings)}
                      onChange={(value) => model.getState().updateSettings(withPreparationMinutes(model.getState().settings, value))}
                      testID="moment-prepare-reminder"
                    />
                  </View>
                  <Text style={[caption, { color: theme.colors.secondaryLabel }]}>Reminds you to review the wish. Nothing is sent.</Text>
                </MomentCard>
              </CardHeading>
              <CardHeading title="Delivery">
                <MomentCard grouped>
                  {selected.map((recipient) => {
                    const channel = recipientChannel(state, recipient);
                    return (
                      <View key={recipient.key} style={styles.deliveryRow}>
                        <View style={styles.inline}>
                          <View style={[styles.initialsSmall, { backgroundColor: withAlpha(brand.nexdoIndigo, 0.12) }]}>
                            <Text style={[textStyles.body, { color: theme.colors.label }]}>{recipientInitials(recipient.name)}</Text>
                          </View>
                          <Text style={[headline, { color: theme.colors.label }]}>{recipient.name}</Text>
                        </View>
                        {/* `deliveryTags(for:)` (:243-270): Messages / Email / Copy / Share capsules. */}
                        <View style={styles.tags} testID={`festival-channels-${recipient.key}`}>
                          {recipient.phone !== '' ? <DeliveryTag title="Messages" recipient={recipient.name} selected={channel === 'messages'} onPress={() => model.getState().updateSettings({ channels: { ...model.getState().settings.channels, [recipient.key]: 'messages' } })} testID={`festival-channel-${recipient.key}-messages`} /> : null}
                          {recipient.email !== '' ? <DeliveryTag title="Email" recipient={recipient.name} selected={channel === 'email'} onPress={() => model.getState().updateSettings({ channels: { ...model.getState().settings.channels, [recipient.key]: 'email' } })} testID={`festival-channel-${recipient.key}-email`} /> : null}
                          <DeliveryTag title="Copy / Share" recipient={recipient.name} selected={channel === 'share'} onPress={() => model.getState().updateSettings({ channels: { ...model.getState().settings.channels, [recipient.key]: 'share' } })} testID={`festival-channel-${recipient.key}-share`} />
                        </View>
                        {channel === 'email' ? (
                          <>
                            <FormToggle
                              disabled={!ready}
                              label="Send automatically"
                              value={state.settings.automatic[recipient.key] ?? false}
                              onValueChange={(value) => model.getState().updateSettings({ automatic: { ...model.getState().settings.automatic, [recipient.key]: value } })}
                              testID={`festival-automatic-${recipient.key}`}
                            />
                            <Text style={[caption, { color: theme.colors.label }]}>{state.settings.automatic[recipient.key] === true ? 'Auto-send' : 'You send at the scheduled time'}</Text>
                          </>
                        ) : (
                          <Text style={[caption, { color: theme.colors.label }]}>{channel === 'messages' ? 'You tap Send at the scheduled time' : 'Manual share only'}</Text>
                        )}
                        <View style={[styles.divider, { backgroundColor: theme.colors.separator }, androidSeparator(theme)]} />
                      </View>
                    );
                  })}
                </MomentCard>
              </CardHeading>
              <Text style={[textStyles.subheadline, { color: theme.colors.label }]}>{`${automaticCount} automatic · ${selected.length - automaticCount} will be sent by you`}</Text>
              {/* Only when someone is set to Email and the account is not connected (:235). */}
              {selected.some((recipient) => recipientChannel(state, recipient) === 'email') && snapshot?.emailAccount?.status !== 'connected' ? (
                <Pressable accessibilityRole="button" onPress={() => router.push('/wellness/moments/settings')} testID="festival-connect-email">
                  <Text style={[textStyles.body, { color: theme.colors.link }]}>Connect / Reconnect email</Text>
                </Pressable>
              ) : null}
              <MomentCard grouped>
                <FormToggle label="Notify me 1 hour before" value={state.notify} onValueChange={(value) => model.getState().setNotify(value)} testID="moment-send-reminder" />
              </MomentCard>
              {connectSection}
              <View style={[styles.info, { backgroundColor: withAlpha(systemColors.blue, 0.08) }]}>
                <Ionicons name="information-circle" size={17} color={theme.colors.label} />
                <Text style={[textStyles.subheadline, styles.grow, { color: theme.colors.label }]}>
                  At the scheduled time, we’ll remind you to send manual wishes. For Messages, open the prepared wish and tap Send. Only email marked automatic sends for you.
                </Text>
              </View>
              {dirty ? <MomentPrimary title="Save Changes" onPress={() => save()} testID="festival-schedule-save" /> : null}
              <MomentPrimary title="Schedule Wish" onPress={scheduleWish} disabled={state.generatingImage} testID="festival-schedule" />
              {planLinks.map((plan) => (
                <Pressable key={plan.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/wellness/moments/wish', params: { planId: plan.id } })} testID={`festival-plan-${plan.id}`}>
                  <Text style={[textStyles.body, { color: theme.colors.link }]}>{`${planStatusLabel(plan)} · ${capitalized(plan.channel)}`}</Text>
                </Pressable>
              ))}
            </>
          ) : null}

          {screenBusy ? (
            <View style={styles.progress}>
              <ActivityIndicator />
              <Secondary>Saving…</Secondary>
            </View>
          ) : null}
          {/* The Message tab shows its errors next to Save Message; Schedule shows no notices (:116-117). */}
          {state.tab !== 'Message' && state.error ? <ErrorText testID="festival-error">{state.error}</ErrorText> : null}
          {state.tab !== 'Schedule' && state.notice ? (
            <Text style={[textStyles.subheadline, { color: theme.colors.secondaryLabel }]} testID="festival-notice">
              {state.notice}
            </Text>
          ) : null}
        </KeyboardAwareScrollView>
      </View>
      <KeyboardDoneBar testID="festival-keyboard-done" />

      {/* Options menu (:82) */}
      {/* The toolbar `Menu` (ManageFestivalView.swift): a popover from the "…" button, no dimming. */}
      <PopoverMenu
        items={[
          {
            key: 'settings',
            title: type === 'festival' ? 'Festival settings' : 'Moment settings',
            onPress: () => {
              Keyboard.dismiss();
              router.push('/wellness/moments/settings');
            },
            testID: 'festival-settings-menu',
          },
          { key: 'delete', title: 'Delete Moment', destructive: true, onPress: () => confirmDelete(), testID: 'festival-delete-menu' },
        ]}
        menu={optionsMenu}
      />

      {/* `contactSelection` (:217) */}
      <MomentSheet
        visible={contactChoices.length > 0}
        title="Choose delivery address"
        onRequestClose={() => setContactChoices([])}
        right={{ title: 'Cancel', onPress: () => setContactChoices([]), testID: 'address-cancel' }}
        testID="address-sheet"
      >
        <FormScroll>
          {contactChoices[0] ? (
            <FormSection header={contactChoices[0].name}>
              <FormRow>
                <Text style={[textStyles.body, { color: theme.colors.label }]}>Choose the address to use.</Text>
              </FormRow>
              <FormRow>
                <MenuPicker label="Phone" options={[{ value: '', title: 'None' }, ...contactChoices[0].phones.map((phone) => ({ value: phone, title: phone }))]} value={choicePhone} onChange={setChoicePhone} testID="address-phone" />
              </FormRow>
              <FormRow>
                <MenuPicker label="Email" options={[{ value: '', title: 'None' }, ...contactChoices[0].emails.map((email) => ({ value: email, title: email }))]} value={choiceEmail} onChange={setChoiceEmail} testID="address-email" />
              </FormRow>
              <FormRow last>
                <FormButton title="Add selected recipient" onPress={() => void addSelectedRecipient()} disabled={choicePhone === '' && choiceEmail === ''} testID="address-add" />
              </FormRow>
            </FormSection>
          ) : null}
        </FormScroll>
      </MomentSheet>

      <RecipientSheet
        request={recipientSheet}
        others={recipientSheet ? state.recipients.filter((recipient) => !(recipientSheet.mode === 'edit' && recipient.key === recipientSheet.draft.key)) : []}
        onCancel={() => setRecipientSheet(null)}
        onSubmit={submitRecipient}
      />

      <ManualRecipientSheet
        visible={manual}
        onCancel={() => setManual(false)}
        onSave={(recipient) => {
          const current = model.getState();
          current.setRecipients([...current.recipients, recipient]);
          current.updateSettings({ channels: { ...current.settings.channels, [recipient.key]: recipient.phone === '' ? 'email' : 'messages' } });
          current.invalidateApproval();
          setManual(false);
        }}
      />

      {/* `personalization` (:216) */}
      <MomentSheet visible={personalize} title="" onRequestClose={() => setPersonalize(false)} right={{ title: 'Done', onPress: () => setPersonalize(false), testID: 'personalize-done' }} testID="personalize-sheet">
        <FormScroll>
          <Text style={[textStyles.largeTitle, styles.bold, styles.sheetTitle, { color: theme.colors.label }]}>Personalize</Text>
          <FormSection header="Shared message">
            <FormRow>
              <Text style={[textStyles.body, { color: theme.colors.label }]}>New recipients inherit the base message.</Text>
            </FormRow>
            <FormRow last>
              <FormField multiline placeholder="Optional personal context" value={state.settings.personalContext} onChangeText={(value) => model.getState().updateSettings({ personalContext: value })} testID="personalize-context" />
            </FormRow>
          </FormSection>
          {selected.map((recipient) => {
            const override = state.settings.overrides[recipient.key];
            return (
              <FormSection key={recipient.key} header={recipient.name}>
                <FormRow last={override === undefined}>
                  <FormToggle
                    label="Personalize this recipient"
                    value={override !== undefined}
                    onValueChange={(value) => {
                      const overrides = { ...model.getState().settings.overrides };
                      if (value) overrides[recipient.key] = model.getState().settings.baseMessage;
                      else delete overrides[recipient.key];
                      model.getState().updateSettings({ overrides });
                      model.getState().invalidateApproval();
                    }}
                    testID={`personalize-${recipient.key}`}
                  />
                </FormRow>
                {override !== undefined ? (
                  <FormRow last>
                    <FormField
                      multiline
                      placeholder="Personal wish"
                      value={override}
                      onChangeText={(value) => {
                        model.getState().updateSettings({ overrides: { ...model.getState().settings.overrides, [recipient.key]: value } });
                        model.getState().invalidateApproval();
                      }}
                      testID={`personalize-wish-${recipient.key}`}
                    />
                  </FormRow>
                ) : null}
              </FormSection>
            );
          })}
        </FormScroll>
        <KeyboardDoneBar />
      </MomentSheet>

      <GreetingCardEditor model={model} visible={imageSheet} onClose={() => setImageSheet(false)} />
      <GreetingCardCapture model={model} />

      <MomentDetailsSheet key={`details-${momentEditorKey}`} model={model} visible={momentEditor} onClose={() => setMomentEditor(false)} />

      {/* `confirmation` → `FestivalScheduleReview` (:272-274, :428-610). The error belongs to the review. */}
      <ScheduleReviewSheet
        key={`review-${reviewKey}`}
        model={model}
        visible={scheduleConfirm}
        onClose={() => {
          setScheduleConfirm(false);
          model.getState().setError(null);
        }}
      />
    </View>
  );
}

/** One recipient row with its `DisclosureGroup("Edit recipient")` (ManageFestivalView.swift:140). */
function RecipientEditor({
  recipient,
  channel,
  onChange,
  onRemove,
  onEdit,
}: {
  recipient: ManagedRecipient;
  channel: string;
  onChange: (patch: Partial<ManagedRecipient>) => void;
  onRemove: () => void;
  /** Android: "Edit recipient" opens the recipient sheet instead of the inline fields. */
  onEdit?: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.recipient} testID={`recipient-${recipient.key}`}>
      <View style={styles.inline}>
        <View style={[styles.initials, { backgroundColor: withAlpha(brand.nexdoIndigo, 0.12) }]}>
          <Text style={[textStyles.title2, styles.bold, { color: theme.colors.label }]}>{recipientInitials(recipient.name)}</Text>
        </View>
        <View style={styles.grow}>
          <Text style={[headline, { color: theme.colors.label }]}>{recipient.name}</Text>
          <Text style={[textStyles.subheadline, { color: theme.colors.secondaryLabel }]}>{maskedAddress(recipient, channel)}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Select ${recipient.name}`}
          accessibilityState={{ selected: recipient.selected }}
          onPress={() => onChange({ selected: !recipient.selected })}
          style={styles.select}
          testID={`recipient-select-${recipient.key}`}
        >
          <Ionicons name={recipient.selected ? 'checkmark-circle' : 'ellipse-outline'} size={26} color={theme.colors.link} />
        </Pressable>
      </View>
      {onEdit ? (
        <View style={styles.recipientActions}>
          <Pressable accessibilityRole="button" onPress={onEdit} hitSlop={6} testID={`recipient-edit-${recipient.key}`}>
            <Text style={[textStyles.body, { color: theme.colors.link }]}>Edit recipient</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onRemove} hitSlop={6} testID={`recipient-remove-${recipient.key}`}>
            <Text style={[textStyles.body, { color: theme.colors.danger }]}>Remove contact</Text>
          </Pressable>
        </View>
      ) : (
      <Disclosure title="Edit recipient" testID={`recipient-edit-${recipient.key}`}>
        <FormField placeholder="Name" value={recipient.name} onChangeText={(name) => onChange({ name })} testID={`recipient-name-${recipient.key}`} />
        <FormField placeholder="Phone" keyboardType="phone-pad" value={recipient.phone} onChangeText={(phone) => onChange({ phone })} testID={`recipient-phone-${recipient.key}`} />
        <FormField placeholder="Email" keyboardType="email-address" autoCapitalize="none" value={recipient.email} onChangeText={(email) => onChange({ email })} testID={`recipient-email-${recipient.key}`} />
        <Pressable accessibilityRole="button" onPress={() => onChange({ contactIdentifier: '' })}>
          <Text style={[textStyles.body, { color: theme.colors.link }]}>Use as manually entered contact</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onRemove} testID={`recipient-remove-${recipient.key}`}>
          <Text style={[textStyles.body, { color: theme.colors.danger }]}>Remove contact</Text>
        </Pressable>
      </Disclosure>
      )}
      <View style={[styles.divider, { backgroundColor: theme.colors.separator }, androidSeparator(theme)]} />
    </View>
  );
}

/**
 * Add Contact: `FestivalManualRecipient` (ManageFestivalView.swift:221-225) in a sheet with a large
 * title and Cancel. "Add recipient" stays disabled until there is a name and a phone or an email.
 */
export function ManualRecipientSheet({ visible, onCancel, onSave }: { visible: boolean; onCancel: () => void; onSave: (recipient: ManagedRecipient) => void }) {
  const theme = useTheme();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  // A fresh `ManagedFestivalRecipient()` every time the sheet opens.
  const reset = () => {
    setName('');
    setPhone('');
    setEmail('');
  };
  const cancel = () => {
    reset();
    onCancel();
  };
  return (
    <MomentSheet visible={visible} title="" onRequestClose={cancel} right={{ title: 'Cancel', onPress: cancel, testID: 'manual-cancel' }} testID="manual-sheet">
      <FormScroll>
        <Text style={[textStyles.largeTitle, styles.bold, styles.sheetTitle, { color: theme.colors.label }]}>Add Contact</Text>
        <FormSection>
          <FormRow>
            <FormField placeholder="Name" value={name} onChangeText={setName} testID="manual-name" />
          </FormRow>
          <FormRow>
            <FormField placeholder="Phone" keyboardType="phone-pad" value={phone} onChangeText={setPhone} testID="manual-phone" />
          </FormRow>
          <FormRow>
            <FormField placeholder="Email" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} testID="manual-email" />
          </FormRow>
          <FormRow last>
            <FormButton
              title="Add recipient"
              disabled={name === '' || (phone === '' && email === '')}
              onPress={() => {
                onSave({ key: Crypto.randomUUID().toUpperCase(), name, phone, email, selected: true, contactIdentifier: '' });
                reset();
              }}
              testID="manual-add"
            />
          </FormRow>
        </FormSection>
      </FormScroll>
    </MomentSheet>
  );
}

/**
 * `deliveryTag(_:channel:recipient:)` (ManageFestivalView.swift:255-270): a channel capsule — filled
 * indigo with a checkmark when chosen, 8% indigo otherwise; at least 44 tall.
 */
function DeliveryTag({ title, recipient, selected, onPress, testID }: { title: string; recipient: string; selected: boolean; onPress: () => void; testID: string }) {
  const theme = useTheme();
  // Dark mode: an unselected tag's label is the `link` token, on that colour at 16% (android-polish.md).
  const idle = theme.scheme === 'dark' ? withAlpha(theme.colors.link, 0.16) : withAlpha(brand.nexdoIndigo, 0.08);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title} for ${recipient}`}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.tag, { backgroundColor: selected ? brand.nexdoIndigo : idle }]}
      testID={testID}
    >
      {selected ? <Ionicons name="checkmark" size={13} color="#FFFFFF" /> : null}
      <Text style={[textStyles.subheadline, styles.semibold, { color: selected ? '#FFFFFF' : theme.colors.link }]}>{title}</Text>
    </Pressable>
  );
}

/**
 * `MomentDetailsSheet` (ManageFestivalView.swift:279-347): Edit Moment, a temporary draft of the name,
 * type, date and Repeat. Save writes the draft into the model and saves; a failure, or a save that would
 * cancel schedules, puts the model back as it was. With schedules, Save asks first ("Save changes to
 * scheduled wishes?"). A catalog-managed festival's date and Repeat are fixed.
 */
/** A fresh draft for each opening (`init(model:)`): the parent re-keys the sheet when it opens. */
function MomentDetailsSheet({ model, visible, onClose }: { model: ManageModel; visible: boolean; onClose: () => void }) {
  const theme = useTheme();
  const state = useStore(model);
  const [title, setTitle] = useState(state.title);
  const [type, setType] = useState(occasionType(state));
  const [date, setDate] = useState(state.date);
  const [yearly, setYearly] = useState(state.yearly);
  const [error, setError] = useState<string | null>(null);
  const changed = title !== state.title || type !== occasionType(state) || date !== state.date || yearly !== state.yearly;
  const fixedDate = state.settings.catalogManaged && type === 'festival';

  const commit = async (cancelSchedules: boolean) => {
    const current = model.getState();
    const old = { title: current.title, type: occasionType(current), date: current.date, yearly: current.yearly, sendDate: current.sendDate, settings: current.settings };
    const restore = () => model.setState({ title: old.title, type: old.type, date: old.date, yearly: old.yearly, sendDate: old.sendDate, settings: old.settings });
    current.setTitle(title);
    current.setType(type);
    current.setDate(date);
    current.setYearly(yearly);
    if (type !== 'festival') current.updateSettings({ catalogManaged: false });
    await model.getState().save(cancelSchedules);
    const after = model.getState();
    if (after.error !== null) {
      setError(after.error);
      restore();
    } else if (after.needsScheduleConfirmation) {
      after.setNeedsScheduleConfirmation(false);
      restore();
      confirm();
    } else onClose();
  };
  const confirm = () =>
    Alert.alert('Save changes to scheduled wishes?', 'Saving these changes cancels existing schedules. Review and schedule the updated wishes again.', [
      { text: 'Keep schedules', style: 'cancel' },
      { text: 'Cancel schedules and save', onPress: () => void commit(true) },
    ]);
  const save = () => {
    Keyboard.dismiss();
    if (!changed) onClose();
    else if (hasSchedules(model.getState(), momentsStore.getState())) confirm();
    else void commit(false);
  };

  return (
    <MomentSheet
      visible={visible}
      title="Edit Moment"
      onRequestClose={() => !state.busy && onClose()}
      left={{ title: 'Cancel', onPress: onClose, disabled: state.busy, testID: 'moment-edit-cancel' }}
      right={{ title: 'Save', onPress: save, bold: true, disabled: state.busy || title.trim() === '' || characterCount(title) > 150, testID: 'moment-edit-save' }}
      testID="moment-edit-sheet"
    >
      <FormScroll>
        <FormSection header="Moment">
          <FormRow>
            <FormField placeholder="Moment name" value={title} onChangeText={setTitle} testID="festival-name" />
          </FormRow>
          <FormRow>
            <MenuPicker label="Type" options={MOMENT_TYPES.filter((value) => value !== 'custom').map((value) => ({ value, title: typeLabel(value) }))} value={type} onChange={setType} testID="moment-edit-type" />
          </FormRow>
          <FormRow>
            <DateField label="Moment date" value={date} onChange={setDate} zone={state.zone} disabled={fixedDate} testID="moment-edit-date" />
          </FormRow>
          <FormRow>
            <FormToggle label="Repeat every year" value={yearly} onValueChange={setYearly} disabled={fixedDate} testID="moment-edit-repeat" />
          </FormRow>
          <FormRow last>
            <Text style={[caption, { color: theme.colors.secondaryLabel }]}>Review and schedule each wish separately. Repeating a moment does not automatically send future wishes.</Text>
          </FormRow>
        </FormSection>
        {error ? <ErrorText testID="moment-edit-error">{error}</ErrorText> : null}
      </FormScroll>
      <KeyboardDoneBar testID="moment-edit-keyboard-done" />
    </MomentSheet>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: 18, gap: 20, paddingBottom: 60 },
  androidCardSection: { gap: ANDROID_LABEL_GAP },
  centered: { alignItems: 'center' },
  stretch: { alignSelf: 'stretch' },
  center: { textAlign: 'center' },
  bold: { fontWeight: '700' },
  grow: { flex: 1 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  identityText: { flex: 1, gap: 8 },
  activeColumn: { alignItems: 'center', gap: 2 },
  tabs: { flexDirection: 'row', gap: 3, padding: 5, borderRadius: 22 },
  // `.frame(minHeight: 44).padding(.vertical, 5)`: 54 in all, as RN's minHeight includes padding.
  tab: { flex: 1, minHeight: 54, paddingVertical: 5, borderRadius: 18, justifyContent: 'center' },
  tabLabel: { textAlign: 'center', alignSelf: 'stretch' },
  // Android: sized by `SegmentRow`, so no `flex: 1` share of the row.
  androidTab: { minHeight: 54, paddingVertical: 5, borderRadius: 18, justifyContent: 'center' },
  nameInput: { flex: 1, textAlign: 'right', fontSize: 17, fontWeight: '700', paddingVertical: 0, includeFontPadding: false, backgroundColor: 'transparent' },
  divider: { height: StyleSheet.hairlineWidth },
  deleteButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 48, borderRadius: 18, backgroundColor: 'rgba(255, 59, 48, 0.08)' },
  centerButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  plainButton: { minHeight: 44, justifyContent: 'center' },
  editor: { minHeight: 130, fontSize: 17, backgroundColor: 'transparent' },
  counter: { textAlign: 'right' },
  // The current draft stays readable, dimmed, until the new one replaces it.
  writing: { opacity: 0.5 },
  deliveryRow: { gap: 6 },
  initialsSmall: { padding: 10, borderRadius: 999, minWidth: 40, alignItems: 'center' },
  initials: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  select: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  recipient: { gap: 10 },
  info: { flexDirection: 'row', gap: 8, padding: 16, borderRadius: 14 },
  // The note and its Retry read as one line; the note wraps and Retry stays beside it.
  cardNote: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // Just under the sheet's bar (FormScroll's top padding is 3 since UI-parity pass 2).
  sheetTitle: { marginHorizontal: 16, marginTop: 4 },
  recipientActions: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8 },
  confirm: { padding: 16, gap: 18, paddingBottom: 60 },
  semibold: { fontWeight: '600' },
  momentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  editMoment: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44 },
  // `ViewThatFits`: one row of capsules, wrapping when they do not fit.
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 8 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 14, borderRadius: 999 },
});

