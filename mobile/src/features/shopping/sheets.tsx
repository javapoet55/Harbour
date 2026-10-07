import Ionicons from '@expo/vector-icons/Ionicons';
import * as Crypto from 'expo-crypto';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { shareUrl, type GroceryList } from '../../api/shopping';
import { KeyboardAwareScrollView, KeyboardLift } from '../../components/keyboard';
import { withAlpha } from '../../components/SignInBackdrop';
import { Text } from '../../components/Text';
import { TodayBackdrop } from '../../components/TodayShell';
import { androidField, androidLabel, androidSeparator, brand, FieldGroupContext, isAndroid, textStyles, useTheme } from '../../theme';
import { headline, KEYBOARD_DONE_BAR_HEIGHT, KeyboardDoneBar, MomentCard, MomentPrimary, MomentSheet } from '../moments/components';
import { deviceZone, momentDate, momentDay } from '../moments/dates';
import { DateField, FormButton, FormRow, FormScroll, FormSection, FormText, FormToggle } from '../moments/form';
import { ListTile, type ListSymbol } from './components';
import { shareMessage } from './device';
import { copiedItems, itemCount, listInput, previousList, shareText } from './model';
import { shoppingStore, useShopping } from './store';

const bodyText = { fontSize: 17, lineHeight: 22 };

// ---------------------------------------------------------------------------------------------
// New List (ios/App/ShoppingViews.swift:142-205)

/**
 * `NewShoppingList`: Start from Scratch or Use Last Week's List, the name, the date and weekly repeat,
 * and "Create List & Add Store" pinned at the bottom — the new list then opens on List Settings to add
 * its store. "Copy list" / "Use This List Again" pass a `source` and read "Create List".
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
  const [title, setTitle] = useState(source?.title ?? 'Shopping List');
  const [date, setDate] = useState(() => momentDate(momentDay(Date.now(), deviceZone()), deviceZone()));
  const [weekly, setWeekly] = useState(true);
  const [useLast, setUseLast] = useState(source !== null);
  // `@State private var createKey = UUID().uuidString` (ShoppingViews.swift:152): one key per
  // presentation of this sheet, so a retried Create List replays the same write rather than
  // creating a second list. Swift drops the key by dismissing; a new one is minted after a
  // success here for the same effect.
  const [createKey, setCreateKey] = useState(() => Crypto.randomUUID());
  const [footerHeight, setFooterHeight] = useState(0);
  // Android: the name field's accent border while it has focus (docs/android-polish.md §4).
  const [nameFocused, setNameFocused] = useState(false);
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
      {/* On Android the name field has to clear the "Done" capsule AND the Create List footer riding on it. */}
      <KeyboardAwareScrollView bottomOffset={KEYBOARD_DONE_BAR_HEIGHT + footerHeight} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <Choice title="Start from Scratch" subtitle="Create a brand new list." icon="doc.badge.plus" selected={!useLast} onPress={() => setUseLast(false)} testID="shopping-scratch" />
        <Choice
          title="Use Last Week’s List"
          subtitle={previous ? `Copy ${itemCount(previous.items.length)} from “${previous.title}” and edit.` : 'Create your first list to reuse it next time.'}
          icon="arrow.counterclockwise"
          selected={useLast}
          disabled={!previous}
          onPress={() => setUseLast(true)}
          testID="shopping-use-last"
        />
        {/* Android (docs/android-polish.md §4): "List Name" is the shared field label, 8 above its card;
            the name is a raised field on the card, and the date pill takes the same surface. */}
        <ListNameSection>
          <Text style={[headline, styles.sectionTitle, { color: theme.colors.label }, androidLabel(theme), isAndroid() && styles.androidLabel]}>List Name</Text>
          <MomentCard>
            <FieldGroupContext.Provider value={isAndroid() ? 'card' : null}>
              <TextInput
                accessibilityLabel="List name"
                onChangeText={setTitle}
                onFocus={() => setNameFocused(true)}
                onBlur={() => setNameFocused(false)}
                placeholder="List name"
                placeholderTextColor={theme.colors.placeholder}
                style={[headline, styles.input, { color: theme.colors.label }, androidField(theme, nameFocused, { raised: true })]}
                testID="shopping-list-name"
                value={title}
              />
              <View style={[styles.divider, { backgroundColor: theme.colors.separator }, androidSeparator(theme)]} />
              <DateField label="Shopping date" value={date} onChange={setDate} zone={deviceZone()} testID="shopping-list-date" />
              <View style={[styles.divider, { backgroundColor: theme.colors.separator }, androidSeparator(theme)]} />
              <FormToggle label="Repeat every week" value={weekly} onValueChange={setWeekly} testID="shopping-list-weekly" />
              <Text style={[styles.caption, { color: theme.colors.secondary }]}>Complete a trip to copy all items into next week’s list, with every item unchecked.</Text>
            </FieldGroupContext.Provider>
          </MomentCard>
        </ListNameSection>
        {error ? <Text style={[bodyText, { color: theme.colors.danger }]}>{error}</Text> : null}
      </KeyboardAwareScrollView>
      {/* `.safeAreaInset(edge: .bottom) { MomentPrimary … .padding(18).background(.ultraThinMaterial) }` */}
      <KeyboardLift
        aboveKeyboard={KEYBOARD_DONE_BAR_HEIGHT}
        onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}
        style={[styles.footer, { paddingBottom: 18 + insets.bottom, backgroundColor: theme.colors.glassFill }]}
      >
        <MomentPrimary title={busy ? 'Creating…' : source === null ? 'Create List & Add Store' : 'Create List'} onPress={() => void create()} disabled={disabled} testID="shopping-create" />
      </KeyboardLift>
      <KeyboardDoneBar />
    </View>
  );
}

