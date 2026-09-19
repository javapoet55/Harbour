import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useStore } from 'zustand';

import type { GroceryItem } from '../../api/shopping';
import { withAlpha } from '../../components/SignInBackdrop';
import { Text } from '../../components/Text';
import { TodayBackdrop } from '../../components/TodayShell';
import { brand, linearGradientStops, textStyles, useTheme } from '../../theme';
import { headline, KeyboardDoneBar, MomentCard, MomentPrimary, MomentSheet } from '../moments/components';
import { FormToggle, MenuPicker } from '../moments/form';
import { createShoppingVoice, playStartBell, useTranscriptionConsent } from './device';
import { CATEGORIES } from './model';
import { shoppingStore } from './store';
import type { ShoppingVoice } from './voice';

const GRADIENT = linearGradientStops([brand.nexdoMagenta, brand.nexdoIndigo, brand.nexdoBlue]);

/**
 * `ShoppingVoiceView` (ios/App/ShoppingVoice.swift:77-127): ready → listening → stopped, the editable
 * transcript, "Review Items" (which finishes the session and sends the text to the server's `parse`),
 * and the in-place review before "Add N Items". Leaving the sheet or the app closes the session.
 */
export function VoiceSheet({ visible, onAdd, onClose }: { visible: boolean; onAdd: (items: GroceryItem[]) => void; onClose: () => void }) {
  return visible ? <VoiceBody onAdd={onAdd} onClose={onClose} /> : null;
}

