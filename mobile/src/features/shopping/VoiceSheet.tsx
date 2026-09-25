import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useStore } from 'zustand';

import type { GroceryItem } from '../../api/shopping';
import { KeyboardAwareScrollView } from '../../components/keyboard';
import { withAlpha } from '../../components/SignInBackdrop';
import { Text } from '../../components/Text';
import { TodayBackdrop } from '../../components/TodayShell';
import { brand, linearGradientStops, textStyles, useTheme } from '../../theme';
import { headline, KEYBOARD_DONE_BAR_HEIGHT, KeyboardDoneBar, MomentPrimary, MomentSheet } from '../moments/components';
import { FormToggle } from '../moments/form';
import { createShoppingVoice, playStartBell, useTranscriptionConsent } from './device';
import { shoppingStore } from './store';
import type { ShoppingVoice } from './voice';

const GRADIENT = linearGradientStops([brand.nexdoMagenta, brand.nexdoIndigo, brand.nexdoBlue]);

/** `ShoppingVoiceView`'s "No items found" (ShoppingVoice.swift:117). Quick add has its own wording. */
export const NO_VOICE_ITEMS = 'No items found. Type or dictate an item.';

/**
 * `ShoppingVoiceView` (ios/App/ShoppingVoice.swift:77-121): ready → listening → stopped, the editable
 * transcript, and "Add to List", which finishes the session, sends the text to the server's `parse`
 * and hands the items straight to the list — the review step went in `d76f460`, matching quick add.
 * Leaving the sheet or the app closes the session.
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
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void useTranscriptionConsent.getState().hydrate();
    // `.onChange(of: phase) { if value != .active { voice.close() } }` and `.onDisappear { voice.close() }`.
    // `leaveApp` skips the close while the microphone prompt is up: on Android the prompt itself sends
    // the app to `background`, which closed the session and silently cancelled the first tap.
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') voice.leaveApp();
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
    (state.listening ? voice.finish() : voice.start()).catch((error: unknown) => {
      // `start()` and `finish()` report their own failures; this only catches the unexpected.
      console.warn('[ShoppingVoice] mic toggle failed', error);
    });
  };

  /** `addItems()` (ShoppingVoice.swift:112-120): blank names are dropped; on success the sheet closes. */
  const addItems = async () => {
    setParsing(true);
    setError(null);
    await voice.finish();
    try {
      const items = (await shoppingStore.getState().parse(voice.state.getState().text)).filter((item) => item.name.trim() !== '');
      if (items.length === 0) {
        setError(NO_VOICE_ITEMS);
        setParsing(false);
        return;
      }
      onAdd(items);
      close();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setParsing(false);
    }
  };
  const status = !consent
    ? 'Enable live transcription below to start'
    : state.finishing
      ? 'Finishing transcription…'
      : state.connecting
        ? 'Connecting…'
        : state.listening
          ? 'Listening — keep going'
          : 'Tap Mic and Talk';
  const micDisabled = !consent || state.connecting || state.finishing;
  const message = error ?? state.error;

  return (
    <MomentSheet visible title="Add by Voice" onRequestClose={close} left={{ title: 'Close', onPress: close, testID: 'voice-close' }} testID="shopping-voice">
      <View style={styles.fill}>
        <TodayBackdrop />
        <KeyboardAwareScrollView bottomOffset={KEYBOARD_DONE_BAR_HEIGHT} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          <Text style={[textStyles.largeTitle, styles.bold, styles.center, { color: theme.colors.label }]}>Tell me what to add</Text>
          <Text style={[textStyles.body, styles.center, { color: theme.colors.secondaryLabel }]}>Try “six bananas, one gallon of milk, and two bags of rice 5 kg.”</Text>
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
            Tap the mic to transcribe in English. Audio is sent only while listening. Nexdo organizes your words into grocery items before adding them.
          </Text>
          {/* `TextEditor(…).frame(minHeight: 120).padding(10).background(.ultraThinMaterial, in: 16)`: the
              editor keeps its own white background, inset 10pt inside the material card. */}
          <View style={[styles.transcriptCard, { backgroundColor: theme.colors.glassFill }]}>
            <TextInput
              accessibilityLabel="Shopping transcript"
              multiline
              onChangeText={(text) => voice.setText(text)}
              style={[styles.transcript, { color: theme.colors.label, backgroundColor: theme.colors.backgroundElevated }]}
              testID="voice-transcript"
              textAlignVertical="top"
              value={state.text}
            />
          </View>
          <View style={styles.stretch}>
            <MomentPrimary title={parsing ? 'Adding…' : 'Add to List'} onPress={() => void addItems()} disabled={parsing || state.text.trim() === ''} testID="voice-add" />
          </View>
          {message ? (
            <Text style={[textStyles.body, styles.stretch, { color: theme.colors.danger }]} testID="voice-error">
              {message}
            </Text>
          ) : null}
        </KeyboardAwareScrollView>
        <KeyboardDoneBar />
      </View>
    </MomentSheet>
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
  transcriptCard: { alignSelf: 'stretch', padding: 10, borderRadius: 16 },
  transcript: { minHeight: 120, paddingHorizontal: 5, paddingVertical: 8, fontSize: 17 },
});
