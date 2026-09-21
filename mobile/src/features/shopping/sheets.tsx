import Ionicons from '@expo/vector-icons/Ionicons';
import * as Crypto from 'expo-crypto';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { shareUrl, type GroceryList } from '../../api/shopping';
import { withAlpha } from '../../components/SignInBackdrop';
import { Text } from '../../components/Text';
import { TodayBackdrop } from '../../components/TodayShell';
import { brand, textStyles, useTheme } from '../../theme';
import { headline, KeyboardDoneBar, MomentCard, MomentPrimary, MomentSheet } from '../moments/components';
import { deviceZone, momentDate, momentDay } from '../moments/dates';
import { DateField, FormButton, FormField, FormRow, FormScroll, FormSection, FormText, FormToggle } from '../moments/form';
import { ListTile, type ListSymbol } from './components';
import { shareMessage } from './device';
import { copiedItems, listInput, previousList, shareText } from './model';
import { shoppingStore, useShopping } from './store';

const bodyText = { fontSize: 17, lineHeight: 22 };

// ---------------------------------------------------------------------------------------------
// New List (ios/App/ShoppingViews.swift:143-205)

/**
 * `NewShoppingList`: Start from Scratch or Use Last Week's List, the name, the date and weekly repeat,
 * and "Create List" pinned at the bottom. Also "Copy list" / "Use This List Again", with `source`.
 * Save is disabled while the name is empty — the capture `shopping-new-list-error-empty-name`.
 */
export function NewListSheet({ visible, source, onCreated, onClose }: { visible: boolean; source?: GroceryList | null; onCreated: (list: GroceryList) => void; onClose: () => void }) {
  return (
    <MomentSheet visible={visible} title="New List" onRequestClose={onClose} left={{ title: 'Cancel', onPress: onClose, testID: 'new-list-cancel' }} testID="new-list-sheet">
      {visible ? <NewListBody source={source ?? null} onCreated={onCreated} onClose={onClose} /> : null}
    </MomentSheet>
  );
}

