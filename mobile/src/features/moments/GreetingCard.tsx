import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useStore } from 'zustand';

import { KeyboardAwareScrollView } from '../../components/keyboard';
import { Text } from '../../components/Text';
import { TodayBackdrop } from '../../components/TodayShell';
import { withAlpha } from '../../components/SignInBackdrop';
import { useSession } from '../../store/session';
import { brand, textStyles, useTheme } from '../../theme';
import { BorderedButton, caption, ErrorText, headline, IconLabel, KEYBOARD_DONE_BAR_HEIGHT, KeyboardDoneBar, MomentCard, MomentPrimary, MomentSheet, Secondary, title1 } from './components';
import { shareImage } from './device';
import { characterCount, defaultSignature } from './domain';
import { MenuPicker } from './form';
import type { ImageVariation, ManageModel } from './manageModel';

const SERIF = Platform.select({ ios: 'Georgia', default: 'serif' });

/**
 * `FestivalGreetingCard` (ios/App/FestivalServices.swift:83-102): the artwork on a deep purple band,
 * then the title, an orange rule, the greeting and the signature, set in a serif on warm paper.
 */
export function FestivalGreetingCard({ artwork, title, message, signature }: { artwork: string; title: string; message: string; signature: string }) {
  return (
    <View style={styles.card} testID="greeting-card-preview">
      <View style={styles.artworkBand}>
        <Image source={{ uri: artwork }} resizeMode="contain" style={styles.artwork} />
      </View>
      <View style={styles.paper}>
        <Text style={styles.cardTitle}>{title}</Text>
        <View style={styles.rule} />
        <Text style={styles.cardMessage}>{message}</Text>
        {signature.trim() !== '' ? <Text style={styles.cardSignature}>{signature}</Text> : null}
      </View>
    </View>
  );
}

function variationUri(variation: ImageVariation): string {
  return `data:image/jpeg;base64,${variation.base64}`;
}

/**
 * `FestivalGreetingCardEditor` (ios/App/FestivalServices.swift:103-187), presented as a sheet with a
 * trailing Done. `saveOnUse` is the Review Wish variant (`MomentGreetingCardSection`), which saves the
 * card straight away; from Manage Moment it only applies it until "Save Message".
 */