function VoiceBody({ onAdd, onClose }: { onAdd: (items: GroceryItem[]) => void; onClose: () => void }) {
  const theme = useTheme();
  const [voice] = useState<ShoppingVoice>(createShoppingVoice);
  const state = useStore(voice.state);
  const consent = useTranscriptionConsent((value) => value.enabled);
  const setConsent = useTranscriptionConsent((value) => value.setEnabled);
  const [review, setReview] = useState<GroceryItem[]>([]);
  const [reviewing, setReviewing] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void useTranscriptionConsent.getState().hydrate();
    // `.onChange(of: phase) { if value != .active { voice.close() } }` and `.onDisappear { voice.close() }`
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') voice.close();
    });
    return () => {
      subscription.remove();
      voice.close();
    };
  }, [voice]);

  const close = () => {
    voice.close();
    onClose();
  };

  const toggleMic = () => {
    if (!state.listening) playStartBell();
    void (state.listening ? voice.finish() : voice.start());
  };

  const reviewItems = async () => {
    setParsing(true);
    await voice.finish();
    try {
      const items = await shoppingStore.getState().parse(voice.state.getState().text);
      setReview(items);
      setReviewing(items.length > 0);
      if (items.length === 0) setError('No items found. Type or dictate an item.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
    setParsing(false);
  };

  const update = (id: string, patch: Partial<GroceryItem>) => setReview((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  const status = !consent
    ? 'Enable live transcription below to start'
    : state.finishing
      ? 'Finishing transcription…'
      : state.connecting
        ? 'Connecting…'
        : state.listening
          ? 'Listening — keep going'
          : 'Ready when you are';
  const micDisabled = !consent || state.connecting || state.finishing;
  const message = error ?? state.error;

  return (
    <MomentSheet visible title="Add by Voice" onRequestClose={close} left={{ title: 'Close', onPress: close, testID: 'voice-close' }} testID="shopping-voice">
      <View style={styles.fill}>
        <TodayBackdrop />
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          <Text style={[textStyles.largeTitle, styles.bold, styles.center, { color: theme.colors.label }]}>{reviewing ? 'Review your items' : 'Tell me what to add'}</Text>
          <Text style={[textStyles.body, styles.center, { color: theme.colors.secondaryLabel }]}>Try “six bananas, one gallon of milk, and two bags of rice 5 kg.”</Text>
          {!reviewing ? (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={state.listening ? 'Pause listening' : 'Start listening'}
                accessibilityState={{ disabled: micDisabled }}
                disabled={micDisabled}
                onPress={toggleMic}
                style={[styles.micShadow, micDisabled && styles.dimmed]}
                testID="voice-mic"
              >
                <LinearGradient colors={GRADIENT} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.mic}>
                  <Ionicons name={state.listening ? 'pause' : 'mic'} size={48} color="#FFFFFF" />
                </LinearGradient>
              </Pressable>
              <Text style={[headline, styles.center, { color: theme.colors.label }]} testID="voice-status">
                {status}
              </Text>
              <View style={styles.stretch}>
                <FormToggle
                  label="Allow live voice transcription"
                  value={consent}
                  onValueChange={(value) => {
                    setConsent(value);
                    if (!value) voice.close();
                  }}
                  testID="voice-consent"
                />
              </View>
              <Text style={[styles.caption, styles.stretch, { color: theme.colors.secondaryLabel }]}>
                Tap the mic to transcribe in English. Audio is sent only while listening. Review items before adding them.
              </Text>
              <TextInput
                accessibilityLabel="Shopping transcript"
                multiline
                onChangeText={(text) => voice.setText(text)}
                style={[styles.transcript, { color: theme.colors.label, backgroundColor: theme.colors.glassFill }]}
                testID="voice-transcript"
                textAlignVertical="top"
                value={state.text}
              />
              <View style={styles.stretch}>
                <MomentPrimary title={parsing ? 'Organizing…' : 'Review Items'} onPress={() => void reviewItems()} disabled={parsing || state.text.trim() === ''} testID="voice-review" />
              </View>
            </>
          ) : (
            <>
              {review.map((item) => (
                <View key={item.id} style={styles.stretch}>
                  <MomentCard>
                    <Field placeholder="Item" value={item.name} onChangeText={(name) => update(item.id, { name })} testID={`voice-item-${item.id}`} />
                    <View style={styles.inline}>
                      <View style={styles.grow}>
                        <Field placeholder="Quantity" value={item.quantity} onChangeText={(quantity) => update(item.id, { quantity })} />
                      </View>
                      <View style={styles.grow}>
                        <Field placeholder="Size" value={item.size} onChangeText={(size) => update(item.id, { size })} />
                      </View>
                    </View>
                    <MenuPicker hideLabel label="Category" options={CATEGORIES.map((value) => ({ value, title: value }))} value={item.category} onChange={(category) => update(item.id, { category })} testID={`voice-category-${item.id}`} />
                    <Field placeholder="Notes" value={item.notes} onChangeText={(notes) => update(item.id, { notes })} />
                    <Pressable accessibilityRole="button" onPress={() => setReview((items) => items.filter((value) => value.id !== item.id))} testID={`voice-remove-${item.id}`}>
                      <Text style={[textStyles.body, { color: theme.colors.danger }]}>Remove</Text>
                    </Pressable>
                  </MomentCard>
                </View>
              ))}
              <View style={styles.stretch}>
                <MomentPrimary
                  title={`Add ${review.length} Items`}
                  onPress={() => {
                    onAdd(review);
                    close();
                  }}
                  disabled={review.length === 0 || review.some((item) => item.name.trim() === '')}
                  testID="voice-add"
                />
              </View>
              <Pressable accessibilityRole="button" onPress={() => setReviewing(false)} testID="voice-keep-dictating">
                <Text style={[textStyles.body, { color: theme.colors.tint }]}>Keep dictating</Text>
              </Pressable>
            </>
          )}
          {message ? (
            <Text style={[textStyles.body, styles.stretch, { color: theme.colors.danger }]} testID="voice-error">
              {message}
            </Text>
          ) : null}
        </ScrollView>
        <KeyboardDoneBar />
      </View>
    </MomentSheet>
  );
}

function Field({ placeholder, value, onChangeText, testID }: { placeholder: string; value: string; onChangeText: (value: string) => void; testID?: string }) {
  const theme = useTheme();
  return (
    <TextInput
      accessibilityLabel={placeholder}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={theme.colors.placeholder}
      style={[styles.field, { color: theme.colors.label }]}
      testID={testID}
      value={value}
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: 20, gap: 22, alignItems: 'center', paddingBottom: 60 },
  bold: { fontWeight: '700' },
  center: { textAlign: 'center' },
  stretch: { alignSelf: 'stretch' },
  micShadow: { borderRadius: 70, shadowColor: withAlpha(brand.nexdoIndigo, 0.2), shadowOpacity: 1, shadowRadius: 12, elevation: 6 },
  mic: { width: 140, height: 140, borderRadius: 70, alignItems: 'center', justifyContent: 'center' },
  dimmed: { opacity: 0.35 },
  caption: { fontSize: 12, lineHeight: 16 },
  transcript: { alignSelf: 'stretch', minHeight: 120, padding: 10, borderRadius: 16, fontSize: 17 },
  inline: { flexDirection: 'row', gap: 8 },
  grow: { flex: 1 },
  field: { fontSize: 17, paddingVertical: 4, backgroundColor: 'transparent' },
});
