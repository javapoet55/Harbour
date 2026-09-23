import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useStore } from 'zustand';

import type { ImportantMoment } from '../../api/moments';
import { Text } from '../../components/Text';
import { textStyles, useTheme } from '../../theme';
import { GreetingCardCapture } from './cardCapture';
import { CARD_NOT_ATTACHED } from './cardImage';
import { BorderedButton, caption } from './components';
import { displayGroups } from './domain';
import { FestivalGreetingCard, GreetingCardEditor } from './GreetingCard';
import { newManageModel } from './ManageMomentView';
import { momentsStore } from './store';

/**
 * `MomentGreetingCardSection` (ios/App/FestivalServices.swift:195-218): the greeting-card editor
 * without the rest of Manage Moment, on Review Wish and the editor. It saves the card on "Use This
 * Card" and never touches the recipients or the scheduled text.
 */
export function MomentGreetingCardSection({ moment, greeting }: { moment: ImportantMoment; greeting?: string }) {
  const theme = useTheme();
  const [model] = useState(() => {
    const current = momentsStore.getState().snapshot?.moments.find((item) => item.id === moment.id) ?? moment;
    return newManageModel(displayGroups([current])[0]);
  });
  const imageUri = useStore(model, (state) => state.imageUri);
  const title = useStore(model, (state) => state.title);
  const settings = useStore(model, (state) => state.settings);
  const notice = useStore(model, (state) => state.notice);
  const card = useStore(model, (state) => state.card);
  const cardFailed = useStore(model, (state) => state.cardFailed);
  const cardUploading = useStore(model, (state) => state.cardUploading);
  const [editing, setEditing] = useState(false);
  // A card made on another device has no local artwork, so fetch the stored image to show it.
  useEffect(() => {
    void model.getState().loadStoredCard();
  }, [model]);
  return (
    <View style={styles.section}>
      {imageUri ? <FestivalGreetingCard artwork={imageUri} title={title} message={settings.cardGreeting ?? settings.baseMessage} signature={settings.cardSignature ?? ''} /> : null}
      <BorderedButton
        prominent
        icon="sparkles"
        title={imageUri ? 'Edit Greeting Card' : 'Create AI Greeting Card'}
        onPress={() => {
          if (greeting) model.getState().updateSettings({ baseMessage: greeting });
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
      {card ? (
        <Pressable accessibilityRole="button" disabled={cardUploading} onPress={() => void model.getState().removeCard()} testID="moment-remove-stored-card">
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
