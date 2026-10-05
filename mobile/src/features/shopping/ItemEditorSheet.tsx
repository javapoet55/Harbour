import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Modal, Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { isApiError } from '../../api/client';
import { shoppingApi, shoppingStoresApi, type GroceryItem } from '../../api/shopping';
import { Text } from '../../components/Text';
import { brand, inputText, textStyles, useTheme } from '../../theme';
import { KeyboardDoneBar, MomentSheet } from '../moments/components';
import { FormField, FormRow, FormScroll, FormSection, FormText, FormToggle, MenuPicker } from '../moments/form';
import { base64ToCacheFile, CAMERA_DENIED, choosePhoto, encodeItemImage, manipulatorEncoder, PHOTO_UNREADABLE, takePicture } from './image';
import { CATEGORIES } from './model';

/**
 * `ShoppingItemEditor` (ios/App/ShoppingItemEditor.swift:5-204): name, category, quantity, size, brand
 * and notes, and the item image — a photo (which can fill the details with AI after its own consent), a
 * picture, or AI artwork. "Add Item" opens straight into the camera from Shopping Detail's camera
 * button (`launchCamera`); cancelling it with no photo closes the editor.
 */

/** `requestRecognition()`'s consent alert (:114-117). */
export const IDENTIFY_TITLE = 'Identify this photo with AI?';
export const IDENTIFY_MESSAGE = 'Send this photo to OpenAI to suggest the item name and visible brand. Review the details before saving.';
export const IDENTIFIED = 'AI suggested these details. Check the name and brand before saving.';
/** A 404 from the route (:179-180). */
export const IDENTIFY_UNAVAILABLE = 'Photo identification is temporarily unavailable. Your photo is still attached. Enter the item name and brand manually, or try again later.';

/** `capitalizeItemName()` (:136-141): the first letter only, once, when the editor opens. */
export function capitalizeFirstLetter(name: string): string {
  const index = name.search(/\p{L}/u);
  if (index === -1) return name;
  const letter = Array.from(name.slice(index))[0];
  return name.slice(0, index) + letter.toUpperCase() + name.slice(index + letter.length);
}

export function ItemEditorSheet({ item, launchCamera = false, onSave, onClose }: { item: GroceryItem | null; launchCamera?: boolean; onSave: (item: GroceryItem) => void; onClose: () => void }) {
  // The sheet is mounted per item, so each presentation starts from a fresh draft as Swift's does.
  return item ? <ItemEditorBody key={item.id} initialItem={item} launchCamera={launchCamera} onSave={onSave} onClose={onClose} /> : null;
}

