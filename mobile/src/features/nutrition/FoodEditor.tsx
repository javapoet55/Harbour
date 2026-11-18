import { Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { NutritionEntry, NutritionMeal } from '../../api/nutrition';
import { Text } from '../../components/Text';
import { useTheme } from '../../theme';
import { MenuPicker } from '../moments/form';
import { MEALS } from './model';

/**
 * `foodEditor` (ios/App/CalorieTrackerView.swift:873-915): Add Food or Edit Food in a sheet — the name,
 * the calories (0 to 5,000) and the meal, with Cancel and Add / Save. Swift's editor has no Delete; a
 * food is removed with the minus button on its row in the log.
 *
 * A plain `Form` in a sheet, so it follows the phone's theme with the tracker (ce6d20a): the sheet's raised
 * grouped background, white or `#2C2C2E` groups, and the tint on Cancel and Add (`link`, Android's dark blue).
 */

export type FoodDraft = { entry: NutritionEntry | null; name: string; calories: string; meal: NutritionMeal };

/** `editorValid` (:880-883): a name, and calories that are a whole number from 0 to 5,000. */
export function editorValid(draft: Pick<FoodDraft, 'name' | 'calories'>): boolean {
  if (!/^\d+$/.test(draft.calories)) return false;
  const calories = Number.parseInt(draft.calories, 10);
  return draft.name.trim() !== '' && calories >= 0 && calories <= 5000;
}

/** Calories typed but not a whole number from 0 to 5,000 (QA M-02). Nothing is said while the field is empty. */
export function caloriesOutOfRange(calories: string): boolean {
  if (calories.trim() === '') return false;
  return !/^\d+$/.test(calories) || Number.parseInt(calories, 10) > 5000;
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
  const { colors } = useTheme({ elevated: true });
  const separator = { borderBottomColor: colors.separator };
  const group = [styles.group, { backgroundColor: colors.surface }];
  const field = [styles.field, styles.separator, separator, { color: colors.ink }];
  const valid = draft !== null && editorValid(draft);
  const caloriesError = draft !== null && caloriesOutOfRange(draft.calories);
  const date = new Intl.DateTimeFormat('en-US', { timeZone: zone, month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(selectedDate));
  return (
    <Modal animationType="slide" onRequestClose={onCancel} presentationStyle="pageSheet" visible={draft !== null}>
      {draft ? (
        <View style={[styles.sheet, { backgroundColor: colors.groupedBackground, paddingTop: Platform.OS === 'android' ? insets.top : 0, paddingBottom: insets.bottom }]} testID="calorie-food-editor">
          <View style={styles.bar}>
            <Pressable accessibilityRole="button" onPress={onCancel} style={styles.side} testID="calorie-editor-cancel">
              <Text style={[styles.body, { color: colors.link }]}>Cancel</Text>
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
              <Text style={[styles.headline, { color: colors.link }, !valid && styles.disabled]}>{draft.entry ? 'Save' : 'Add'}</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
            <Text style={[styles.sectionHeader, { color: colors.secondaryLabel }]}>{live ? 'Food' : 'Sample meal'}</Text>
            <View style={group}>
              <TextInput
                onChangeText={(name) => onChange({ ...draft, name })}
                placeholder="Food name"
                placeholderTextColor={colors.placeholder}
                style={field}
                testID="calorie-editor-name"
                value={draft.name}
              />
              <TextInput
                keyboardType="number-pad"
                onChangeText={(calories) => onChange({ ...draft, calories })}
                placeholder="Calories"
                placeholderTextColor={colors.placeholder}
                style={field}
                testID="calorie-editor-calories"
                value={draft.calories}
              />
              {caloriesError ? (
                <Text accessibilityLiveRegion="polite" style={[styles.error, styles.separator, separator, { color: colors.danger }]} testID="calorie-editor-calories-error">
                  Enter calories from 0 to 5,000.
                </Text>
              ) : null}
              <View style={styles.pickerRow}>
                <MenuPicker label="Meal" onChange={(meal) => onChange({ ...draft, meal })} options={MEALS.map((meal) => ({ value: meal.key, title: meal.title }))} testID="calorie-editor-meal" value={draft.meal} />
              </View>
            </View>
            <View style={group}>
              <Text style={[styles.body, styles.note, { color: colors.secondaryLabel }]}>{live ? `This will be saved to your food log for ${date}.` : 'This entry changes the preview only.'}</Text>
            </View>
          </ScrollView>
        </View>
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, minHeight: 56 },
  side: { width: 72 },
  trailing: { alignItems: 'flex-end' },
  title: { flex: 1, textAlign: 'center' },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 17, lineHeight: 22 },
  disabled: { opacity: 0.35 },
  form: { padding: 16, gap: 8 },
  // iOS 26 draws a `Form` `Section("…")` header as written, row-sized and semibold (`calorie-add-food`).
  sectionHeader: { fontSize: 17, lineHeight: 22, fontWeight: '600', marginLeft: 16, marginTop: 8 },
  group: { borderRadius: 10, overflow: 'hidden', marginBottom: 16 },
  field: { minHeight: 44, paddingHorizontal: 16, fontSize: 17 },
  separator: { borderBottomWidth: StyleSheet.hairlineWidth },
  pickerRow: { minHeight: 44, paddingHorizontal: 16, justifyContent: 'center' },
  note: { padding: 16 },
  error: { paddingHorizontal: 16, paddingVertical: 8, fontSize: 13, lineHeight: 18 },
});
