import Ionicons from '@expo/vector-icons/Ionicons';
import * as Crypto from 'expo-crypto';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, Keyboard, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import type { GroceryItem, GroceryList } from '../../../../src/api/shopping';
import { KeyboardAwareScrollView } from '../../../../src/components/keyboard';
import { withAlpha } from '../../../../src/components/SignInBackdrop';
import { Text } from '../../../../src/components/Text';
import { TodayBackdrop } from '../../../../src/components/TodayShell';
import { ShoppingAlternativesSheet } from '../../../../src/features/shopping/AlternativesSheet';
import { ShoppingRecommendationsSheet } from '../../../../src/features/shopping/RecommendationsSheet';
import { CategoryChip, GroceryRow, grocerySeparatorInset, ShoppingActionBar, ShoppingIcon, SwipeToDelete } from '../../../../src/features/shopping/components';
import { completionSummary, ShoppingCompletionView, type ShoppingCompletionSummary } from '../../../../src/features/shopping/CompletionView';
import { ItemEditorSheet } from '../../../../src/features/shopping/ItemEditorSheet';
import { appended, CATEGORIES, itemCount, listInput, remaining, removed, suggestionsFor, toggled, uncheckedAll, upserted } from '../../../../src/features/shopping/model';
import { ListSettingsSheet, NewListSheet, ShareListSheet } from '../../../../src/features/shopping/sheets';
import { shoppingStore, useShopping } from '../../../../src/features/shopping/store';
import { VoiceSheet } from '../../../../src/features/shopping/VoiceSheet';
import { brand, textStyles, useTheme } from '../../../../src/theme';

/** `quickAdd()`'s message when the server finds nothing to add (ShoppingViews.swift:382). */
export const NO_ITEMS_FOUND = 'No items found. Type an item and try again.';

/**
 * `ShoppingDetail` (ios/App/ShoppingViews.swift:207-400), as redesigned by e13730b and 987a90e.
 *
 * Every change is applied to the screen at once and then saved with the list's revision. A save the
 * server refuses (409 when the list changed on another device) keeps the local edits and offers
 * "Retry Save" and "Discard local edits and reload". A completed list is NOT read-only any more: the
 * rows stay live (`:274`), and saving it creates a new list instead (`:365-373`).
 *
 * Top to bottom: the header "N added · M items" (`:233-234`), the quick-add bar (`:235-256`) with its
 * suggestions (`:257-260`), the category chips (`:261-269`), one item section with swipe-to-delete
 * (`:271-278`), the empty state and the save error (`:279-280`), and the pinned action bar (`:284`,
 * `:312-331`). Typed items go straight onto the list — there is no Review Items step (`:374-387`).
 */