function NewListBody({ source, onCreated, onClose }: { source: GroceryList | null; onCreated: (list: GroceryList) => void; onClose: () => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const lists = useShopping((state) => state.lists);
  const busy = useShopping((state) => state.busy);
  const error = useShopping((state) => state.error);
  // `.onAppear { if let source { title = source.title; useLast = true } }`
  const [title, setTitle] = useState(source?.title ?? 'Weekly Shopping List');
  const [date, setDate] = useState(() => momentDate(momentDay(Date.now(), deviceZone()), deviceZone()));
  const [weekly, setWeekly] = useState(true);
  const [useLast, setUseLast] = useState(source !== null);
  // `@State private var createKey = UUID().uuidString` (ShoppingViews.swift:152): one key per
  // presentation of this sheet, so a retried Create List replays the same write rather than
  // creating a second list. Swift drops the key by dismissing; a new one is minted after a
  // success here for the same effect.
  const [createKey, setCreateKey] = useState(() => Crypto.randomUUID());
  const previous = previousList(lists, source);
  const disabled = busy || title.trim() === '';

  const create = async () => {
    const zone = deviceZone();
    const value: GroceryList = {
      id: Crypto.randomUUID().toUpperCase(),
      title: title.trim(),
      date: momentDay(date, zone),
      timeZone: zone,
      weekly,
      revision: 0,
      items: useLast ? copiedItems(previous) : [],
    };
    const saved = await shoppingStore.getState().action('create', null, listInput(value), createKey);
    if (saved) {
      setCreateKey(Crypto.randomUUID());
      onCreated(saved);
      onClose();
    }
  };

  return (
    <View style={styles.fill}>
      <TodayBackdrop />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <Choice title="Start from Scratch" subtitle="Create a brand new list." icon="doc.badge.plus" selected={!useLast} onPress={() => setUseLast(false)} testID="shopping-scratch" />
        <Choice
          title="Use Last Week’s List"
          subtitle={previous ? `Copy ${previous.items.length} items from “${previous.title}” and edit.` : 'Create your first list to reuse it next time.'}
          icon="arrow.counterclockwise"
          selected={useLast}
          disabled={!previous}
          onPress={() => setUseLast(true)}
          testID="shopping-use-last"
        />
        <Text style={[headline, styles.sectionTitle, { color: theme.colors.label }]}>List Name</Text>
        <MomentCard>
          <TextInput
            accessibilityLabel="List name"
            onChangeText={setTitle}
            placeholder="List name"
            placeholderTextColor={theme.colors.placeholder}
            style={[headline, styles.input, { color: theme.colors.label }]}
            testID="shopping-list-name"
            value={title}
          />
          <View style={[styles.divider, { backgroundColor: theme.colors.separator }]} />
          <DateField label="Shopping date" value={date} onChange={setDate} zone={deviceZone()} testID="shopping-list-date" />
          <View style={[styles.divider, { backgroundColor: theme.colors.separator }]} />
          <FormToggle label="Repeat every week" value={weekly} onValueChange={setWeekly} testID="shopping-list-weekly" />
          <Text style={[styles.caption, { color: theme.colors.secondary }]}>Complete a trip to copy all items into next week’s list, with every item unchecked.</Text>
        </MomentCard>
        {error ? <Text style={[bodyText, { color: theme.colors.danger }]}>{error}</Text> : null}
      </ScrollView>
      {/* `.safeAreaInset(edge: .bottom) { MomentPrimary … .padding(18).background(.ultraThinMaterial) }` */}
      <View style={[styles.footer, { paddingBottom: 18 + insets.bottom, backgroundColor: theme.colors.glassFill }]}>
        <MomentPrimary title={busy ? 'Creating…' : 'Create List'} onPress={() => void create()} disabled={disabled} testID="shopping-create" />
      </View>
      <KeyboardDoneBar />
    </View>
  );
}

function Choice({ title, subtitle, icon, selected, disabled = false, onPress, testID }: { title: string; subtitle: string; icon: ListSymbol; selected: boolean; disabled?: boolean; onPress: () => void; testID: string }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.choice, { opacity: disabled ? 0.5 : 1, backgroundColor: selected ? withAlpha(brand.nexdoIndigo, 0.09) : 'transparent' }]}
      testID={testID}
    >
      {/* `.overlay(… .stroke(lineWidth: 1.5))` draws over the card and takes no layout space. */}
      {selected ? <View pointerEvents="none" style={[styles.choiceStroke, { borderColor: brand.nexdoIndigo }]} /> : null}
      <MomentCard>
        <View style={styles.choiceRow}>
          <ListTile icon={icon} color={brand.nexdoIndigo} />
          <View style={styles.grow}>
            <Text style={[headline, { color: theme.colors.ink }]}>{title}</Text>
            <Text style={[textStyles.subheadline, { color: theme.colors.secondary }]}>{subtitle}</Text>
          </View>
          <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={brand.nexdoIndigo} />
        </View>
      </MomentCard>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------------------------
// List Settings (ShoppingViews.swift:305-315)

