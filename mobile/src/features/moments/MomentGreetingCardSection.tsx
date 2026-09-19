import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useStore } from 'zustand';

import type { ImportantMoment } from '../../api/moments';
import { Text } from '../../components/Text';
import { useTheme } from '../../theme';
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
  const [editing, setEditing] = useState(false);
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
      <Text style={[caption, { color: theme.colors.secondaryLabel }]}>Create and share a card with your greeting and signature. Scheduled wishes send text only.</Text>
      {notice ? <Text style={[caption, { color: theme.colors.label }]}>{notice}</Text> : null}
      <GreetingCardEditor model={model} visible={editing} onClose={() => setEditing(false)} saveOnUse />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 14 },
});
