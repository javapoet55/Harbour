import * as Crypto from 'expo-crypto';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, View } from 'react-native';

import type { ImportantMoment, MomentInput } from '../../api/moments';
import { ownerKeyFor } from '../../actions/persistence';
import { GlassCapsule } from '../../components/PushedHeader';
import { Text } from '../../components/Text';
import { isAndroid, textStyles, useTheme } from '../../theme';
import { KeyboardDoneBar } from './components';
import { deviceZone, momentDate, momentDay } from './dates';
import { contactChoice, contactFullName, festivalRecipient, pickContact, type FestivalRecipient } from './device';
import {
  contactLinkFor,
  defaultChannel,
  defaultTitle,
  editableGroups,
  editedContactLink,
  firstNameOf,
  maskedAddress,
  MOMENT_TYPES,
  newFestivalSettings,
  newMomentInput,
  normalizedPhone,
  RECIPIENTS_REQUIRED,
  supportsGreetingCard,
  typeLabel,
  updatingTitle,
  type MomentDisplayGroup,
  type RecipientDraft,
} from './domain';
import { DateField, FormButton, FormField, FormRow, FormScroll, FormSection, FormText, FormToggle, MenuPicker, ZonePicker } from './form';
import { MomentGreetingCardSection } from './MomentGreetingCardSection';
import { ManageMomentView } from './ManageMomentView';
import { RecipientSheet, type RecipientSheetRequest } from './RecipientSheet';
import { momentsStore, useMomentList, useMoments } from './store';

/**
 * `MomentEditor` (ios/App/MomentEditor.swift:5-171): Create Moment and Edit Moment.
 *
 * - February 29 is observed on February 28 in non-leap years; the note says so under the date.
 * - An imported item with no date must be confirmed before it can be saved.
 * - A new moment starts with NO recipient (`0de30b9`).
 * - After a birthday, anniversary, festival or Get Well Soon moment is first saved, its Manage Moment
 *   replaces the editor in place (`:25-29`), found among the editable groups so an archived match can
 *   never be opened instead (`4078f17`, `d3ed4f0`).
 *
 * `onDone` is the editor's own `onDone`: "Create New" and "Add Moment" pass one that returns to the
 * list; every other entry point has none, so Done dismisses (`if let onDone … else { dismiss() }`).
 *
 * ANDROID, creating a moment: a Recipients list replaces the single recipient. "Choose from Contacts"
 * and "Enter recipient manually" open the same sheet (RecipientSheet.tsx); at least one person is
 * required. Save creates the moment for the first person, then saves everyone through `festivalSave`
 * — the grouped-recipients model Manage Moment edits — so Contacts opens with all of them selected.
 * A custom moment has no Manage Moment, so it is saved once per person instead. iOS, and editing an
 * existing moment, keep the single-recipient form.
 */
/**
 * The current time, for the past-date note (MomentEditor.swift:43-45). Reading `Date.now()` in render
 * is impure (react-hooks/purity), so it is held in state: taken on mount and refreshed each minute,
 * so "today" still rolls over at midnight while the editor stays open.
 */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(tick);
  }, []);
  return now;
}

