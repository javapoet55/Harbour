import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import type { NexdoTask } from '../api/types';
import { contactActionTitle, isClarificationCandidate, nextStepTitle } from '../lib/taskClarification';
import { isDone } from '../lib/taskQuery';
import { brand, useTheme } from '../theme';
import { DetailTextInput, withAlpha } from './TaskDetailParts';
import { Text } from './Text';

/**
 * Port of `TaskActionCard` (ios/App/TaskActionView.swift:4-40) and the `ClarifyTaskActionCard` it
 * falls through to (`:42-100`). This sits at the TOP of the task detail (TaskDetailsView.swift:34).
 *
 * `TaskActionCard` has two branches. The first draws a "Nexdo Action: contact X" card when
 * `TaskActionCoordinator` holds a scheduled reminder action for the task; Phase 8 built it as
 * `src/components/TaskActionCard.tsx`, and the task detail renders it AHEAD of this card, so the two
 * are mutually exclusive exactly as they are in Swift.
 *
 * The second branch, ported in full below, shows when the task is open, has NO steps yet, and its
 * title is vague enough that `TaskActionClarification.isCandidate` returns true.
 */
export function ClarifyTaskActionCard({
  task,
  onSaveNextStep,
  onSaveContactAction,
  saving = false,
  failure,
}: {
  task: NexdoTask;
  /** `model.saveClarifiedStep(task, title:)` (TaskActionView.swift:71). */
  onSaveNextStep: (title: string) => void;
  /** `model.saveTask(id:title:…)` with the built "Call <name>" title (TaskActionView.swift:89). */
  onSaveContactAction: (title: string) => void;
  saving?: boolean;
  failure?: string | null;
}) {
  const theme = useTheme();
  // `.onAppear { contact = task.title }` (TaskActionView.swift:81).
  const [contact, setContact] = useState(task.title);
  const [nextStep, setNextStep] = useState('');
  const [contactMode, setContactMode] = useState(false);

  // `if let action = coordinator.action(for:) … else if !task.isDone && … isCandidate(task.title)`
  const shows =
    !isDone(task) &&
    task.status !== 'CANCELLED' &&
    (task.subtasks ?? []).length === 0 &&
    isClarificationCandidate(task.title);
  if (!shows) return null;

  const stepTitle = nextStepTitle(nextStep);

  return (
    <View style={[styles.card, { backgroundColor: withAlpha(brand.nexdoIndigo, 0.06) }]} testID="clarify-card">
      <Text style={[styles.headline, { color: theme.colors.ink }]}>
        {`What would you like to do about “${task.title}”?`}
      </Text>

      {/* `Picker("Next step type", …).pickerStyle(.segmented)` (TaskActionView.swift:55-58) */}
      <View style={[styles.segmented, { backgroundColor: theme.colors.groupedBackground }]}>
        {[
          { label: 'Work on it', mode: false },
          { label: 'Contact someone', mode: true },
        ].map(({ label, mode }) => (
          <Pressable
            key={label}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ selected: contactMode === mode }}
            onPress={() => setContactMode(mode)}
            testID={`clarify-mode-${mode ? 'contact' : 'work'}`}
            style={[styles.segment, contactMode === mode && { backgroundColor: theme.colors.surface }]}
          >
            <Text style={[styles.segmentLabel, { color: theme.colors.ink }]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {contactMode ? (
        <>
          <DetailTextInput
            value={contact}
            onChangeText={setContact}
            placeholder="Person or business to contact"
            accessibilityLabel="Person or business to contact"
            testID="clarify-contact"
          />
          <View style={styles.choices}>
            {['Call', 'Message', 'Email'].map((verb) => {
              const title = contactActionTitle(verb, contact);
              return (
                <Pressable
                  key={verb}
                  accessibilityRole="button"
                  accessibilityLabel={verb}
                  accessibilityState={{ disabled: saving || contact.trim().length === 0 }}
                  disabled={saving || contact.trim().length === 0}
                  onPress={() => title && onSaveContactAction(title)}
                  testID={`clarify-${verb.toLowerCase()}`}
                  style={[
                    styles.choice,
                    { borderColor: withAlpha(brand.nexdoIndigo, 0.16), backgroundColor: theme.colors.surface },
                    (saving || contact.trim().length === 0) && styles.dimmed,
                  ]}
                >
                  <Text style={[styles.choiceLabel, { color: theme.colors.link }]}>{verb}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.caption, { color: theme.colors.secondary }]}>
            You’ll review the contact before calling or sending.
          </Text>
        </>
      ) : (
        <>
          <DetailTextInput
            value={nextStep}
            onChangeText={setNextStep}
            placeholder="First step, e.g. Draft three presentation slides"
            accessibilityLabel="First step"
            multiline
            testID="clarify-next-step"
          />
          {/* `.buttonStyle(.borderedProminent)` (TaskActionView.swift:79) */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Save next step"
            accessibilityState={{ disabled: saving || stepTitle === null }}
            disabled={saving || stepTitle === null}
            onPress={() => stepTitle && onSaveNextStep(stepTitle)}
            testID="clarify-save-next-step"
            style={[styles.prominent, { backgroundColor: theme.colors.tint }, (saving || stepTitle === null) && styles.dimmed]}
          >
            <Text style={[styles.prominentLabel, { color: '#FFFFFF' }]}>Save next step</Text>
          </Pressable>
          <Text style={[styles.caption, { color: theme.colors.secondary }]}>
            Describe one small action. Save it, then use Start Focus Session below when you’re ready.
          </Text>
        </>
      )}

      {saving ? (
        <View style={styles.saving}>
          <ActivityIndicator size="small" />
          <Text style={[styles.caption, { color: theme.colors.secondary }]}>Updating your next step…</Text>
        </View>
      ) : null}
      {failure ? (
        <Text style={[styles.caption, { color: theme.colors.danger }]} testID="clarify-failure">
          {failure}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // `.padding(16)`, corner radius 18, nexdoIndigo at 6%.
  card: { gap: 12, padding: 16, borderRadius: 18 },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  segmented: { flexDirection: 'row', borderRadius: 9, padding: 2 },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 32, borderRadius: 7 },
  segmentLabel: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
  choices: { flexDirection: 'row', gap: 8 },
  choice: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 11, borderWidth: StyleSheet.hairlineWidth },
  choiceLabel: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  prominent: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 11, paddingHorizontal: 16, alignSelf: 'flex-start' },
  prominentLabel: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  caption: { fontSize: 12, lineHeight: 16 },
  saving: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dimmed: { opacity: 0.45 },
});
