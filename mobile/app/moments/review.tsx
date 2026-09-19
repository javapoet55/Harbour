import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import type { DraftResponse, GenerateResponse, ImportantMoment, WishDraft } from '../../src/api/moments';
import { Text } from '../../src/components/Text';
import { TodayBackdrop } from '../../src/components/TodayShell';
import { BorderedButton, caption, ErrorText, IconLabel, KeyboardDoneBar, MomentCard, MomentPrimary, MomentSegments, Secondary } from '../../src/features/moments/components';
import { characterCount, latestDraft, momentIcon, supportsGreetingCard, typeLabel } from '../../src/features/moments/domain';
import { Disclosure, FormToggle } from '../../src/features/moments/form';
import { rememberDraft } from '../../src/features/moments/handoff';
import { MomentGreetingCardSection } from '../../src/features/moments/MomentGreetingCardSection';
import { momentsStore, useMoments } from '../../src/features/moments/store';
import { textStyles, useTheme } from '../../src/theme';

const TONES = ['Warm', 'Personal', 'Short', 'Fun'] as const;

/**
 * `ReviewWishView` (ios/App/ImportantMomentsView.swift:309-373): the tone, the AI toggle and its
 * consent sentence, the editable preview with its 0/500 counter, Try another / Edit, and "Approve &
 * Continue", which approves the draft and pushes Choose Delivery.
 *
 * On open it reuses the latest draft unless that draft is already PLANNED; otherwise it generates one.
 */
export default function ReviewWishScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [moment] = useState<ImportantMoment | undefined>(() => momentsStore.getState().snapshot?.moments.find((item) => item.id === id));
  const busy = useMoments((state) => state.busy);
  const error = useMoments((state) => state.error);
  // `.task` (:363): reuse the latest draft unless it is already PLANNED; otherwise generate one.
  const [reused] = useState<WishDraft | null>(() => {
    const latest = moment ? latestDraft(moment) : undefined;
    return latest && latest.status !== 'PLANNED' ? latest : null;
  });
  const [draft, setDraft] = useState<WishDraft | null>(reused);
  const [bodyText, setBodyText] = useState(reused?.body ?? '');
  const [tone, setTone] = useState<(typeof TONES)[number]>(() =>
    reused && (TONES as readonly string[]).includes(reused.tone) ? (reused.tone as (typeof TONES)[number]) : 'Warm',
  );
  const [personalContext, setPersonalContext] = useState(reused?.personalContext ?? '');
  const [aiConsent, setAiConsent] = useState(false);
  const editor = useRef<TextInput>(null);
  const started = useRef(false);

  const generate = () => {
    if (!moment) return;
    void momentsStore.getState().perform(async () => {
      const result = await momentsStore.getState().request<GenerateResponse>('generate', { momentID: moment.id, tone, personalContext, aiConsent });
      setDraft(result.draft);
      setBodyText(result.draft.body);
    });
  };

  useEffect(() => {
    if (started.current || !moment || reused) return;
    started.current = true;
    generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moment]);

  if (!moment) return null;
  const count = characterCount(bodyText);
  const disabled = busy || draft === null || bodyText.trim() === '' || count > 500;

  const approve = () => {
    Keyboard.dismiss();
    void momentsStore.getState().perform(async () => {
      if (!draft) return;
      const result = await momentsStore.getState().request<DraftResponse>('approve', { id: draft.id, body: bodyText, approved: true });
      setDraft(result.draft);
      rememberDraft(result.draft);
      router.push({ pathname: '/moments/delivery', params: { momentId: moment.id, draftId: result.draft.id } });
    });
  };

  return (
    <View style={styles.fill}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={8} testID="review-cancel">
              <Text style={{ fontSize: 17, lineHeight: 22, color: theme.colors.tint }}>Cancel</Text>
            </Pressable>
          ),
        }}
      />
      <TodayBackdrop />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content} testID="review-wish">
        <MomentCard>
          <IconLabel icon={momentIcon(moment.type) as never} title={moment.firstName === '' ? moment.title : moment.firstName} style={[textStyles.title2, styles.bold]} size={22} />
          {moment.type === 'festival' ? (
            <>
              <Secondary>{`Festival: ${moment.title}`}</Secondary>
              <Secondary>{moment.nextOccurrence}</Secondary>
            </>
          ) : (
            <Secondary>{`${typeLabel(moment.type)} · ${moment.nextOccurrence}`}</Secondary>
          )}
        </MomentCard>
        <MomentCard>
          <IconLabel icon="sparkles" title="Choose a tone" style={[textStyles.title2, styles.bold]} size={22} />
          <Secondary>Adjust the vibe of your message.</Secondary>
          <MomentSegments options={TONES} value={tone} onChange={setTone} testIDPrefix="review-tone" />
          <Disclosure title="Personalize with AI" testID="review-personalize">
            <TextInput
              accessibilityLabel="Personal context (optional)"
              multiline
              onChangeText={setPersonalContext}
              placeholder="Personal context (optional)"
              placeholderTextColor={theme.colors.placeholder}
              style={[styles.rounded, { color: theme.colors.label, backgroundColor: theme.colors.surface, borderColor: theme.colors.separator }]}
              testID="review-context"
              value={personalContext}
            />
            <FormToggle label="Use AI to draft my wish" value={aiConsent} onValueChange={setAiConsent} testID="review-ai" />
            <Text style={[caption, { color: theme.colors.secondaryLabel }]}>
              Only the first name, event type, tone, and context you enter are shared with OpenAI. You review every draft.
            </Text>
          </Disclosure>
        </MomentCard>
        <MomentCard>
          <IconLabel icon="document-text-outline" title="Message preview" style={[textStyles.title2, styles.bold]} size={22} />
          <Secondary>Review and make any changes.</Secondary>
          <TextInput
            ref={editor}
            accessibilityLabel="Wish message"
            multiline
            onChangeText={setBodyText}
            style={[styles.editor, { color: theme.colors.label, backgroundColor: theme.colors.background + 'A6' }]}
            testID="review-body"
            textAlignVertical="top"
            value={bodyText}
          />
          <Text style={[textStyles.body, styles.counter, { color: count > 500 ? theme.colors.danger : theme.colors.secondaryLabel }]} testID="review-count">{`${count}/500`}</Text>
          <View style={styles.inline}>
            <BorderedButton icon="sparkles" title="Try another" onPress={generate} testID="review-try-another" />
            <View style={styles.grow} />
            <BorderedButton icon="pencil" title="Edit" onPress={() => editor.current?.focus()} testID="review-edit" />
          </View>
        </MomentCard>
        {supportsGreetingCard(moment) ? <MomentGreetingCardSection moment={moment} greeting={bodyText} /> : null}
        <View style={styles.inline}>
          <Ionicons name="shield-checkmark-outline" size={13} color={theme.colors.secondaryLabel} />
          <Text style={[caption, { color: theme.colors.secondaryLabel }]}>Nothing is sent without your approval.</Text>
        </View>
        {error ? <ErrorText testID="review-error">{error}</ErrorText> : null}
        <MomentPrimary title="Approve & Continue" onPress={approve} disabled={disabled} testID="review-approve" />
      </ScrollView>
      <KeyboardDoneBar />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: 18, gap: 16, paddingBottom: 60 },
  bold: { fontWeight: '700' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  grow: { flex: 1 },
  rounded: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 5, paddingHorizontal: 7, paddingVertical: 5, fontSize: 17 },
  editor: { minHeight: 145, padding: 8, borderRadius: 14, fontSize: 17 },
  counter: { textAlign: 'right' },
});