export function MomentEditorView({ moment, imported, onDone, dismiss }: { moment?: ImportantMoment; imported?: MomentInput; onDone?: () => void; dismiss: () => void }) {
  const theme = useTheme();
  const moments = useMomentList();
  const busy = useMoments((state) => state.busy);
  const error = useMoments((state) => state.error);
  // `.onAppear` (:129-138), as the initial state.
  const [initial] = useState(() => {
    let next = newMomentInput(Crypto.randomUUID().toUpperCase(), deviceZone());
    let confirmed = true;
    if (moment) {
      next = {
        type: moment.type,
        title: moment.title,
        firstName: moment.firstName,
        phone: moment.phone,
        email: moment.email,
        yearly: moment.yearly,
        timeZoneID: moment.timeZoneID,
        source: moment.source,
        sourceKey: moment.sourceKey,
        occurrenceDate: moment.occurrenceDate,
      };
    } else if (imported) {
      next = { ...imported };
      confirmed = imported.occurrenceDate !== '';
    }
    if (!moment && next.title.trim() === '') next.title = defaultTitle(next.type, next.firstName) ?? '';
    const day = next.occurrenceDate !== '' ? momentDate(next.occurrenceDate, next.timeZoneID) : Date.now();
    return { input: next, confirmed, day };
  });
  const [input, setInput] = useState<MomentInput>(initial.input);
  const [date, setDate] = useState(initial.day);
  const [dateConfirmed, setDateConfirmed] = useState(initial.confirmed);
  const [festivalRecipients, setFestivalRecipients] = useState<FestivalRecipient[]>([]);
  const [savedRecipientIDs, setSavedRecipientIDs] = useState<string[]>([]);
  const [createdID, setCreatedID] = useState<string | null>(null);
  const [completedSave, setCompletedSave] = useState(false);
  const [savedGroup, setSavedGroup] = useState<MomentDisplayGroup | null>(null);
  const [leaving, setLeaving] = useState(false);
  const now = useNow();
  // Android, creating: the Recipients list, the sheet, and one group ID kept across a retried Save.
  const multi = isAndroid() && !moment;
  const [recipients, setRecipients] = useState<RecipientDraft[]>([]);
  const [sheet, setSheet] = useState<(RecipientSheetRequest & { contact: { id: string; phones: string[]; emails: string[] } | null }) | null>(null);
  const [groupID] = useState(() => Crypto.randomUUID().toUpperCase());

  const saveDisabled = busy || !dateConfirmed || input.title.trim() === '' || (multi && recipients.length === 0);
  const locked = completedSave || savedRecipientIDs.length > 0;
  const festival = input.type === 'festival';

  const setType = (type: string) =>
    setInput((current) => ({
      ...current,
      title: updatingTitle(current.title, current.type, current.firstName, type, current.firstName),
      type,
      yearly: type === 'getWellSoon' ? false : current.yearly,
    }));

  // `.onChange(of: input.firstName)` (:99-101)
  const setFirstName = (firstName: string) =>
    setInput((current) => ({ ...current, firstName, title: updatingTitle(current.title, current.type, current.firstName, current.type, firstName) }));

  /** The Recipients list's first person names the moment ("Kate’s Birthday"), as the First name field did. */
  const changeRecipients = (next: RecipientDraft[]) => {
    setRecipients(next);
    setFirstName(firstNameOf(next[0]?.name ?? ''));
  };

  const submitRecipient = (draft: RecipientDraft) => {
    if (!sheet) return;
    // A person picked from Contacts stays linked only while their phone and email are ones that contact
    // has; an address typed in by hand makes them a manually entered recipient.
    const linked: RecipientDraft = { ...draft, contactIdentifier: sheet.contact ? contactLinkFor(draft, sheet.contact) : editedContactLink(sheet.draft, draft) };
    changeRecipients(sheet.mode === 'add' ? [...recipients, linked] : recipients.map((item) => (item.key === draft.key ? linked : item)));
    setSheet(null);
  };

  const chooseRecipient = async () => {
    Keyboard.dismiss();
    try {
      const contact = await pickContact();
      if (!contact) return;
      if (multi) {
        const choice = contactChoice(contact);
        // The same person may be added twice with different addresses; each row still needs its own key.
        const key = await ownerKeyFor(contact.id);
        setSheet({
          mode: 'add',
          draft: {
            key: recipients.some((item) => item.key === key) ? Crypto.randomUUID().toUpperCase() : key,
            name: contactFullName(contact) || contact.firstName || '',
            phone: choice.phones[0] ?? '',
            email: choice.emails[0] ?? '',
            contactIdentifier: contact.id,
          },
          choices: { phones: choice.phones, emails: choice.emails },
          contact: { id: contact.id, phones: choice.phones, emails: choice.emails },
        });
        return;
      }
      if (festival) {
        const recipient = await festivalRecipient(contact);
        setFestivalRecipients((current) => (current.some((item) => item.id === recipient.id) ? current : [...current, recipient]));
      } else {
        // Selecting a recipient must not change the occasion or its schedule.
        setFirstName(contact.firstName ?? '');
        setInput((current) => ({ ...current, phone: contact.phoneNumbers?.[0]?.number ?? '', email: contact.emails?.[0]?.email ?? '' }));
      }
    } catch (caught) {
      momentsStore.getState().setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  const save = () => {
    if (saveDisabled) return;
    Keyboard.dismiss();
    const value: MomentInput = { ...input, occurrenceDate: momentDay(date, input.timeZoneID) };
    setInput(value);
    void momentsStore.getState().perform(async () => {
      const store = momentsStore.getState();
      let created = createdID;
      if (!completedSave && multi) {
        created = await saveRecipients(value);
      } else if (!completedSave) {
        if (value.type === 'festival' && festivalRecipients.length > 0) {
          const saved = [...savedRecipientIDs];
          for (const [index, recipient] of festivalRecipients.entries()) {
            if (saved.includes(recipient.id)) continue;
            const item: MomentInput = {
              ...value,
              firstName: recipient.firstName,
              phone: recipient.phone,
              email: recipient.email,
              source: 'manual',
              sourceKey: `festival:${await ownerKeyFor(`${value.sourceKey}:${recipient.id}`)}`,
            };
            const id = await store.save(item, index === 0 ? moment?.id : undefined);
            if (created === null) {
              created = id;
              setCreatedID(id);
            }
            saved.push(recipient.id);
            setSavedRecipientIDs([...saved]);
          }
        } else {
          created = await store.save(value, moment?.id);
          setCreatedID(created);
        }
      }
      if (!completedSave) {
        const group = editableGroups(momentsStore.getState().snapshot?.moments ?? []).find((entry) => entry.moments.some((item) => item.id === created));
        setSavedGroup(group ?? null);
        setCompletedSave(true);
      }
      if (moment || value.type === 'custom') {
        setLeaving(true);
        dismiss();
      }
      // perform refreshes the snapshot; the body then shows the saved moment's four-tab manager.
    });
  };

  /**
   * Android's Save for the Recipients list. The first person's moment is created with `save`; then one
   * `festivalSave` stores everyone — each with their own phone, email and default channel (Messages
   * when there is a phone, Email when there is only an email), their contact link, and selected — so
   * Manage Moment → Contacts opens with all of them. A retry after a failed `festivalSave` reuses the
   * moment already created and the same group, so nothing is duplicated.
   */
  const saveRecipients = async (value: MomentInput): Promise<string> => {
    const store = momentsStore.getState();
    const [first] = recipients;
    const person = (item: RecipientDraft) => ({ firstName: item.name.trim(), phone: item.phone.trim(), email: item.email.trim() });
    if (value.type === 'custom') {
      // No Manage Moment for a custom moment: one moment per person, like Swift's festival contacts.
      let created = createdID;
      const saved = [...savedRecipientIDs];
      for (const [index, item] of recipients.entries()) {
        if (saved.includes(item.key)) continue;
        const id = await store.save({ ...value, ...person(item), sourceKey: index === 0 ? value.sourceKey : `${value.sourceKey}:${index}` });
        if (created === null) {
          created = id;
          setCreatedID(id);
        }
        saved.push(item.key);
        setSavedRecipientIDs([...saved]);
      }
      return created!;
    }
    let anchor = createdID;
    if (anchor === null) {
      anchor = await store.save({ ...value, ...person(first) });
      setCreatedID(anchor);
    }
    // The first person is the moment just created, so Manage Moment knows them by its ID.
    const keyed = recipients.map((item, index) => ({ ...item, key: index === 0 ? anchor! : item.key }));
    const settings = newFestivalSettings(groupID);
    for (const item of keyed) {
      settings.channels[item.key] = defaultChannel(item);
      settings.contactIDs[item.key] = item.contactIdentifier;
      settings.selected[item.key] = true;
    }
    await store.request('festivalSave', {
      ids: [anchor],
      title: value.title,
      date: value.occurrenceDate,
      timeZoneID: value.timeZoneID,
      yearly: value.yearly,
      active: true,
      recipients: keyed.map((item, index) => ({
        ...(index === 0 ? { id: anchor } : {}),
        key: item.key,
        name: item.name.trim(),
        phone: normalizedPhone(item.phone.trim()),
        email: item.email.trim(),
        selected: true,
      })),
      settings,
      cancelSchedules: false,
    });
    // Find the saved group only once every person is in the list.
    await momentsStore.getState().refresh();
    return anchor;
  };

  const liveGroup = createdID ? (savedGroup ?? editableGroups(moments).find((entry) => entry.moments.some((item) => item.id === createdID))) : undefined;
  if (completedSave && liveGroup && !leaving) {
    return <ManageMomentView group={liveGroup} onDone={onDone ?? dismiss} />;
  }

  const current = moment ? (moments.find((item) => item.id === moment.id) ?? moment) : undefined;
  return (
    <View style={styles.fill}>
      <Stack.Screen
        options={{
          title: moment ? 'Edit Moment' : 'Create Moment',
          headerRight: () => (
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: saveDisabled }} disabled={saveDisabled} onPress={save} hitSlop={6} testID="moment-save-top">
              <GlassCapsule>
                <Text style={{ fontSize: 17, lineHeight: 22, color: saveDisabled ? theme.colors.placeholder : theme.colors.link }}>Save</Text>
              </GlassCapsule>
            </Pressable>
          ),
        }}
      />
      <View style={styles.fill} pointerEvents={busy ? 'none' : 'auto'}>
        <FormScroll testID="moment-editor">
          <FormSection header="Important moment" disabled={locked}>
            <FormRow>
              <MenuPicker label="Type" options={MOMENT_TYPES.map((type) => ({ value: type, title: typeLabel(type) }))} value={input.type} onChange={setType} testID="moment-type" />
            </FormRow>
            <FormRow>
              <FormField placeholder="Title" value={input.title} onChangeText={(title) => setInput((value) => ({ ...value, title }))} testID="moment-title" />
            </FormRow>
            <FormRow>
              {/* No lower bound: Swift's editor accepts a past date. */}
              <DateField label="Date" value={date} onChange={setDate} zone={input.timeZoneID} testID="moment-date" />
            </FormRow>
            {momentDay(date, input.timeZoneID) < momentDay(now, input.timeZoneID) ? (
              <FormRow>
                {/* MomentEditor.swift:43-45 */}
                <FormText caption testID="moment-past-date">
                  {input.yearly
                    ? 'The original date is kept; the next yearly occurrence appears in Moments.'
                    : 'This date is in the past. You can save it, but choose a future time before scheduling delivery.'}
                </FormText>
              </FormRow>
            ) : null}
            <FormRow>
              <ZonePicker value={input.timeZoneID} onChange={(timeZoneID) => setInput((value) => ({ ...value, timeZoneID }))} testID="moment-zone" />
            </FormRow>
            {!dateConfirmed ? (
              <FormRow>
                <FormToggle label="I have confirmed the event date" value={dateConfirmed} onValueChange={setDateConfirmed} testID="moment-date-confirmed" />
              </FormRow>
            ) : null}
            <FormRow>
              <FormToggle label="Repeat yearly" value={input.yearly} onValueChange={(yearly) => setInput((value) => ({ ...value, yearly }))} testID="moment-yearly" />
            </FormRow>
            <FormRow last>
              <FormText caption>February 29 is observed on February 28 in non-leap years. Dates for festivals with moving calendars must be confirmed each year.</FormText>
            </FormRow>
          </FormSection>

          {multi ? (
            <FormSection header="Recipients" disabled={completedSave || savedRecipientIDs.length > 0}>
              <FormRow>
                <FormButton icon="person-add-outline" title="Choose from Contacts" onPress={() => void chooseRecipient()} testID="moment-choose-contact" />
              </FormRow>
              <FormRow>
                <FormButton
                  icon="create-outline"
                  title="Enter recipient manually"
                  onPress={() => {
                    Keyboard.dismiss();
                    setSheet({ mode: 'add', draft: { key: Crypto.randomUUID().toUpperCase(), name: '', phone: '', email: '', contactIdentifier: '' }, choices: null, contact: null });
                  }}
                  testID="moment-enter-recipient"
                />
              </FormRow>
              {recipients.map((item, index) => (
                <FormRow key={item.key}>
                  <View style={styles.inline} testID={`moment-recipient-${index}`}>
                    <View style={styles.grow}>
                      <Text style={[textStyles.body, styles.bold, { color: theme.colors.label }]}>{item.name}</Text>
                      {item.phone !== '' ? <Text style={[textStyles.subheadline, { color: theme.colors.secondaryLabel }]}>{maskedAddress(item, 'messages')}</Text> : null}
                      {item.email !== '' ? <Text style={[textStyles.subheadline, { color: theme.colors.secondaryLabel }]}>{maskedAddress(item, 'email')}</Text> : null}
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Edit ${item.name}`}
                      hitSlop={8}
                      onPress={() => {
                        Keyboard.dismiss();
                        setSheet({ mode: 'edit', draft: item, choices: null, contact: null });
                      }}
                      testID={`moment-recipient-edit-${index}`}
                    >
                      <Text style={[textStyles.body, { color: theme.colors.link }]}>Edit</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${item.name}`}
                      hitSlop={8}
                      onPress={() => changeRecipients(recipients.filter((other) => other.key !== item.key))}
                      testID={`moment-recipient-remove-${index}`}
                    >
                      <Text style={[textStyles.body, { color: theme.colors.danger }]}>Remove</Text>
                    </Pressable>
                  </View>
                </FormRow>
              ))}
              <FormRow last>
                <FormText caption testID="moment-recipients-note">
                  {recipients.length === 0
                    ? RECIPIENTS_REQUIRED
                    : 'Only the recipients and occasion you confirm here are saved to your Nexdo account. Your address book is never uploaded.'}
                </FormText>
              </FormRow>
            </FormSection>
          ) : (
          <FormSection header={festival ? 'Recipients' : 'Recipient'} disabled={locked}>
            <FormRow>
              <FormButton icon="person-add-outline" title={festival ? 'Choose multiple contacts' : 'Choose from Contacts'} onPress={() => void chooseRecipient()} testID="moment-choose-contact" />
            </FormRow>
            {festival && festivalRecipients.length > 0 ? (
              <>
                <FormRow>
                  <Text style={[textStyles.subheadline, { color: theme.colors.label }]}>{`${festivalRecipients.length} contacts selected`}</Text>
                </FormRow>
                {festivalRecipients.map((recipient) => (
                  <FormRow key={recipient.id}>
                    <View style={styles.inline}>
                      <Text style={[textStyles.body, styles.bold, styles.grow, { color: theme.colors.label }]}>{recipient.displayName}</Text>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${recipient.displayName}`}
                        onPress={() => setFestivalRecipients((list) => list.filter((item) => item.id !== recipient.id))}
                      >
                        <Text style={[textStyles.title3, { color: theme.colors.danger }]}>⊖</Text>
                      </Pressable>
                    </View>
                    <FormField placeholder="First name" value={recipient.firstName} onChangeText={(firstName) => setFestivalRecipients((list) => list.map((item) => (item.id === recipient.id ? { ...item, firstName } : item)))} />
                    <FormField placeholder="Phone (optional)" keyboardType="phone-pad" value={recipient.phone} onChangeText={(phone) => setFestivalRecipients((list) => list.map((item) => (item.id === recipient.id ? { ...item, phone } : item)))} />
                    <FormField
                      placeholder="Email (optional)"
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      value={recipient.email}
                      onChangeText={(email) => setFestivalRecipients((list) => list.map((item) => (item.id === recipient.id ? { ...item, email } : item)))}
                    />
                  </FormRow>
                ))}
                <FormRow>
                  <FormText caption>A separate festival moment is saved for each person. Review and approve each wish before sending.</FormText>
                </FormRow>
              </>
            ) : (
              <>
                <FormRow>
                  <FormField placeholder="First name" value={input.firstName} onChangeText={setFirstName} testID="moment-first-name" />
                </FormRow>
                <FormRow>
                  <FormField placeholder="Phone (optional)" keyboardType="phone-pad" value={input.phone} onChangeText={(phone) => setInput((value) => ({ ...value, phone }))} testID="moment-phone" />
                </FormRow>
                <FormRow>
                  <FormField
                    placeholder="Email (optional)"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={input.email}
                    onChangeText={(email) => setInput((value) => ({ ...value, email }))}
                    testID="moment-email"
                  />
                </FormRow>
              </>
            )}
            <FormRow last>
              <FormText caption>Only the recipient and occasion you confirm here are saved to your Nexdo account. Your address book is never uploaded.</FormText>
            </FormRow>
          </FormSection>
          )}

          {completedSave ? (
            <View style={styles.note}>
              <FormText caption testID="moment-saved-note">
                Your moment is saved. Reload to open its details.
              </FormText>
            </View>
          ) : savedRecipientIDs.length > 0 ? (
            <View style={styles.note}>
              <FormText caption>{`${savedRecipientIDs.length} recipients saved. Tap Save again to retry the remaining recipients.`}</FormText>
            </View>
          ) : null}

          {current ? (
            <FormSection>
              <FormRow last>
                <FormToggle
                  label="Show reminders"
                  value={current.enabled}
                  onValueChange={(enabled) => void momentsStore.getState().perform(() => momentsStore.getState().visibility(current, enabled))}
                  testID="moment-show-reminders"
                />
              </FormRow>
            </FormSection>
          ) : null}
          {current && supportsGreetingCard(current) ? (
            <FormSection header="Greeting Card">
              <FormRow last>
                <MomentGreetingCardSection moment={current} />
              </FormRow>
            </FormSection>
          ) : null}
          {error ? (
            <View style={styles.note}>
              <FormText tone="danger" testID="moment-error">
                {error}
              </FormText>
            </View>
          ) : null}
          <FormSection>
            <FormRow last>
              <FormButton
                title={completedSave ? 'Open Saved Moment' : !multi && festival && festivalRecipients.length > 0 ? `Save for ${festivalRecipients.length} contacts` : 'Save Moment'}
                onPress={save}
                disabled={saveDisabled}
                testID="moment-save"
              />
            </FormRow>
          </FormSection>
        </FormScroll>
      </View>
      <KeyboardDoneBar testID="moment-keyboard-done" />
      {multi ? (
        <RecipientSheet
          request={sheet}
          others={sheet ? recipients.filter((item) => !(sheet.mode === 'edit' && item.key === sheet.draft.key)) : []}
          onCancel={() => setSheet(null)}
          onSubmit={submitRecipient}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  grow: { flex: 1 },
  bold: { fontWeight: '600' },
  note: { marginHorizontal: 32, marginTop: 12 },
});