function ItemEditorBody({ initialItem, launchCamera, onSave, onClose }: { initialItem: GroceryItem; launchCamera: boolean; onSave: (item: GroceryItem) => void; onClose: () => void }) {
  const theme = useTheme();
  // `.onAppear { capitalizeItemName() }`
  const [initial, setInitial] = useState(() => ({ ...initialItem, name: capitalizeFirstLetter(initialItem.name) }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiConsent, setAiConsent] = useState(false);
  const [imageDetails, setImageDetails] = useState('');
  const [imageExpanded, setImageExpanded] = useState(launchCamera);
  const [notice, setNotice] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  // `recognitionConsent`: asked once per editor, the first time a photo could be identified.
  const recognitionConsent = useRef(false);
  // `generation`: a new value abandons a request still in flight (Cancel, a newer photo, or leaving).
  const generation = useRef(0);
  const current = useRef(initial);
  useEffect(() => {
    current.current = initial;
  });
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  const update = (patch: Partial<GroceryItem>) => setInitial((value) => ({ ...value, ...patch }));
  const nameEmpty = initial.name.trim() === '';

  /** `attach(_:)` (:142-156): the image as a small JPEG, or the "too detailed" error. Returns the data. */
  const attach = async (uri: string): Promise<string | null> => {
    setNotice(null);
    try {
      const data = await encodeItemImage(uri, manipulatorEncoder);
      update({ imageData: data });
      setError(null);
      return data;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : PHOTO_UNREADABLE);
      return null;
    }
  };

  /** `identify()` (:161-184): only the fields the user has not changed meanwhile are filled. */
  const identify = async (imageData: string) => {
    const run = ++generation.current;
    setBusy(true);
    setError(null);
    setNotice(null);
    const before = current.current;
    try {
      const result = await shoppingStoresApi.recognize(imageData);
      if (generation.current !== run || current.current.imageData !== imageData) return;
      setInitial((value) => ({
        ...value,
        ...(value.name === before.name ? { name: result.name } : {}),
        ...(value.brand === before.brand ? { brand: result.brand === '' ? null : result.brand } : {}),
        ...(value.category === before.category ? { category: result.category } : {}),
      }));
      setNotice(IDENTIFIED);
    } catch (caught) {
      if (generation.current !== run) return;
      if (isApiError(caught) && caught.status === 404) setError(IDENTIFY_UNAVAILABLE);
      else setError(caught instanceof Error ? caught.message : PHOTO_UNREADABLE);
    } finally {
      if (generation.current === run) setBusy(false);
    }
  };

  /** `requestRecognition()` (:157-160): ask first, once. */
  const requestRecognition = (imageData: string | null | undefined) => {
    if (!imageData) return;
    if (recognitionConsent.current) {
      void identify(imageData);
      return;
    }
    Alert.alert(IDENTIFY_TITLE, IDENTIFY_MESSAGE, [
      {
        text: 'Fill Details',
        onPress: () => {
          recognitionConsent.current = true;
          void identify(imageData);
        },
      },
      { text: 'Enter Manually', style: 'cancel' },
    ]);
  };

  const fromPhotos = async () => {
    const run = ++generation.current;
    try {
      const uri = await choosePhoto();
      if (!uri) return;
      setBusy(true);
      setError(null);
      const data = await attach(uri);
      if (generation.current === run && data) requestRecognition(data);
    } catch {
      if (generation.current === run) setError(PHOTO_UNREADABLE);
    } finally {
      if (generation.current === run) setBusy(false);
    }
  };

  /** `openCamera()` (:185-191) and the camera's `onFinish` (:101-105). */
  const fromCamera = async () => {
    try {
      const uri = await takePicture();
      if (uri) {
        const data = await attach(uri);
        setImageExpanded(true);
        if (data) requestRecognition(data);
      } else if (launchCamera && !current.current.imageData) onClose();
    } catch (caught) {
      if (caught instanceof Error && caught.message === CAMERA_DENIED) {
        // `.alert("Camera access is off", …)` (:118-121).
        Alert.alert('Camera access is off', 'Allow camera access in Settings to take an item photo. You can also choose a photo from your library.', [
          { text: 'Open Settings', onPress: () => void Linking.openSettings() },
          { text: 'Cancel', style: 'cancel' },
        ]);
      } else setError(caught instanceof Error ? caught.message : PHOTO_UNREADABLE);
    }
  };

  // `.task { guard launchCamera && !didLaunchCamera …; await openCamera() }` (:109-113).
  const launched = useRef(false);
  useEffect(() => {
    if (!launchCamera || launched.current) return;
    launched.current = true;
    const timer = setTimeout(() => void fromCamera(), 0);
    return () => clearTimeout(timer);
    // Once, on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const blue = theme.scheme === 'dark' ? '#4DA8FF' : brand.nexdoBlue;
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
          <Text style={[textStyles.largeTitle, styles.bold, styles.title, { color: theme.colors.label }]}>{launchCamera ? 'Add Item' : 'Edit Item'}</Text>
          <FormSection disabled={busy}>
            <FormRow>
              {/* `.textInputAutocapitalization(.sentences).foregroundStyle(Color.nexdoBlue)` (:36-37). */}
              <TextInput
                accessibilityLabel="Item name"
                autoCapitalize="sentences"
                editable={!busy}
                onChangeText={(name) => update({ name })}
                placeholder="Item name"
                placeholderTextColor={theme.colors.placeholder}
                style={[inputText(textStyles.body), styles.field, { color: blue }]}
                testID="item-name"
                value={initial.name}
              />
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
            <FormRow>
              <TextInput
                accessibilityLabel="Brand"
                editable={!busy}
                onChangeText={(value) => update({ brand: value === '' ? null : value })}
                placeholder="Brand"
                placeholderTextColor={theme.colors.placeholder}
                style={[inputText(textStyles.body), styles.field, { color: blue }]}
                testID="shopping.item.brand"
                value={initial.brand ?? ''}
              />
            </FormRow>
            <FormRow last>
              <FormField accessibilityLabel="Notes" multiline placeholder="+ Add Notes" value={initial.notes} onChangeText={(notes) => update({ notes })} testID="item-notes" />
            </FormRow>
          </FormSection>

          <FormSection disabled={busy}>
            {/* `DisclosureGroup("Item Image", isExpanded: $imageExpanded)` (:48). */}
            <FormRow last={!imageExpanded}>
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: imageExpanded }} onPress={() => setImageExpanded(!imageExpanded)} style={styles.disclosure} testID="item-image-toggle">
                <Text style={[textStyles.body, styles.grow, { color: theme.colors.label }]}>Item Image</Text>
                <Ionicons color={theme.colors.label} name={imageExpanded ? 'chevron-down' : 'chevron-forward'} size={17} />
              </Pressable>
            </FormRow>
            {imageExpanded ? (
              <>
                {initial.imageData ? (
                  <>
                    <FormRow>
                      <Pressable
                        accessibilityHint="Opens a full-screen photo with zoom controls"
                        accessibilityLabel="Enlarge item image"
                        accessibilityRole="button"
                        onPress={() => setPreview(true)}
                        style={styles.grow}
                        testID="shopping.photo.preview"
                      >
                        <Image source={{ uri: `data:image/jpeg;base64,${initial.imageData}` }} resizeMode="contain" style={styles.preview} testID="item-image" />
                      </Pressable>
                    </FormRow>
                    <FormRow>
                      <ImageAction
                        destructive
                        title="Remove Image"
                        onPress={() => {
                          update({ imageData: null });
                          setNotice(null);
                        }}
                        testID="item-remove-image"
                      />
                    </FormRow>
                    <FormRow>
                      <ImageAction title="Fill details from photo with AI" onPress={() => requestRecognition(initial.imageData)} testID="shopping.photo.identify" />
                    </FormRow>
                  </>
                ) : (
                  <FormRow>
                    <View style={styles.inline}>
                      <Ionicons name="image-outline" size={24} color={theme.colors.secondaryLabel} />
                      <FormText tone="secondary">Attach a photo or create an illustration</FormText>
                    </View>
                  </FormRow>
                )}
                <FormRow>
                  <ImageAction icon="images-outline" title="Choose from Photos" onPress={() => void fromPhotos()} testID="item-photos" />
                </FormRow>
                <FormRow>
                  <ImageAction icon="camera-outline" title="Take a Picture" onPress={() => void fromCamera()} testID="item-camera" />
                </FormRow>
                <FormRow>
                  <FormField multiline placeholder="Describe the image (optional)" value={imageDetails} onChangeText={setImageDetails} testID="item-image-details" />
                </FormRow>
                <FormRow>
                  <FormToggle label="Allow AI image generation" value={aiConsent} onValueChange={setAiConsent} testID="item-ai-consent" />
                </FormRow>
                <FormRow last>
                  <ImageAction icon="sparkles" title="Generate with AI" disabled={!aiConsent || nameEmpty} onPress={() => void generate()} testID="item-generate" />
                </FormRow>
              </>
            ) : null}
          </FormSection>
          {notice ? (
            <View style={styles.status}>
              <FormText caption tone="secondary" testID="item-notice">
                {notice}
              </FormText>
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
        {/* The "I’m working…" overlay (:78-93). */}
        {busy ? (
          <View style={styles.overlay} testID="shopping.item.working">
            <View style={[styles.working, { backgroundColor: theme.scheme === 'dark' ? 'rgba(44, 44, 46, 0.96)' : 'rgba(242, 242, 247, 0.96)' }]}>
              <ActivityIndicator color={theme.colors.link} size="large" />
              <Text style={[styles.headline, { color: theme.colors.ink }]}>I’m working…</Text>
            </View>
          </View>
        ) : null}
        {initial.imageData ? <PhotoPreview data={initial.imageData} onClose={() => setPreview(false)} visible={preview} /> : null}
      </View>
    </MomentSheet>
  );
}

/** `ShoppingPhotoPreview` (:225-258): full screen on black, pinch or buttons to zoom from 1× to 5×. */
function PhotoPreview({ data, visible, onClose }: { data: string; visible: boolean; onClose: () => void }) {
  const window = useWindowDimensions();
  const [scale, setScale] = useState(1);
  const zoom = (value: number) => setScale(Math.min(5, Math.max(1, value)));
  return (
    <Modal animationType="fade" onRequestClose={onClose} presentationStyle="fullScreen" visible={visible}>
      <SafeAreaView style={styles.previewScreen} testID="item-photo-preview">
        <View style={styles.previewBar}>
          <Pressable accessibilityRole="button" hitSlop={8} onPress={onClose} testID="shopping.photo.preview.done">
            <Text style={[textStyles.body, { color: brand.nexdoBlue }]}>Done</Text>
          </Pressable>
          <Text style={[styles.headline, styles.grow, styles.center, { color: '#FFFFFF' }]}>Item Image</Text>
          <Pressable accessibilityLabel="Zoom out" accessibilityRole="button" accessibilityState={{ disabled: scale <= 1 }} disabled={scale <= 1} hitSlop={8} onPress={() => zoom(scale - 1)} testID="photo-zoom-out">
            <Ionicons color={scale <= 1 ? 'rgba(255,255,255,0.3)' : brand.nexdoBlue} name="remove-circle-outline" size={24} />
          </Pressable>
          <Pressable accessibilityLabel="Zoom in" accessibilityRole="button" accessibilityState={{ disabled: scale >= 5 }} disabled={scale >= 5} hitSlop={8} onPress={() => zoom(scale + 1)} testID="photo-zoom-in">
            <Ionicons color={scale >= 5 ? 'rgba(255,255,255,0.3)' : brand.nexdoBlue} name="add-circle-outline" size={24} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.centredContent} horizontal maximumZoomScale={5} minimumZoomScale={1} showsHorizontalScrollIndicator={false}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Image accessibilityLabel="Item photo" resizeMode="contain" source={{ uri: `data:image/jpeg;base64,${data}` }} style={{ width: window.width * scale, height: (window.height - 120) * scale }} testID="item-photo-zoomed" />
          </ScrollView>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

/**
 * A `Button { … } label: { Label(_, systemImage:) }` row in the Item `Form`. Measured off
 * `shopping-item-editor.png`: when disabled, iOS 26 keeps the glyph in the tint and draws the title in
 * `.label` — it does not dim the row.
 */
function ImageAction({ icon, title, onPress, disabled = false, destructive = false, testID }: { icon?: keyof typeof Ionicons.glyphMap; title: string; onPress: () => void; disabled?: boolean; destructive?: boolean; testID: string }) {
  const theme = useTheme();
  const color = destructive ? theme.colors.danger : theme.colors.link;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={styles.action} testID={testID}>
      {icon ? <Ionicons name={icon} size={24} color={theme.colors.link} /> : null}
      <Text style={[textStyles.body, { color: disabled ? theme.colors.label : color }]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  action: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 32 },
  fill: { flex: 1 },
  grow: { flex: 1 },
  center: { textAlign: 'center' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bold: { fontWeight: '700' },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  title: { marginHorizontal: 16, marginTop: -20 },
  field: { flex: 1, paddingVertical: 8, backgroundColor: 'transparent' },
  disclosure: { flex: 1, flexDirection: 'row', alignItems: 'center', minHeight: 32 },
  preview: { width: '100%', height: 200 },
  status: { marginHorizontal: 32, marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0, 0, 0, 0.08)' },
  working: { alignItems: 'center', gap: 16, padding: 28, borderRadius: 24 },
  previewScreen: { flex: 1, backgroundColor: '#000000' },
  previewBar: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 16, minHeight: 50 },
  centredContent: { alignItems: 'center' },
});