export function GreetingCardEditor({ model, visible, onClose, saveOnUse = false }: { model: ManageModel; visible: boolean; onClose: () => void; saveOnUse?: boolean }) {
  const theme = useTheme();
  const profileName = useSession((state) => state.profile?.name ?? '');
  const title = useStore(model, (state) => state.title);
  const settings = useStore(model, (state) => state.settings);
  const imageUri = useStore(model, (state) => state.imageUri);
  const images = useStore(model, (state) => state.images);
  const generating = useStore(model, (state) => state.generatingImage);
  const busy = useStore(model, (state) => state.busy);
  const error = useStore(model, (state) => state.error);
  const [selected, setSelected] = useState<ImageVariation | null>(null);
  const [shownImages, setShownImages] = useState(images);

  // `.onAppear`: the signature defaults to "With love, <first name> & family".
  useEffect(() => {
    if (visible && model.getState().settings.cardSignature == null) model.getState().updateSettings({ cardSignature: defaultSignature(profileName) });
  }, [model, profileName, visible]);

  // `.onChange(of: model.images.map(\.id)) { selected = model.images.first }`
  if (shownImages !== images) {
    setShownImages(images);
    setSelected(images[0] ?? null);
  }

  const artwork = selected ? variationUri(selected) : imageUri;
  const greeting = settings.cardGreeting ?? settings.baseMessage;
  const signature = settings.cardSignature ?? '';
  const setGreeting = (value: string) => model.getState().updateSettings({ cardGreeting: [...value].slice(0, 500).join('') });
  const setSignature = (value: string) => model.getState().updateSettings({ cardSignature: [...value].slice(0, 80).join('') });

  const close = () => {
    model.getState().cancelImage();
    onClose();
  };

  const share = async () => {
    if (!artwork) return;
    try {
      await shareImage(artwork);
    } catch {
      model.getState().setError('The card could not be prepared for sharing.');
    }
  };

  const use = async () => {
    model.getState().updateSettings({ cardGreeting: greeting });
    if (selected) model.getState().chooseImage(selected);
    if (model.getState().error === null) {
      if (saveOnUse) {
        if (await model.getState().saveGreetingCard()) onClose();
      } else onClose();
    }
  };

  return (
    <MomentSheet visible={visible} title="Greeting Card" onRequestClose={close} right={{ title: 'Done', onPress: close, testID: 'greeting-card-done' }} testID="greeting-card-editor">
      <View style={styles.fill}>
        <TodayBackdrop />
        <KeyboardAwareScrollView bottomOffset={KEYBOARD_DONE_BAR_HEIGHT} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.content}>
          <Text style={[title1, styles.bold, { color: theme.colors.label }]}>A little more personal.</Text>
          <Secondary>Create artwork for your occasion, then finish your card with a greeting and signature.</Secondary>
          {artwork ? (
            <FestivalGreetingCard artwork={artwork} title={title} message={greeting} signature={signature} />
          ) : (
            <View style={[styles.placeholder, { backgroundColor: theme.colors.glassFill }]}>
              <Ionicons name="mail-open" size={54} color={theme.colors.link} />
              <Text style={[textStyles.title2, styles.bold, { color: theme.colors.label }]}>{title}</Text>
              <Secondary>Your greeting card will appear here</Secondary>
            </View>
          )}
          <MomentCard>
            <IconLabel icon="create-outline" title="Make it yours" style={headline} />
            <Text style={[textStyles.subheadline, styles.bold, { color: theme.colors.label }]}>Greeting</Text>
            <TextInput
              accessibilityLabel="Your greeting"
              multiline
              onChangeText={setGreeting}
              placeholder="Your greeting"
              placeholderTextColor={theme.colors.placeholder}
              style={[styles.field, { color: theme.colors.label, minHeight: 66 }]}
              testID="card-greeting"
              value={greeting}
            />
            <View style={[styles.divider, { backgroundColor: theme.colors.separator }]} />
            <Text style={[textStyles.subheadline, styles.bold, { color: theme.colors.label }]}>Your signature</Text>
            <TextInput
              accessibilityLabel="Your signature"
              multiline
              onChangeText={setSignature}
              placeholder="Your signature"
              placeholderTextColor={theme.colors.placeholder}
              style={[styles.field, { color: theme.colors.label }]}
              testID="card-signature"
              value={signature}
            />
            <Text style={[caption, { color: theme.colors.secondaryLabel }]}>{`Appears at the bottom of your card. ${characterCount(signature)}/80`}</Text>
          </MomentCard>
          <MomentCard>
            <IconLabel icon="sparkles" title="Artwork" style={headline} />
            <MenuPicker
              hideLabel
              label="Style"
              options={['Traditional', 'Modern', 'Minimal', 'Colorful', 'Elegant'].map((value) => ({ value, title: value }))}
              value={settings.imageStyle}
              onChange={(value) => model.getState().updateSettings({ imageStyle: value })}
              testID="card-style"
            />
            <MenuPicker
              hideLabel
              label="Artwork format"
              options={['Portrait', 'Square', 'Landscape'].map((value) => ({ value, title: value }))}
              value={settings.imageAspect}
              onChange={(value) => model.getState().updateSettings({ imageAspect: value })}
              testID="card-format"
            />
            <TextInput
              accessibilityLabel="Describe the artwork (optional)"
              multiline
              onChangeText={(value) => model.getState().updateSettings({ imagePrompt: [...value].slice(0, 1000).join('') })}
              placeholder="Describe the artwork (optional)"
              placeholderTextColor={theme.colors.placeholder}
              style={[styles.field, { color: theme.colors.label }]}
              testID="card-prompt"
              value={settings.imagePrompt}
            />
            <Text style={[caption, { color: theme.colors.secondaryLabel }]}>
              Generate sends the occasion, style and scene description to OpenAI. Your greeting, signature and contacts stay out of that request.
            </Text>
            {generating ? (
              <>
                <View style={styles.progress}>
                  <ActivityIndicator />
                  <Secondary>Creating your artwork…</Secondary>
                </View>
                <Pressable accessibilityRole="button" onPress={() => model.getState().cancelImage()} testID="card-cancel-generation">
                  <Text style={[textStyles.body, { color: theme.colors.link }]}>Cancel generation</Text>
                </Pressable>
              </>
            ) : (
              <BorderedButton prominent icon="sparkles" title={artwork ? 'Regenerate Artwork' : 'Generate AI Greeting Card'} onPress={() => model.getState().generateImage()} testID="card-generate" />
            )}
          </MomentCard>
          {images.length > 0 ? (
            <>
              <Text style={[headline, { color: theme.colors.label }]}>Choose artwork</Text>
              <ScrollView horizontal>
                <View style={styles.variations}>
                  {images.map((variation, index) => (
                    <Pressable key={variation.id} accessibilityRole="button" accessibilityLabel={`Choose artwork ${index + 1}`} onPress={() => setSelected(variation)}>
                      <Image
                        source={{ uri: variationUri(variation) }}
                        style={[styles.thumb, { borderColor: selected?.id === variation.id ? brand.nexdoIndigo : 'transparent' }]}
                      />
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            </>
          ) : null}
          {error ? <ErrorText>{error}</ErrorText> : null}
          {artwork ? (
            <>
              <MomentPrimary title="Use This Card" onPress={() => void use()} disabled={busy || generating} testID="card-use" />
              {busy ? (
                <View style={styles.progress}>
                  <ActivityIndicator />
                  <Secondary>Saving card…</Secondary>
                </View>
              ) : null}
              <BorderedButton full icon="share-outline" title="Share Card" onPress={() => void share()} testID="card-share" />
              <Text style={[caption, { color: theme.colors.secondaryLabel }]}>
                {saveOnUse
                  ? 'Use This Card saves the greeting and signature to this moment. Artwork is stored on this device.'
                  : 'Use This Card applies it to this moment. Tap Save Message on the next screen to save your changes.'}
              </Text>
            </>
          ) : null}
        </KeyboardAwareScrollView>
        <KeyboardDoneBar />
      </View>
    </MomentSheet>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: 18, gap: 22, paddingBottom: 60 },
  bold: { fontWeight: '700' },
  card: { borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: withAlpha('#FF9500', 0.25) },
  artworkBand: { height: 230, backgroundColor: 'rgb(38, 20, 89)' },
  artwork: { width: '100%', height: '100%' },
  paper: { backgroundColor: 'rgb(255, 247, 232)', padding: 26, gap: 16, alignItems: 'center' },
  cardTitle: { fontFamily: SERIF, fontSize: 30, lineHeight: 36, fontWeight: '600', color: 'rgb(64, 31, 94)', textAlign: 'center' },
  rule: { width: 48, height: 2, backgroundColor: withAlpha('#FF9500', 0.5) },
  cardMessage: { fontFamily: SERIF, fontSize: 17, lineHeight: 25, color: 'rgb(64, 56, 74)', textAlign: 'center' },
  cardSignature: { fontFamily: SERIF, fontSize: 23, lineHeight: 28, fontWeight: '500', fontStyle: 'italic', color: 'rgb(122, 64, 33)', textAlign: 'center', marginTop: 6 },
  placeholder: { minHeight: 240, borderRadius: 22, alignItems: 'center', justifyContent: 'center', gap: 16 },
  field: { fontSize: 17, paddingVertical: 4, backgroundColor: 'transparent' },
  divider: { height: StyleSheet.hairlineWidth },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  variations: { flexDirection: 'row', gap: 8 },
  thumb: { width: 90, height: 110, borderRadius: 12, borderWidth: 3 },
});
