import * as Crypto from 'expo-crypto';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GradientButton } from '../../components/GradientButton';
import { InlineNavBar } from '../../components/InlineNavBar';
import { TaskSymbol } from '../../components/TaskSymbol';
import { Text } from '../../components/Text';
import { FEEDBACK_DESCRIPTION_LIMIT, FEEDBACK_THANKS, FEEDBACK_TITLE_LIMIT, feedbackCounter, feedbackValid, starLabel, starsCaption } from '../../lib/feedback';
import { useSubmitFeedback } from '../../query/useFeedback';
import { useTheme } from '../../theme';
import { KeyboardDoneBar } from '../moments/components';
import { FormField, FormRow, FormScroll, FormSection, FormText } from '../moments/form';

/**
 * `FeedbackView` (ios/App/FeedbackView.swift), pushed from Account and from Help's "Still need help?".
 * Title (160) and description (5,000) counted in UTF-16 units, one to five stars, and one id for as long
 * as the form is open, so a retry cannot file twice (part 1 `useSubmitFeedback`). On success, Swift's
 * "Thank you for your feedback!" alert; Done goes back.
 */
export function FeedbackScreen({ onDone }: { onDone: () => void }) {
  const theme = useTheme();
  const [submissionId] = useState(() => Crypto.randomUUID().toUpperCase());
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [stars, setStars] = useState(0);
  const [failure, setFailure] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const submit = useSubmitFeedback();
  const saving = submit.isPending;
  const valid = feedbackValid({ title, description, stars });
  const titleCount = feedbackCounter(title, FEEDBACK_TITLE_LIMIT);
  const descriptionCount = feedbackCounter(description, FEEDBACK_DESCRIPTION_LIMIT);
  const locked = saving || submitted;

  const send = async () => {
    if (!valid || saving) return;
    setFailure(null);
    try {
      await submit.mutateAsync({ id: submissionId, title, description, stars });
      setSubmitted(true);
      Alert.alert(FEEDBACK_THANKS.title, FEEDBACK_THANKS.message, [{ text: 'Done', onPress: onDone }], { cancelable: false });
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'Request failed.');
    }
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.fill, { backgroundColor: theme.colors.groupedBackground }]} testID="feedback-screen">
      <InlineNavBar backHidden={saving} onBack={onDone} testID="feedback-nav" title="Feedback" />
      <FormScroll>
        {/* Each counter and the stars caption is its own row, as in Swift's `Form` (`feedback-empty`). */}
        <FormSection disabled={locked} header="Title">
          <FormRow>
            <FormField onChangeText={setTitle} placeholder="What would you like to share?" testID="feedback.title" value={title} />
          </FormRow>
          <FormRow last>
            <Text style={[styles.caption, { color: titleCount.over ? theme.colors.danger : theme.colors.secondaryLabel }]} testID="feedback.title.count">
              {titleCount.label}
            </Text>
          </FormRow>
        </FormSection>
        <FormSection disabled={locked} header="Description">
          <FormRow>
            {/* `.lineLimit(5...12)`. */}
            <View style={styles.description}>
              <FormField multiline onChangeText={setDescription} placeholder="Tell us about your experience or suggestion…" testID="feedback.description" value={description} />
            </View>
          </FormRow>
          <FormRow last>
            <Text style={[styles.caption, { color: descriptionCount.over ? theme.colors.danger : theme.colors.secondaryLabel }]} testID="feedback.description.count">
              {descriptionCount.label}
            </Text>
          </FormRow>
        </FormSection>
        <FormSection disabled={locked} header="Your rating">
          <FormRow>
            <View style={styles.field}>
              <View style={styles.stars}>
                {[1, 2, 3, 4, 5].map((value) => (
                  <Pressable
                    accessibilityLabel={starLabel(value)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: value === stars }}
                    key={value}
                    onPress={() => setStars(value)}
                    style={styles.star}
                    testID={`feedback.star.${value}`}
                  >
                    <TaskSymbol color={value <= stars ? '#FF9500' : theme.colors.secondary} name={value <= stars ? 'star.fill' : 'star'} size={22} />
                  </Pressable>
                ))}
              </View>
            </View>
          </FormRow>
          <FormRow last>
            <Text style={[styles.caption, { color: theme.colors.secondaryLabel }]}>{starsCaption(stars)}</Text>
          </FormRow>
        </FormSection>
        {failure ? (
          <FormSection>
            <FormRow last>
              <FormText tone="danger" testID="feedback-failure">
                {failure}
              </FormText>
            </FormRow>
          </FormSection>
        ) : null}
        {/* The button is a `Form` row of its own. */}
        <FormSection>
          <FormRow last>
            <View style={styles.submit}>
              <GradientButton disabled={!valid || locked} gradient="save" minHeight={50} onPress={() => void send()} testID="feedback.submit" title={saving ? 'Submitting…' : 'Submit feedback'} />
              {saving ? <ActivityIndicator color="#FFFFFF" style={styles.spinner} /> : null}
            </View>
          </FormRow>
        </FormSection>
      </FormScroll>
      {/* Android ahead of iOS: Swift's form has no way to put the keyboard away (no Done, no tap outside, and
          Return adds a line), so the rating and Submit stay covered. The shared Done capsule rides on the
          keyboard, as on the Moments and Shopping forms. */}
      <KeyboardDoneBar testID="feedback-keyboard-done" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  field: { flex: 1, gap: 6 },
  caption: { fontSize: 12, lineHeight: 16 },
  stars: { flexDirection: 'row', gap: 4 },
  star: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  description: { flex: 1, minHeight: 116 },
  submit: { flex: 1, justifyContent: 'center' },
  spinner: { position: 'absolute', left: 24 },
});
