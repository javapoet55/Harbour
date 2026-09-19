import Ionicons from '@expo/vector-icons/Ionicons';
import { useRef, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';

import { shoppingApi, type GroceryItem } from '../../api/shopping';
import { Text } from '../../components/Text';
import { textStyles, useTheme } from '../../theme';
import { KeyboardDoneBar, MomentSheet } from '../moments/components';
import { FormButton, FormField, FormRow, FormScroll, FormSection, FormText, FormToggle, MenuPicker } from '../moments/form';
import { base64ToCacheFile, choosePhoto, encodeItemImage, manipulatorEncoder, PHOTO_UNREADABLE, takePicture } from './image';
import { CATEGORIES } from './model';

/**
 * `ShoppingItemEditor` (ios/App/ShoppingItemEditor.swift:5-97): name, category, quantity, size, notes,
 * and the item image — a photo, a picture, or AI artwork after explicit consent. Nothing is sent until
 * Save, which is disabled while the name is empty (or an image is being prepared).
 */
export function ItemEditorSheet({ item, onSave, onClose }: { item: GroceryItem | null; onSave: (item: GroceryItem) => void; onClose: () => void }) {
  // The sheet is mounted per item, so each presentation starts from a fresh draft as Swift's does.
  return item ? <ItemEditorBody key={item.id} initialItem={item} onSave={onSave} onClose={onClose} /> : null;
}

function ItemEditorBody({ initialItem, onSave, onClose }: { initialItem: GroceryItem; onSave: (item: GroceryItem) => void; onClose: () => void }) {
  const theme = useTheme();
  const [initial, setInitial] = useState(initialItem);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiConsent, setAiConsent] = useState(false);
  const [imageDetails, setImageDetails] = useState('');
  // `generation`: a new value abandons an image request still in flight (Cancel, or leaving).
  const generation = useRef(0);
  const update = (patch: Partial<GroceryItem>) => setInitial((value) => ({ ...value, ...patch }));
  const nameEmpty = initial.name.trim() === '';

  const attach = async (uri: string) => {
    try {
      const data = await encodeItemImage(uri, manipulatorEncoder);
      update({ imageData: data });
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : PHOTO_UNREADABLE);
    }
  };

  const fromPhotos = async () => {
    try {
      const uri = await choosePhoto();
      if (!uri) return;
      setBusy(true);
      setError(null);
      await attach(uri);
    } catch {
      setError(PHOTO_UNREADABLE);
    } finally {
      setBusy(false);
    }
  };

  const fromCamera = async () => {
    try {
      const uri = await takePicture();
      if (uri) await attach(uri);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : PHOTO_UNREADABLE);
    }
  };

  const generate = async () => {
    setBusy(true);
    setError(null);
    const run = ++generation.current;
    try {
      const response = await shoppingApi.image({ name: initial.name, details: imageDetails, consent: aiConsent });
      if (generation.current !== run) return;
      if (typeof response.data !== 'string' || response.data === '') throw new Error(PHOTO_UNREADABLE);
      await attach(base64ToCacheFile(response.data));
    } catch (caught) {
      if (generation.current === run) setError(caught instanceof Error ? caught.message : PHOTO_UNREADABLE);
    } finally {
      if (generation.current === run) setBusy(false);
    }
  };

  const cancel = () => {
    generation.current++;
    onClose();
  };

  return (
    <MomentSheet
      visible
      title=""
      onRequestClose={cancel}
      left={{ title: 'Cancel', onPress: cancel, testID: 'item-cancel' }}
      right={{
        title: 'Save',
        bold: true,
        disabled: busy || nameEmpty,
        onPress: () => {
          onSave(initial);
          onClose();
        },
        testID: 'item-save',
      }}
      testID="item-editor-sheet"
    >
    <View style={styles.fill}>
      <FormScroll testID="item-editor">
        <Text style={[textStyles.largeTitle, styles.bold, styles.title, { color: theme.colors.label }]}>Item</Text>
        <FormSection>
          <FormRow>
            <FormField placeholder="Item name" value={initial.name} onChangeText={(name) => update({ name })} testID="item-name" />
          </FormRow>
          <FormRow>
            <MenuPicker label="Category" options={CATEGORIES.map((value) => ({ value, title: value }))} value={initial.category} onChange={(category) => update({ category })} testID="item-category" />
          </FormRow>
          <FormRow>
            <View style={styles.inline}>
              <FormText>Quantity</FormText>
              <View style={styles.grow}>
                <FormField placeholder="1" align="right" keyboardType="decimal-pad" value={initial.quantity} onChangeText={(quantity) => update({ quantity })} testID="item-quantity" accessibilityLabel="Quantity" />
              </View>
            </View>
          </FormRow>
          <FormRow>
            <FormField placeholder="Size, e.g. 1 gallon or 500 g" value={initial.size} onChangeText={(size) => update({ size })} testID="item-size" />
          </FormRow>
          <FormRow last>
            <FormField multiline placeholder="Brand or notes" value={initial.notes} onChangeText={(notes) => update({ notes })} testID="item-notes" />
          </FormRow>
        </FormSection>

        <FormSection header="Item Image" disabled={busy}>
          {initial.imageData ? (
            <>
              <FormRow>
                <Image accessibilityLabel="Attached item image" source={{ uri: `data:image/jpeg;base64,${initial.imageData}` }} resizeMode="contain" style={styles.preview} testID="item-image" />
              </FormRow>
              <FormRow>
                <FormButton destructive title="Remove Image" onPress={() => update({ imageData: null })} testID="item-remove-image" />
              </FormRow>
            </>
          ) : (
            <FormRow>
              <View style={styles.inline}>
                <Ionicons name="image-outline" size={20} color={theme.colors.secondaryLabel} />
                <FormText tone="secondary">Attach a photo or create an illustration</FormText>
              </View>
            </FormRow>
          )}
          <FormRow>
            <FormButton icon="images-outline" title="Choose from Photos" onPress={() => void fromPhotos()} testID="item-photos" />
          </FormRow>
          <FormRow>
            <FormButton icon="camera-outline" title="Take a Picture" onPress={() => void fromCamera()} testID="item-camera" />
          </FormRow>
          <FormRow>
            <FormField multiline placeholder="Describe the image (optional)" value={imageDetails} onChangeText={setImageDetails} testID="item-image-details" />
          </FormRow>
          <FormRow>
            <FormToggle label="Allow AI image generation" value={aiConsent} onValueChange={setAiConsent} testID="item-ai-consent" />
          </FormRow>
          <FormRow>
            <FormText caption tone="secondary">
              AI receives the item name and image description. Photos you attach are not sent to AI. The image is saved with the item when you tap Save.
            </FormText>
          </FormRow>
          <FormRow last>
            <FormButton icon="sparkles" title="Generate with AI" disabled={!aiConsent || nameEmpty} onPress={() => void generate()} testID="item-generate" />
          </FormRow>
        </FormSection>
        {busy ? (
          <View style={styles.status}>
            <ActivityIndicator />
            <FormText tone="secondary">Preparing image…</FormText>
          </View>
        ) : null}
        {error ? (
          <View style={styles.status}>
            <FormText tone="danger" testID="item-error">
              {error}
            </FormText>
          </View>
        ) : null}
      </FormScroll>
      <KeyboardDoneBar />
    </View>
    </MomentSheet>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flex: 1 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bold: { fontWeight: '700' },
  title: { marginHorizontal: 16, marginTop: -20 },
  preview: { width: '100%', height: 200 },
  status: { marginHorizontal: 32, marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
});