/** iOS: the label and card stay siblings in the content's 18 gap. Android: the pair, 8 apart. */
function ListNameSection({ children }: { children: ReactNode }) {
  return isAndroid() ? <View style={styles.androidSection}>{children}</View> : <>{children}</>;
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
          <ListTile icon={icon} color={theme.colors.link} />
          <View style={styles.grow}>
            <Text style={[headline, { color: theme.colors.ink }]}>{title}</Text>
            <Text style={[textStyles.subheadline, { color: theme.colors.secondary }]}>{subtitle}</Text>
          </View>
          <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={theme.colors.link} />
        </View>
      </MomentCard>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------------------------
// Share List (ShoppingViews.swift:790-829)

/**
 * `ShoppingShare`: the list as plain text through the share sheet, "Weekly email to store manager"
 * (Scheduled sharing), and the view-only link — the compact `/s/<token>` — created and revoked on the
 * server. Swift pushes the weekly email inside this sheet; here the sheet closes and the email screen
 * is pushed on the list.
 */
export function ShareListSheet({ visible, list, onUpdate, onClose, onWeeklyEmail }: { visible: boolean; list: GroceryList; onUpdate: (list: GroceryList) => void; onClose: () => void; onWeeklyEmail: () => void }) {
  return (
    // Android ahead of iOS (iOS 6e17c47): a Done button, a way out besides swiping the sheet down.
    <MomentSheet visible={visible} title="" onRequestClose={onClose} right={{ title: 'Done', onPress: onClose, bold: true, testID: 'shopping-share-done' }} testID="share-list-sheet">
      {visible ? <ShareListBody initial={list} onUpdate={onUpdate} onWeeklyEmail={onWeeklyEmail} /> : null}
    </MomentSheet>
  );
}

function ShareListBody({ initial, onUpdate, onWeeklyEmail }: { initial: GroceryList; onUpdate: (list: GroceryList) => void; onWeeklyEmail: () => void }) {
  const theme = useTheme();
  const error = useShopping((state) => state.error);
  const busy = useShopping((state) => state.busy);
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
            <Ionicons name="cart" size={20} color={theme.colors.link} />
            <FormText>{list.title}</FormText>
          </View>
        </FormRow>
        <FormRow last>
          <FormText>{itemCount(list.items.length)}</FormText>
        </FormRow>
      </FormSection>
      <FormSection header="Share via Messages, Mail, or another app">
        <FormRow last>
          <FormButton icon="share-outline" title="Share list as text" onPress={() => void shareMessage(shareText(list))} testID="share-text" />
        </FormRow>
      </FormSection>
      <FormSection header="Scheduled sharing">
        <FormRow last>
          <Pressable accessibilityRole="button" onPress={onWeeklyEmail} style={styles.link} testID="share-weekly-email">
            <FormText>Weekly email to store manager</FormText>
            <Ionicons color={theme.colors.secondaryLabel} name="chevron-forward" size={17} />
          </Pressable>
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
              <FormButton destructive disabled={busy} title="Revoke Link" onPress={() => void revoke()} testID="share-revoke" />
            </FormRow>
          </>
        ) : (
          <FormRow last>
            <FormButton disabled={busy} title="Create Share Link" onPress={() => void create()} testID="share-create" />
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
  // Android: 18 + 2 = 20 above the label, 8 from the label to its card.
  androidSection: { gap: 8, marginTop: 2 },
  androidLabel: { marginTop: 0 },
  input: { paddingVertical: 4, backgroundColor: 'transparent' },
  divider: { height: StyleSheet.hairlineWidth },
  caption: { fontSize: 12, lineHeight: 16 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 18, paddingTop: 18 },
  choice: { borderRadius: 22 },
  choiceStroke: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 22, borderWidth: 1.5, zIndex: 1 },
  choiceRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  grow: { flex: 1 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  link: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 32 },
  bold: { fontWeight: '700' },
  // Just under the sheet's bar (FormScroll's top padding is 3 since UI-parity pass 2).
  sheetTitle: { marginHorizontal: 16, marginTop: 4 },
  error: { marginHorizontal: 32, marginTop: 12 },
});
