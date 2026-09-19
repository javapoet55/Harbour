import Ionicons from '@expo/vector-icons/Ionicons';
import * as Crypto from 'expo-crypto';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Keyboard, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import type { GroceryItem, GroceryList } from '../../../../src/api/shopping';
import { Text } from '../../../../src/components/Text';
import { TodayBackdrop } from '../../../../src/components/TodayShell';
import { headline } from '../../../../src/features/moments/components';
import { FormRow, FormSection } from '../../../../src/features/moments/form';
import { GroceryRow, ProgressBar, ShoppingIcon } from '../../../../src/features/shopping/components';
import { ItemEditorSheet } from '../../../../src/features/shopping/ItemEditorSheet';
import { appended, CATEGORIES, listInput, moved, newItem, remaining, removed, suggestionsFor, toggled, uncheckedAll, upserted } from '../../../../src/features/shopping/model';
import { ListSettingsSheet, NewListSheet, ReviewItemsSheet, ShareListSheet } from '../../../../src/features/shopping/sheets';
import { shoppingStore, useShopping } from '../../../../src/features/shopping/store';
import { VoiceSheet } from '../../../../src/features/shopping/VoiceSheet';
import { textStyles, useTheme } from '../../../../src/theme';

/**
 * `ShoppingDetail` (ios/App/ShoppingViews.swift:206-295).
 *
 * Every change — a check, an edit, a new item, a reorder — is applied to the screen straight away and
 * then saved with the list's revision. A save the server refuses (409 when the list changed on another
 * device) leaves the local edits on screen with Swift's two ways out: "Retry Save" and "Discard local
 * edits and reload". A completed list is read-only and offers "Use This List Again".
 *
 * SWIFT DEFECT NOT COPIED: in Swift the "+" and the mic sit in one `List` row with no button style, so a
 * tap on the row fires both. Here each has its own target.
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
  const [pending, setPending] = useState<GroceryItem[]>([]);
  const [pendingReview, setPendingReview] = useState(false);
  const [parseBusy, setParseBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);

  if (!list) return null;
  const readOnly = list.completedAt != null;
  const left = remaining(list);

  /** `save(_:)` (:292): show the change, then save it against the ORIGINAL revision. */
  const save = async (next: GroceryList) => {
    const original = list;
    setList(next);
    const saved = await shoppingStore.getState().action('save', original, listInput(next));
    if (saved) {
      setList(saved);
      setError(null);
    }
  };

  /** `quickAdd()` (:293): the server parses; the result opens in Review Items. */
  const quickAdd = async () => {
    if (quick === '') return;
    setParseBusy(true);
    try {
      setPending(await shoppingStore.getState().parse(quick));
      setPendingReview(true);
      setQuick('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
    setParseBusy(false);
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

  const confirmComplete = () =>
    Alert.alert(list.weekly ? 'Complete this trip and create next week’s list?' : 'Complete this shopping trip?', `${left} items are unchecked. Your shopping history will be kept.`, [
      {
        text: 'Complete trip',
        onPress: () => {
          void shoppingStore
            .getState()
            .action('complete', list, {})
            .then((next) => next && setList(next));
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
  const menuItems: { title: string; onPress: () => void; disabled?: boolean; destructive?: boolean; testID: string }[] = [
    { title: 'List settings', onPress: () => setSettings(true), disabled: readOnly, testID: 'list-menu-settings' },
    { title: 'Copy list', onPress: () => setCopy(true), testID: 'list-menu-copy' },
    ...(readOnly
      ? []
      : [
          { title: editing ? 'Done' : 'Edit', onPress: () => setEditing(!editing), testID: 'list-menu-edit' },
          { title: 'Uncheck all', onPress: () => void save(uncheckedAll(list)), testID: 'list-menu-uncheck' },
        ]),
    { title: 'Delete list', onPress: confirmDelete, destructive: true, testID: 'list-menu-delete' },
  ];

  return (
    <View style={styles.fill}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={styles.toolbar}>
              <Pressable accessibilityRole="button" accessibilityLabel="Share list" onPress={() => setSharing(true)} hitSlop={8} testID="list-share">
                <Ionicons name="share-outline" size={22} color={theme.colors.tint} />
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="List options" onPress={() => setMenu(true)} hitSlop={8} testID="list-options">
                <Ionicons name="ellipsis-horizontal" size={22} color={theme.colors.tint} />
              </Pressable>
            </View>
          ),
        }}
      />
      <TodayBackdrop />
      <View style={styles.fill} pointerEvents={busy ? 'none' : 'auto'}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content} testID="shopping-detail">
          <View style={styles.header}>
            <ShoppingIcon />
            <View style={styles.grow}>
              <Text style={[textStyles.title2, styles.bold, { color: theme.colors.label }]}>{list.title}</Text>
              <Text style={[textStyles.body, { color: theme.colors.secondaryLabel }]} testID="list-counts">{`${left} remaining · ${list.items.length} items`}</Text>
            </View>
          </View>
          <FormSection>
            {list.items.length > 0 ? (
              <FormRow last={readOnly}>
                <ProgressBar value={list.items.length - left} total={list.items.length} />
              </FormRow>
            ) : null}
            {!readOnly ? (
              <>
                <FormRow>
                  <View style={styles.inline}>
                    <TextInput
                      accessibilityLabel="Add an item"
                      onChangeText={setQuick}
                      onSubmitEditing={() => void quickAdd()}
                      placeholder="Add an item"
                      placeholderTextColor={theme.colors.placeholder}
                      returnKeyType="done"
                      style={[styles.quick, { color: theme.colors.label }]}
                      testID="quick-add"
                      value={quick}
                    />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Add typed items"
                      accessibilityState={{ disabled: quick === '' || parseBusy }}
                      disabled={quick === '' || parseBusy}
                      onPress={() => void quickAdd()}
                      style={styles.iconButton}
                      testID="quick-add-plus"
                    >
                      <Ionicons name="add-circle" size={22} color={quick === '' || parseBusy ? theme.colors.placeholder : theme.colors.tint} />
                    </Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel="Add groceries by voice" onPress={() => setVoice(true)} style={styles.iconButton} testID="quick-add-mic">
                      <Ionicons name="mic" size={22} color={theme.colors.tint} />
                    </Pressable>
                  </View>
                </FormRow>
                {quick !== ''
                  ? suggestionsFor(quick).map((name, index, all) => (
                      <FormRow key={name} last={index === all.length - 1}>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => {
                            setQuick(name);
                            // `quick = name; quickAdd()` — parse the suggestion itself.
                            setParseBusy(true);
                            void shoppingStore
                              .getState()
                              .parse(name)
                              .then((items) => {
                                setPending(items);
                                setPendingReview(true);
                                setQuick('');
                              })
                              .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : String(caught)))
                              .finally(() => setParseBusy(false));
                          }}
                          testID={`suggestion-${name}`}
                        >
                          <Text style={[textStyles.subheadline, { color: theme.colors.tint }]}>{name}</Text>
                        </Pressable>
                      </FormRow>
                    ))
                  : null}
                {quick === '' ? (
                  <FormRow last>
                    <Text style={[styles.caption, { color: theme.colors.secondaryLabel }]}>Try “2 bottles of milk 1 gallon” or tap the mic.</Text>
                  </FormRow>
                ) : null}
              </>
            ) : null}
          </FormSection>

          {CATEGORIES.map((category) => {
            const rows = list.items.filter((row) => row.category === category);
            if (rows.length === 0) return null;
            return (
              <FormSection key={category} header={category} testID={`category-${category}`}>
                {rows.map((row, index) => (
                  <FormRow key={row.id} last={readOnly && index === rows.length - 1}>
                    <View style={styles.inline}>
                      {editing && !readOnly ? (
                        <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${row.name}`} onPress={() => void save(removed(list, row.id))} hitSlop={6} testID={`grocery-delete-${row.id}`}>
                          <Ionicons name="remove-circle" size={22} color={theme.colors.danger} />
                        </Pressable>
                      ) : null}
                      <View style={styles.grow}>
                        <GroceryRow row={row} readOnly={readOnly} onToggle={() => void save(toggled(list, row.id))} onEdit={() => setItem(row)} />
                      </View>
                      {editing && !readOnly ? (
                        <View style={styles.reorder}>
                          <Pressable accessibilityRole="button" accessibilityLabel={`Move ${row.name} up`} disabled={index === 0} onPress={() => void save(moved(list, category, index, index - 1))} hitSlop={4} testID={`grocery-up-${row.id}`}>
                            <Ionicons name="chevron-up" size={20} color={index === 0 ? theme.colors.placeholder : theme.colors.secondaryLabel} />
                          </Pressable>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Move ${row.name} down`}
                            disabled={index === rows.length - 1}
                            onPress={() => void save(moved(list, category, index, index + 1))}
                            hitSlop={4}
                            testID={`grocery-down-${row.id}`}
                          >
                            <Ionicons name="chevron-down" size={20} color={index === rows.length - 1 ? theme.colors.placeholder : theme.colors.secondaryLabel} />
                          </Pressable>
                        </View>
                      ) : null}
                    </View>
                  </FormRow>
                ))}
                {!readOnly ? (
                  <FormRow last>
                    <Pressable accessibilityRole="button" onPress={() => setItem(newItem(Crypto.randomUUID().toUpperCase(), category))} style={styles.inline} testID={`add-item-${category}`}>
                      <Ionicons name="add" size={22} color={theme.colors.tint} />
                      <Text style={[textStyles.body, { color: theme.colors.tint }]}>Add item</Text>
                    </Pressable>
                  </FormRow>
                ) : null}
              </FormSection>
            );
          })}

          {list.items.length === 0 ? (
            <View style={styles.empty} testID="list-empty">
              <Ionicons name="basket-outline" size={44} color={theme.colors.secondaryLabel} />
              <Text style={[textStyles.title2, styles.bold, { color: theme.colors.label }]}>Nothing on the list yet</Text>
              <Text style={[textStyles.subheadline, styles.center, { color: theme.colors.secondaryLabel }]}>Add items above or dictate a few groceries.</Text>
            </View>
          ) : null}
          <View style={styles.actions}>
            {message ? (
              <>
                <Text style={[textStyles.body, { color: theme.colors.danger }]} testID="list-error">
                  {message}
                </Text>
                <Pressable accessibilityRole="button" disabled={readOnly} onPress={() => void save(list)} testID="list-retry">
                  <Text style={[textStyles.body, { color: readOnly ? theme.colors.placeholder : theme.colors.tint }]}>Retry Save</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => void reload()} testID="list-reload">
                  <Text style={[textStyles.body, { color: theme.colors.tint }]}>Discard local edits and reload</Text>
                </Pressable>
              </>
            ) : null}
            {!readOnly ? (
              <Pressable accessibilityRole="button" onPress={confirmComplete} testID="list-complete">
                <Text style={[headline, { color: theme.colors.tint }]}>Complete Shopping Trip</Text>
              </Pressable>
            ) : (
              <Pressable accessibilityRole="button" onPress={() => setCopy(true)} testID="list-use-again">
                <Text style={[textStyles.body, { color: theme.colors.tint }]}>Use This List Again</Text>
              </Pressable>
            )}
          </View>
        </ScrollView>
      </View>

      {/* The options `Menu` (:263-268). */}
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
      <ReviewItemsSheet visible={pendingReview} items={pending} onAdd={(values) => void save(appended(list, values))} onClose={() => setPendingReview(false)} />
      <NewListSheet visible={copy} source={list} onCreated={setList} onClose={() => setCopy(false)} />
      <ListSettingsSheet visible={settings} list={list} onSave={(next) => void save(next)} onClose={() => setSettings(false)} />
      <ShareListSheet visible={sharing} list={list} onUpdate={setList} onClose={() => setSharing(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingBottom: 60 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 32, paddingTop: 20 },
  grow: { flex: 1 },
  bold: { fontWeight: '700' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  quick: { flex: 1, fontSize: 17, paddingVertical: 4, backgroundColor: 'transparent' },
  iconButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  caption: { fontSize: 12, lineHeight: 16 },
  reorder: { gap: 2 },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 24, paddingHorizontal: 32 },
  center: { textAlign: 'center' },
  actions: { paddingHorizontal: 32, paddingTop: 16, gap: 12 },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  menuScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.2)', alignItems: 'flex-end', paddingTop: 90, paddingRight: 16 },
  menu: { borderRadius: 14, minWidth: 220, paddingVertical: 4 },
  menuRow: { minHeight: 48, paddingHorizontal: 16, justifyContent: 'center' },
});