export default function ShoppingDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [list, setList] = useState<GroceryList | null>(() => shoppingStore.getState().lists.find((item) => item.id === id) ?? null);
  const busy = useShopping((state) => state.busy);
  const storeError = useShopping((state) => state.error);
  const [quick, setQuick] = useState('');
  const [item, setItem] = useState<GroceryItem | null>(null);
  const [voice, setVoice] = useState(false);
  const [copy, setCopy] = useState(false);
  const [settings, setSettings] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [completion, setCompletion] = useState<ShoppingCompletionSummary | null>(null);
  const [recommendations, setRecommendations] = useState(false);
  const [alternativesFor, setAlternativesFor] = useState<GroceryItem | null>(null);
  const [parseBusy, setParseBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [menu, setMenu] = useState(false);
  const [barHeight, setBarHeight] = useState(72);
  const quickField = useRef<TextInput>(null);

  if (!list) return null;
  const readOnly = list.completedAt != null;
  const left = remaining(list);
  const visibleCategories = CATEGORIES.filter((category) => list.items.some((row) => row.category === category));
  const visibleItems = selectedCategory === 'All' ? list.items : list.items.filter((row) => row.category === selectedCategory);

  /**
   * `save(_:)` (:365-373): show the change, then save it against the ORIGINAL revision — or, for a
   * completed list, create a new list from it (new id, `completedAt` cleared, revision 0).
   */
  const save = async (next: GroceryList) => {
    const original = list;
    setList(next);
    let saved: GroceryList | null;
    if (original.completedAt != null) {
      const working: GroceryList = { ...next, id: Crypto.randomUUID().toUpperCase(), completedAt: null, revision: 0 };
      saved = await shoppingStore.getState().action('create', null, listInput(working), working.id);
    } else saved = await shoppingStore.getState().action('save', original, listInput(next));
    if (saved) {
      setList(saved);
      setError(null);
    }
  };

  /** `quickAdd()` (:374-387): the server parses; what it finds is appended straight to the list. */
  const quickAdd = async (text: string = quick) => {
    const value = text.trim();
    if (value === '') return;
    setParseBusy(true);
    setError(null);
    try {
      const items = (await shoppingStore.getState().parse(value)).filter((row) => row.name.trim() !== '');
      if (items.length === 0) {
        setError(NO_ITEMS_FOUND);
        return;
      }
      setQuick('');
      void save(appended(list, items));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setParseBusy(false);
    }
  };

  /** `delete(_:)` (:343): a chip whose last item goes falls back to All. */
  const deleteRow = (row: GroceryItem) => {
    const next = removed(list, row.id);
    if (selectedCategory !== 'All' && !next.items.some((value) => value.category === selectedCategory)) setSelectedCategory('All');
    void save(next);
  };

  /** `completeTrip()` (:353-364). */
  const completeTrip = async () => {
    const finished = list;
    const next = await shoppingStore.getState().action('complete', finished, {});
    if (!next) return;
    setList(next);
    setCompletion(completionSummary(finished, next));
  };

  /** Complete Shopping (:314): asks first only when something is still unchecked (:308-310). */
  const onComplete = () => {
    if (left === 0) {
      void completeTrip();
      return;
    }
    Alert.alert(`Complete with ${itemCount(left)} remaining?`, 'The unchecked items will remain in your shopping history.', [
      { text: 'Complete Shopping', onPress: () => void completeTrip() },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const confirmDelete = () =>
    Alert.alert('Delete this list?', undefined, [
      {
        text: 'Delete list',
        style: 'destructive',
        onPress: () => {
          void shoppingStore
            .getState()
            .action('delete', list, {})
            .then(() => {
              if (shoppingStore.getState().error === null) router.back();
            });
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);

  const reload = async () => {
    await shoppingStore.getState().refresh();
    const current = shoppingStore.getState().lists.find((value) => value.id === list.id);
    if (current) {
      setList(current);
      setError(null);
    }
  };

  const message = error ?? storeError;
  /** The options `Menu` (:287-292). Edit and reorder are gone. */
  const menuItems: { title: string; onPress: () => void; disabled?: boolean; destructive?: boolean; testID: string }[] = [
    { title: 'List settings', onPress: () => setSettings(true), disabled: readOnly, testID: 'list-menu-settings' },
    { title: 'Copy list', onPress: () => setCopy(true), testID: 'list-menu-copy' },
    ...(readOnly ? [] : [{ title: 'Uncheck all', onPress: () => void save(uncheckedAll(list)), testID: 'list-menu-uncheck' }]),
    { title: 'Delete list', onPress: confirmDelete, destructive: true, testID: 'list-menu-delete' },
  ];

  const suggestions = suggestionsFor(quick);

  return (
    <View style={styles.fill}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={styles.toolbar}>
              <Pressable accessibilityRole="button" accessibilityLabel="Share list" onPress={() => setSharing(true)} hitSlop={8} testID="list-share">
                <Ionicons name="share-outline" size={22} color={theme.colors.link} />
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="List options" onPress={() => setMenu(true)} hitSlop={8} testID="list-options">
                <Ionicons name="ellipsis-horizontal" size={22} color={theme.colors.link} />
              </Pressable>
            </View>
          ),
        }}
      />
      <TodayBackdrop />
      {/* `.disabled(store.busy)` (:283) covers the list; the action bar disables its own buttons. */}
      <View style={styles.fill} pointerEvents={busy ? 'none' : 'auto'}>
        {/* On Android the action bar rides up on the keyboard, so the focused field has to clear it too. */}
        <KeyboardAwareScrollView bottomOffset={barHeight} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: barHeight + 16 }} testID="shopping-detail">
          {/* Header (:233-234). */}
          <View style={styles.header}>
            <ShoppingIcon />
            <View style={styles.grow}>
              <Text style={[textStyles.title2, styles.bold, { color: theme.colors.label }]}>{list.title}</Text>
              <Text style={[textStyles.body, { color: theme.colors.secondaryLabel }]} testID="list-counts">{`${list.items.length - left} added · ${itemCount(list.items.length)}`}</Text>
            </View>
          </View>

          {/* Quick-add bar (:235-256): global pattern 15, the raised input card. */}
          <View style={[styles.quickBar, { backgroundColor: theme.colors.surface, borderColor: withAlpha(brand.nexdoIndigo, 0.1), shadowColor: theme.colors.ink }]} testID="quick-add-bar">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={quick === '' ? 'Focus add item field' : 'Add typed items'}
              accessibilityState={{ disabled: parseBusy }}
              disabled={parseBusy}
              onPress={() => (quick.trim() === '' ? quickField.current?.focus() : void quickAdd())}
              style={[styles.plus, { backgroundColor: withAlpha(brand.nexdoBlue, 0.11) }]}
              testID="quick-add-plus"
            >
              <Ionicons name="add" size={22} color={brand.nexdoBlue} />
            </Pressable>
            {/* Android (docs/android-polish.md §6): the placeholder wrapped to a second line and was
                clipped. The field is held to one line, and since Android cannot ellipsise a
                TextInput placeholder, the same text is drawn as a one-line overlay that ends in "…". */}
            <View style={styles.quickFieldWrap}>
              <TextInput
                ref={quickField}
                accessibilityLabel="Add an item (e.g. eggs, milk, bread)"
                numberOfLines={Platform.OS === 'android' ? 1 : undefined}
                onChangeText={setQuick}
                onSubmitEditing={() => void quickAdd()}
                placeholder={Platform.OS === 'android' ? undefined : 'Add an item (e.g. eggs, milk, bread)'}
                placeholderTextColor={theme.colors.placeholder}
                returnKeyType="done"
                style={[styles.quickField, { color: theme.colors.ink }, Platform.OS === 'android' && styles.androidQuickField]}
                testID="shopping-quick-add"
                value={quick}
              />
              {Platform.OS === 'android' && quick === '' ? (
                <Text
                  accessible={false}
                  ellipsizeMode="tail"
                  numberOfLines={1}
                  pointerEvents="none"
                  style={[styles.quickPlaceholder, { color: theme.colors.placeholder }]}
                  testID="shopping-quick-add-placeholder"
                >
                  Add an item (e.g. eggs, milk, bread)
                </Text>
              ) : null}
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Add groceries by voice" onPress={() => setVoice(true)} style={styles.mic} testID="quick-add-mic">
              <Ionicons name="mic" size={20} color={theme.colors.secondary} />
            </Pressable>
          </View>

          {/* Suggestions (:257-260): rows of the same section, so the card's top edge is square. */}
          {suggestions.length > 0 ? (
            <View style={[styles.suggestions, { backgroundColor: theme.colors.surface }]} testID="quick-add-suggestions">
              {suggestions.map((name, index) => (
                <Pressable
                  key={name}
                  accessibilityRole="button"
                  onPress={() => {
                    // `quick = name; quickAdd()`
                    setQuick(name);
                    void quickAdd(name);
                  }}
                  style={styles.suggestion}
                  testID={`suggestion-${name}`}
                >
                  <Text style={[textStyles.subheadline, { color: theme.colors.link }]}>{name}</Text>
                  {index < suggestions.length - 1 ? <View style={[styles.separator, { left: 16, backgroundColor: theme.colors.listSeparator }]} /> : null}
                </Pressable>
              ))}
            </View>
          ) : null}

          {/* Category chips (:261-269): global pattern 14. */}
          {list.items.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips} contentContainerStyle={styles.chipsContent} testID="category-chips">
              <CategoryChip category="All" count={list.items.length} selected={selectedCategory === 'All'} onPress={() => setSelectedCategory('All')} />
              {visibleCategories.map((category) => (
                <CategoryChip
                  key={category}
                  category={category}
                  count={list.items.filter((row) => row.category === category).length}
                  selected={selectedCategory === category}
                  onPress={() => setSelectedCategory(category)}
                />
              ))}
            </ScrollView>
          ) : null}

          {/* The items, one section (:271-278). */}
          {list.items.length > 0 ? (
            <View style={[styles.card, styles.itemsCard, { backgroundColor: theme.colors.surface }]} testID="grocery-list">
              {visibleItems.map((row, index) => (
                <SwipeToDelete key={row.id} onDelete={() => deleteRow(row)} testID={`grocery-row-${row.id}`}>
                  <View style={styles.itemRow}>
                    <GroceryRow row={row} onToggle={() => void save(toggled(list, row.id))} onEdit={() => setItem(row)} onAlternatives={() => setAlternativesFor(row)} />
                  </View>
                  {index < visibleItems.length - 1 ? (
                    <View style={[styles.separator, { left: grocerySeparatorInset(row), backgroundColor: theme.colors.listSeparator }]} testID={`grocery-separator-${row.id}`} />
                  ) : null}
                </SwipeToDelete>
              ))}
            </View>
          ) : (
            // `ContentUnavailableView` (:279).
            <View style={[styles.card, styles.empty, { backgroundColor: theme.colors.surface }]} testID="list-empty">
              <Ionicons name="basket-outline" size={56} color={theme.colors.secondaryLabel} />
              <Text style={[styles.emptyTitle, { color: theme.colors.label }]}>Nothing on the list yet</Text>
              <Text style={[textStyles.body, styles.center, { color: theme.colors.secondaryLabel }]}>Add items above or dictate a few groceries.</Text>
            </View>
          )}

          {/* The save error and its two ways out (:280). */}
          {message ? (
            <View style={[styles.card, styles.errorCard, { backgroundColor: theme.colors.surface }]} testID="list-error-card">
              <View style={styles.errorRow}>
                <Text style={[textStyles.body, { color: theme.colors.danger }]} testID="list-error">
                  {message}
                </Text>
                <View style={[styles.separator, { left: 16, backgroundColor: theme.colors.listSeparator }]} />
              </View>
              <Pressable accessibilityRole="button" accessibilityState={{ disabled: readOnly }} disabled={readOnly} onPress={() => void save(list)} style={styles.errorRow} testID="list-retry">
                <Text style={[textStyles.body, { color: readOnly ? theme.colors.placeholder : theme.colors.link }]}>Retry Save</Text>
                <View style={[styles.separator, { left: 16, backgroundColor: theme.colors.listSeparator }]} />
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => void reload()} style={styles.errorRow} testID="list-reload">
                <Text style={[textStyles.body, { color: theme.colors.link }]}>Discard local edits and reload</Text>
              </Pressable>
            </View>
          ) : null}
        </KeyboardAwareScrollView>
      </View>

      <ShoppingActionBar busy={busy} onComplete={onComplete} onRecommendations={() => setRecommendations(true)} onHeight={setBarHeight} />

      {/* The options `Menu` (:287-292). */}
      <Modal animationType="fade" transparent visible={menu} onRequestClose={() => setMenu(false)}>
        <Pressable style={styles.menuScrim} onPress={() => setMenu(false)}>
          <View style={[styles.menu, { backgroundColor: theme.colors.surface }]}>
            {menuItems.map((entry) => (
              <Pressable
                key={entry.testID}
                accessibilityRole="button"
                accessibilityState={{ disabled: entry.disabled ?? false }}
                disabled={entry.disabled}
                onPress={() => {
                  setMenu(false);
                  Keyboard.dismiss();
                  entry.onPress();
                }}
                style={styles.menuRow}
                testID={entry.testID}
              >
                <Text style={[textStyles.body, { color: entry.destructive ? theme.colors.danger : entry.disabled ? theme.colors.placeholder : theme.colors.label }]}>{entry.title}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      <ItemEditorSheet item={item} onSave={(updated) => void save(upserted(list, updated))} onClose={() => setItem(null)} />
      <VoiceSheet visible={voice} onAdd={(items) => void save(appended(list, items))} onClose={() => setVoice(false)} />
      <NewListSheet visible={copy} source={list} onCreated={setList} onClose={() => setCopy(false)} />
      <ListSettingsSheet visible={settings} list={list} onSave={(next) => void save(next)} onClose={() => setSettings(false)} />
      <ShareListSheet visible={sharing} list={list} onUpdate={setList} onClose={() => setSharing(false)} />
      <ShoppingRecommendationsSheet list={list} visible={recommendations} onClose={() => setRecommendations(false)} />
      <ShoppingAlternativesSheet list={list} original={alternativesFor} save={save} onClose={() => setAlternativesFor(null)} />
      <ShoppingCompletionView
        summary={completion}
        onDone={() => {
          setCompletion(null);
          router.back();
        }}
        onUseAgain={() => {
          setCompletion(null);
          if (list.completedAt != null) setCopy(true);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flex: 1 },
  bold: { fontWeight: '700' },
  center: { textAlign: 'center' },
  // The List row insets put the header and the bar 16 inside a 16 pt section margin.
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 32, paddingTop: 20, paddingBottom: 3 },
  // `.padding(.horizontal, 10).padding(.vertical, 6).frame(minHeight: 54)`, radius 18, 1 pt stroke,
  // `.shadow(color: nexdoInk.opacity(0.07), radius: 8, y: 3)`.
  quickBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 32,
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minHeight: 54,
    borderRadius: 18,
    borderWidth: 1,
    shadowOpacity: 0.07,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  plus: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  // `.font(.subheadline)`
  // `flex: 1` is on `quickFieldWrap`, which now holds the field in the row.
  quickField: { fontSize: 15, paddingVertical: 4, backgroundColor: 'transparent' },
  // Holds the field and, on Android, its one-line placeholder overlay.
  quickFieldWrap: { flex: 1, justifyContent: 'center' },
  // Android's EditText pads its text by default; zero it so the overlay sits exactly on the text.
  androidQuickField: { paddingHorizontal: 0 },
  quickPlaceholder: { position: 'absolute', left: 0, right: 0, fontSize: 15 },
  mic: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  suggestions: { marginHorizontal: 16, marginTop: 5, borderBottomLeftRadius: 26, borderBottomRightRadius: 26, overflow: 'hidden' },
  suggestion: { minHeight: 56, paddingHorizontal: 16, justifyContent: 'center' },
  // `.listRowInsets(top: 4, leading: 16, bottom: 2, trailing: 0)` inside the section, `.padding(.vertical, 2)`.
  chips: { marginLeft: 32, marginRight: 16, marginTop: 14 },
  chipsContent: { gap: 8, paddingVertical: 2 },
  card: { marginHorizontal: 16, borderRadius: 26, overflow: 'hidden' },
  itemsCard: { marginTop: 19 },
  // The row's own List insets: 18 leading, 16 trailing, and 15 above and below the 54 pt content.
  itemRow: { paddingLeft: 18, paddingRight: 16, paddingVertical: 15 },
  separator: { position: 'absolute', right: 16, bottom: 0, height: StyleSheet.hairlineWidth * 2 },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 30, paddingHorizontal: 40, marginTop: 15 },
  // `ContentUnavailableView`'s title: `.title2.bold()`.
  emptyTitle: { fontSize: 22, lineHeight: 28, fontWeight: '700', marginTop: 8 },
  errorCard: { marginTop: 20 },
  errorRow: { minHeight: 52, paddingHorizontal: 16, paddingVertical: 12, justifyContent: 'center' },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  menuScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.2)', alignItems: 'flex-end', paddingTop: 90, paddingRight: 16 },
  menu: { borderRadius: 14, minWidth: 220, paddingVertical: 4 },
  menuRow: { minHeight: 48, paddingHorizontal: 16, justifyContent: 'center' },
});
