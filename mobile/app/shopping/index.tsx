import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '../../src/components/Text';
import { TodayBackdrop } from '../../src/components/TodayShell';
import { headline, MomentCard, systemColors } from '../../src/features/moments/components';
import { momentDate } from '../../src/features/moments/dates';
import { ListTile } from '../../src/features/shopping/components';
import { NewListSheet } from '../../src/features/shopping/sheets';
import { shoppingStore, useShopping } from '../../src/features/shopping/store';
import { brand, textStyles, useTheme } from '../../src/theme';

/** `.dateTime.month(.abbreviated).day()` in the device locale — "25 Sep" or "Sep 25". */
function shortDay(day: string, zone: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, { timeZone: zone, month: 'short', day: 'numeric' }).format(new Date(momentDate(day, zone)));
  } catch {
    return day;
  }
}

/**
 * `ShoppingHome` (ios/App/ShoppingViews.swift:78-138): "Create New List", then Recent Lists — or, with
 * no lists, "Your next trip starts here". Creating a list opens it.
 */
export default function MyListsScreen() {
  const theme = useTheme();
  const lists = useShopping((state) => state.lists);
  const error = useShopping((state) => state.error);
  const [create, setCreate] = useState(false);

  // `.task { await store.refresh() }`
  useEffect(() => {
    void shoppingStore.getState().refresh();
  }, []);

  return (
    <View style={styles.fill}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable accessibilityRole="button" accessibilityLabel="Create shopping list" onPress={() => setCreate(true)} hitSlop={8} testID="shopping-plus">
              <Ionicons name="add-circle" size={28} color={brand.nexdoIndigo} />
            </Pressable>
          ),
        }}
      />
      <TodayBackdrop />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => void shoppingStore.getState().refresh()} />}
        testID="shopping-home"
      >
        <Pressable accessibilityRole="button" onPress={() => setCreate(true)} testID="shopping-create-list">
          <MomentCard>
            <View style={styles.row}>
              <ListTile icon="doc.badge.plus" color={brand.nexdoIndigo} />
              <View style={styles.grow}>
                <Text style={[headline, { color: theme.colors.ink }]}>Create New List</Text>
                <Text style={[textStyles.subheadline, { color: theme.colors.secondary }]}>Start from scratch or use last week’s list.</Text>
              </View>
              <Ionicons name="chevron-forward" size={17} color={theme.colors.secondary} />
            </View>
          </MomentCard>
        </Pressable>
        <Text style={[textStyles.title2, styles.bold, { color: theme.colors.ink }]}>Recent Lists</Text>
        {lists.length === 0 && error === null ? (
          <View style={styles.empty} testID="shopping-empty">
            <Ionicons name="cart-outline" size={44} color={theme.colors.secondaryLabel} />
            <Text style={[textStyles.title2, styles.bold, { color: theme.colors.label }]}>Your next trip starts here</Text>
            <Text style={[textStyles.subheadline, styles.center, { color: theme.colors.secondaryLabel }]}>Create a list, then type or dictate what you need.</Text>
          </View>
        ) : lists.length > 0 ? (
          <MomentCard>
            {lists.map((list, index) => {
              const open = list.completedAt == null;
              return (
                <View key={list.id}>
                  {index > 0 ? <View style={[styles.divider, { backgroundColor: theme.colors.separator }]} /> : null}
                  <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/shopping/[id]', params: { id: list.id } })} style={styles.listRow} testID={`shopping-list-${list.id}`}>
                    <ListTile icon={open ? 'cart' : 'copy-outline'} color={open ? systemColors.green : brand.nexdoIndigo} />
                    <View style={styles.grow}>
                      <Text style={[headline, { color: theme.colors.ink }]}>{list.title}</Text>
                      <Text style={[styles.caption, { color: theme.colors.secondary }]}>{`${list.items.length} items${open ? '' : ' · Completed'}`}</Text>
                    </View>
                    <Text style={[styles.caption, { color: theme.colors.secondary }]}>{shortDay(list.date, list.timeZone)}</Text>
                    <Ionicons name="chevron-forward" size={12} color={theme.colors.secondary} />
                  </Pressable>
                </View>
              );
            })}
          </MomentCard>
        ) : null}
        {error ? (
          <>
            <Text style={[textStyles.body, { color: theme.colors.danger }]} testID="shopping-error">
              {error}
            </Text>
            <Pressable accessibilityRole="button" onPress={() => void shoppingStore.getState().refresh()} testID="shopping-retry">
              <Text style={[textStyles.body, { color: theme.colors.tint }]}>Try again</Text>
            </Pressable>
          </>
        ) : null}
      </ScrollView>
      <NewListSheet
        visible={create}
        onClose={() => setCreate(false)}
        // `.navigationDestination(… created != nil && !create)`: the new list opens once the sheet is gone.
        onCreated={(list) => router.push({ pathname: '/shopping/[id]', params: { id: list.id } })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: 18, gap: 24, paddingBottom: 40 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  grow: { flex: 1, gap: 4 },
  bold: { fontWeight: '700' },
  caption: { fontSize: 12, lineHeight: 16 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 10 },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 24 },
  center: { textAlign: 'center' },
});

