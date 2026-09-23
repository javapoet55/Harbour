import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useStore } from 'zustand';

import type { ImportantMoment } from '../../api/moments';
import { Text } from '../../components/Text';
import { textStyles, useTheme } from '../../theme';
import { GreetingCardCapture } from './cardCapture';
import { CARD_NOT_ATTACHED } from './cardImage';
import { BorderedButton, caption } from './components';
import { displayGroups, editableGroups } from './domain';
import { FestivalGreetingCard, GreetingCardEditor } from './GreetingCard';
import { useManageModel } from './ManageMomentView';
import { cardMessageFor } from './manageModel';
import { momentsStore } from './store';

/**
 * `MomentGreetingCardSection` (ios/App/FestivalServices.swift:243-279): the moment's greeting card, on
 * the same model as Manage Moment. The card prints the Wish Message, so a message edited in the card
 * editor is the wish that is scheduled, and "Use This Card" saves and approves it.
 *
 * `greeting` is the text the surrounding screen is reviewing, and `onMessageChange` reports an edit
 * back to it, so the two never drift apart.
 */
export function MomentGreetingCardSection({
  moment,
  greeting,
  onMessageChange,
}: {
  moment: ImportantMoment;
  greeting?: string;
  onMessageChange?: (message: string) => void;
}) {
  const theme = useTheme();
  const current = momentsStore.getState().snapshot?.moments.find((item) => item.id === moment.id) ?? moment;
  const [group] = useState(
    () => editableGroups(momentsStore.getState().snapshot?.moments ?? []).find((item) => item.moments.some((entry) => entry.id === current.id)) ?? displayGroups([current])[0],
  );
  const model = useManageModel(group);
  const imageUri = useStore(model, (state) => state.imageUri);
  const title = useStore(model, (state) => state.title);
  const settings = useStore(model, (state) => state.settings);
  const recipients = useStore(model, (state) => state.recipients);
  const baseMessage = settings.baseMessage;
  const notice = useStore(model, (state) => state.notice);
  const card = useStore(model, (state) => state.card);
  const cardFailed = useStore(model, (state) => state.cardFailed);
  const cardUploading = useStore(model, (state) => state.cardUploading);
  const [editing, setEditing] = useState(false);
  // A card made on another device has no local artwork, so fetch the stored image to show it.
  useEffect(() => {
    void model.getState().loadStoredCard();
  }, [model]);
  // `.onChange(of: model.settings.baseMessage)`: the screen above follows the wish edited here.
  const reported = useRef(baseMessage);
  useEffect(() => {
    if (reported.current === baseMessage) return;
    reported.current = baseMessage;
    onMessageChange?.(baseMessage);
  }, [baseMessage, onMessageChange]);
  return (
    <View style={styles.section}>
      {imageUri ? (
        <FestivalGreetingCard
          artwork={imageUri}
          title={title}
          message={cardMessageFor({ settings }, recipients.find((recipient) => recipient.momentID === current.id))}
          signature={settings.cardSignature ?? ''}
        />
      ) : null}
      <BorderedButton
        prominent
        icon="sparkles"
        title={imageUri ? 'Edit Greeting Card' : 'Create AI Greeting Card'}
        onPress={() => {
          // The message being reviewed on this screen is the wish the card prints.
          if (greeting && greeting !== model.getState().settings.baseMessage) model.getState().setMessage(greeting);
          setEditing(true);
        }}
        testID="moment-greeting-card"
      />
      <Text style={[caption, { color: theme.colors.secondaryLabel }]}>Create and share a card with your greeting and signature. Scheduled emails include your saved card; Messages send the text only.</Text>
      {cardFailed ? (
        <View style={styles.note}>
          <Text style={[caption, styles.grow, { color: theme.colors.secondaryLabel }]} testID="moment-card-upload-note">
            {CARD_NOT_ATTACHED}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Retry attaching the card" disabled={cardUploading} onPress={() => void model.getState().retryCardUpload()} testID="moment-card-retry">
            <Text style={[textStyles.body, { color: theme.colors.link }]}>Retry</Text>
          </Pressable>
        </View>
      ) : null}
      {imageUri || card ? (
        <Pressable accessibilityRole="button" disabled={cardUploading} onPress={() => void model.getState().removeCard()} testID="moment-remove-card">
          <Text style={[textStyles.body, { color: theme.colors.danger }]}>Remove card</Text>
        </Pressable>
      ) : null}
      {notice ? <Text style={[caption, { color: theme.colors.label }]}>{notice}</Text> : null}
      <GreetingCardEditor model={model} visible={editing} onClose={() => setEditing(false)} saveOnUse />
      <GreetingCardCapture model={model} />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 14 },
  note: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  grow: { flex: 1 },
});