/** `ShoppingSettings`: name, date, weekly. Save only — no Cancel — and disabled while the name is empty. */
export function ListSettingsSheet({ visible, list, onSave, onClose }: { visible: boolean; list: GroceryList; onSave: (list: GroceryList) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(list);
  const [shown, setShown] = useState(visible);
  // A fresh copy of the list each time the sheet opens, as Swift's `@State var initial` is.
  if (shown !== visible) {
    setShown(visible);
    if (visible) setDraft(list);
  }
  const disabled = draft.title.trim() === '';
  return (
    <MomentSheet
      visible={visible}
      title=""
      onRequestClose={onClose}
      right={{
        title: 'Save',
        disabled,
        bold: true,
        onPress: () => {
          onSave(draft);
          onClose();
        },
        testID: 'list-settings-save',
      }}
      testID="list-settings-sheet"
    >
      <ListSettingsBody draft={draft} setDraft={setDraft} />
    </MomentSheet>
  );
}

function ListSettingsBody({ draft, setDraft }: { draft: GroceryList; setDraft: (list: GroceryList) => void }) {
  const theme = useTheme();
  return (
    <FormScroll testID="list-settings">
      <Text style={[textStyles.largeTitle, styles.bold, styles.sheetTitle, { color: theme.colors.label }]}>List Settings</Text>
      <FormSection>
        <FormRow>
          <FormField placeholder="List name" value={draft.title} onChangeText={(title) => setDraft({ ...draft, title })} testID="list-settings-name" />
        </FormRow>
        <FormRow>
          <DateField
            label="Shopping date"
            value={momentDate(draft.date, draft.timeZone)}
            onChange={(value) => setDraft({ ...draft, date: momentDay(value, draft.timeZone) })}
            zone={draft.timeZone}
            testID="list-settings-date"
          />
        </FormRow>
        <FormRow>
          <FormToggle label="Repeat weekly" value={draft.weekly} onValueChange={(weekly) => setDraft({ ...draft, weekly })} testID="list-settings-weekly" />
        </FormRow>
        <FormRow last>
          <FormText>Next week’s list is created when you complete this trip.</FormText>
        </FormRow>
      </FormSection>
    </FormScroll>
  );
}

// ---------------------------------------------------------------------------------------------
// Share List (ShoppingViews.swift:316-332)

/**
 * `ShoppingShare`: the list as plain text through the share sheet, and the view-only link —
 * `<API base URL>/shared/shopping/<token>` — created and revoked on the server.
 */
export function ShareListSheet({ visible, list, onUpdate, onClose }: { visible: boolean; list: GroceryList; onUpdate: (list: GroceryList) => void; onClose: () => void }) {
  return (
    <MomentSheet visible={visible} title="" onRequestClose={onClose} testID="share-list-sheet">
      {visible ? <ShareListBody initial={list} onUpdate={onUpdate} /> : null}
    </MomentSheet>
  );
}

function ShareListBody({ initial, onUpdate }: { initial: GroceryList; onUpdate: (list: GroceryList) => void }) {
  const theme = useTheme();
  const error = useShopping((state) => state.error);
  const [list, setList] = useState(initial);
  // `.task { updateURL() }`
  const [url, setUrl] = useState<string | null>(() => (initial.shareToken ? shareUrl(initial.shareToken) : null));

  const create = async () => {
    const saved = await shoppingStore.getState().action('share', list, {});
    if (saved) {
      setList(saved);
      onUpdate(saved);
      if (saved.shareToken) setUrl(shareUrl(saved.shareToken));
    }
  };
  const revoke = async () => {
    const saved = await shoppingStore.getState().action('revoke', list, {});
    if (saved) {
      setList(saved);
      setUrl(null);
      onUpdate(saved);
    }
  };

  return (
    <FormScroll testID="share-list">
      <Text style={[textStyles.largeTitle, styles.bold, styles.sheetTitle, { color: theme.colors.label }]}>Share List</Text>
      <FormSection>
        <FormRow>
          <View style={styles.inline}>
            <Ionicons name="cart" size={20} color={brand.nexdoIndigo} />
            <FormText>{list.title}</FormText>
          </View>
        </FormRow>
        <FormRow last>
          <FormText>{`${list.items.length} items`}</FormText>
        </FormRow>
      </FormSection>
      <FormSection header="Share via Messages, Mail, or another app">
        <FormRow last>
          <FormButton icon="share-outline" title="Share list as text" onPress={() => void shareMessage(shareText(list))} testID="share-text" />
        </FormRow>
      </FormSection>
      <FormSection header="View-only link">
        <FormRow>
          <FormText caption>Anyone with the link can view this list and its edits. The link stays with this trip; next week’s list needs a new link. Revoke it whenever you like.</FormText>
        </FormRow>
        {url ? (
          <>
            <FormRow>
              <FormButton icon="link" title="Share Link" onPress={() => void shareMessage(url)} testID="share-link" />
            </FormRow>
            <FormRow last>
              <FormButton destructive title="Revoke Link" onPress={() => void revoke()} testID="share-revoke" />
            </FormRow>
          </>
        ) : (
          <FormRow last>
            <FormButton title="Create Share Link" onPress={() => void create()} testID="share-create" />
          </FormRow>
        )}
      </FormSection>
      {error ? (
        <View style={styles.error}>
          <FormText tone="danger">{error}</FormText>
        </View>
      ) : null}
    </FormScroll>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: 18, gap: 18, paddingBottom: 140 },
  sectionTitle: { marginTop: 10 },
  input: { paddingVertical: 4, backgroundColor: 'transparent' },
  divider: { height: StyleSheet.hairlineWidth },
  caption: { fontSize: 12, lineHeight: 16 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 18, paddingTop: 18 },
  choice: { borderRadius: 22 },
  choiceStroke: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 22, borderWidth: 1.5, zIndex: 1 },
  choiceRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  grow: { flex: 1 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bold: { fontWeight: '700' },
  // Just under the sheet's bar (FormScroll's top padding is 3 since UI-parity pass 2).
  sheetTitle: { marginHorizontal: 16, marginTop: 4 },
  error: { marginHorizontal: 32, marginTop: 12 },
});
