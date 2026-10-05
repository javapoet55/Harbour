import { Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { NutritionEntry, NutritionMeal } from '../../api/nutrition';
import { Text } from '../../components/Text';
import { MenuPicker } from '../moments/form';
import { MEALS } from './model';
import { INK, SECONDARY, TINT } from './parts';

/**
 * `foodEditor` (ios/App/CalorieTrackerView.swift:873-915): Add Food or Edit Food in a sheet — the name,
 * the calories (0 to 5,000) and the meal, with Cancel and Add / Save. Swift's editor has no Delete; a
 * food is removed with the minus button on its row in the log.
 */

export type FoodDraft = { entry: NutritionEntry | null; name: string; calories: string; meal: NutritionMeal };

/** `editorValid` (:880-883): a name, and calories that are a whole number from 0 to 5,000. */
export function editorValid(draft: Pick<FoodDraft, 'name' | 'calories'>): boolean {
  if (!/^\d+$/.test(draft.calories)) return false;
  const calories = Number.parseInt(draft.calories, 10);
  return draft.name.trim() !== '' && calories >= 0 && calories <= 5000;
}

export function FoodEditor({
  draft,
  live,
  selectedDate,
  zone,
  onChange,
  onCancel,
  onSave,
}: {
  draft: FoodDraft | null;
  live: boolean;
  selectedDate: number;
  zone: string;
  onChange: (draft: FoodDraft) => void;
  onCancel: () => void;
  onSave: (draft: FoodDraft) => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const valid = draft !== null && editorValid(draft);
  const date = new Intl.DateTimeFormat('en-US', { timeZone: zone, month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(selectedDate));
  return (
    <Modal animationType="slide" onRequestClose={onCancel} presentationStyle="pageSheet" visible={draft !== null}>
      {draft ? (
        <View style={[styles.sheet, { paddingTop: Platform.OS === 'android' ? insets.top : 0, paddingBottom: insets.bottom }]} testID="calorie-food-editor">
          <View style={styles.bar}>
            <Pressable accessibilityRole="button" onPress={onCancel} style={styles.side} testID="calorie-editor-cancel">
              <Text style={[styles.body, { color: TINT }]}>Cancel</Text>
            </Pressable>
            <Text accessibilityRole="header" style={[styles.headline, styles.title]}>
              {draft.entry ? 'Edit Food' : 'Add Food'}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !valid }}
              disabled={!valid}
              onPress={() => void onSave(draft)}
              style={[styles.side, styles.trailing]}
              testID="calorie-editor-save"
            >
              <Text style={[styles.headline, { color: TINT }, !valid && styles.disabled]}>{draft.entry ? 'Save' : 'Add'}</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
            <Text style={styles.sectionHeader}>{live ? 'Food' : 'Sample meal'}</Text>
            <View style={styles.group}>
              <TextInput
                onChangeText={(name) => onChange({ ...draft, name })}
                placeholder="Food name"
                placeholderTextColor="rgba(60, 60, 67, 0.3)"
                style={[styles.field, styles.separator]}
                testID="calorie-editor-name"
                value={draft.name}
              />
              <TextInput
                keyboardType="number-pad"
                onChangeText={(calories) => onChange({ ...draft, calories })}
                placeholder="Calories"
                placeholderTextColor="rgba(60, 60, 67, 0.3)"
                style={[styles.field, styles.separator]}
                testID="calorie-editor-calories"
                value={draft.calories}
              />
              <View style={styles.pickerRow}>
                <MenuPicker label="Meal" onChange={(meal) => onChange({ ...draft, meal })} options={MEALS.map((meal) => ({ value: meal.key, title: meal.title }))} testID="calorie-editor-meal" value={draft.meal} />
              </View>
            </View>
            <View style={styles.group}>
              <Text style={[styles.body, styles.note, { color: SECONDARY }]}>{live ? `Saved to your food log for ${date}.` : 'This entry changes the preview only.'}</Text>
            </View>
          </ScrollView>
        </View>
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: '#F2F2F7' },
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, minHeight: 56 },
  side: { width: 72 },
  trailing: { alignItems: 'flex-end' },
  title: { flex: 1, textAlign: 'center' },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600', color: INK },
  body: { fontSize: 17, lineHeight: 22, color: INK },
  disabled: { opacity: 0.35 },
  form: { padding: 16, gap: 8 },
  // iOS 26 draws a `Form` `Section("…")` header as written, row-sized and semibold (`calorie-add-food`).
  sectionHeader: { fontSize: 17, lineHeight: 22, fontWeight: '600', color: SECONDARY, marginLeft: 16, marginTop: 8 },
  group: { backgroundColor: '#FFFFFF', borderRadius: 10, overflow: 'hidden', marginBottom: 16 },
  field: { minHeight: 44, paddingHorizontal: 16, fontSize: 17, color: INK },
  separator: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(60, 60, 67, 0.29)' },
  pickerRow: { minHeight: 44, paddingHorizontal: 16, justifyContent: 'center' },
  note: { padding: 16 },
});
