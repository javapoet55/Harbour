import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '../../components/Text';
import { textStyles, useTheme } from '../../theme';
import { FormRow, FormScroll, FormSection, FormText } from '../moments/form';
import { base64ToCacheFile, choosePhoto, manipulatorEncoder, type ImageEncoder } from './image';
import { encodeLogoImage, LOGO_NO_CLIPBOARD_IMAGE, LOGO_TOO_LARGE, LOGO_UNOPENABLE, LOGO_UNREADABLE, logoSearchUrl } from './listLogo';
import { StoreBrandLogo } from './StoreBrandLogo';

/**
 * `ShoppingListLogoEditor` (ios/App/ShoppingListLogoEditor.swift, bdb68ce): the pencil-badged logo
 * beside List Settings' Store name, and the Store Logo page it opens. The logo is the list's own; it is
 * saved with the list when List Settings is saved ("Tap Save in List Settings to keep your changes").
 */

/** The 48-point logo with `pencil.circle.fill` in the corner (:23-31). */
export function LogoEditButton({ listId, identity, imageData, onPress }: { listId: string; identity: string; imageData: string | null | undefined; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable accessibilityLabel="Change store logo" accessibilityRole="button" hitSlop={4} onPress={onPress} testID="shopping-edit-store-logo">
      <StoreBrandLogo customImageData={imageData} identity={identity} listId={listId} size={48} />
      <View pointerEvents="none" style={[styles.badge, { backgroundColor: theme.colors.link }]}>
        <Ionicons color="#FFFFFF" name="pencil" size={11} />
      </View>
    </Pressable>
  );
}

export type LogoEditorDeps = {
  /** `PhotosPicker`: a URI, or `null` when cancelled. */
  choosePhoto: () => Promise<string | null>;
  /** `UIPasteboard.general.image`: a file URI, or `null` when there is no image. */
  pastedImage: () => Promise<string | null>;
  encoder: ImageEncoder;
  openUrl: (url: string) => void;
};

async function clipboardImage(): Promise<string | null> {
  if (!(await Clipboard.hasImageAsync())) return null;
  const image = await Clipboard.getImageAsync({ format: 'png' });
  if (!image) return null;
  // The manipulator reads files: the PNG goes through the cache, as AI artwork does (image.ts).
  return base64ToCacheFile(image.data.replace(/^data:image\/[a-z]+;base64,/, ''), 'png');
}

export const deviceLogoEditor: LogoEditorDeps = {
  choosePhoto,
  pastedImage: clipboardImage,
  encoder: manipulatorEncoder,
  openUrl: (url) => void Linking.openURL(url),
};

/**
 * The sheet's `Form` (:33-70): the logo at 100 points over the store name; Search Google Images
 * (off without a name) and its hint; Choose from Photos; Paste copied image; Use automatic store logo
 * (only with a custom logo); the footer; "Loading image…" and the failure in red. `onLoading` lets the
 * sheet disable Done while an image is being read (`.disabled(loading)`).
 */
export function LogoEditorPage({
  listId,
  storeName,
  website,
  imageData,
  onChange,
  loading,
  failure,
  setLoading,
  setFailure,
  deps = deviceLogoEditor,
}: {
  listId: string;
  storeName: string;
  website: string | null | undefined;
  imageData: string | null | undefined;
  onChange: (imageData: string | null) => void;
  loading: boolean;
  failure: string | null;
  setLoading: (loading: boolean) => void;
  setFailure: (failure: string | null) => void;
  deps?: LogoEditorDeps;
}) {
  const theme = useTheme();
  const identity = [storeName, website ?? ''].join('|');
  const search = logoSearchUrl(storeName);

  /** Read an image, then `apply(_:)`: the failure Swift shows for each way it can go wrong. */
  const applyImage = async (read: () => Promise<string | null>, unreadable: string) => {
    setFailure(null);
    let uri: string | null;
    try {
      uri = await read();
    } catch {
      setFailure(unreadable);
      return;
    }
    if (uri === null) return;
    setLoading(true);
    try {
      onChange(await encodeLogoImage(uri, deps.encoder));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '';
      setFailure(message === LOGO_TOO_LARGE || message === LOGO_UNOPENABLE ? message : LOGO_UNREADABLE);
    } finally {
      setLoading(false);
    }
  };

  const paste = async () => {
    setFailure(null);
    const uri = await deps.pastedImage().catch(() => null);
    if (uri === null) {
      setFailure(LOGO_NO_CLIPBOARD_IMAGE);
      return;
    }
    await applyImage(async () => uri, LOGO_UNREADABLE);
  };

  return (
    <FormScroll testID="store-logo-editor">
      <FormSection disabled={loading}>
        <FormRow>
          <View style={styles.preview}>
            <StoreBrandLogo customImageData={imageData} identity={identity} listId={listId} size={100} />
          </View>
        </FormRow>
        <FormRow last>
          <Text style={[textStyles.body, styles.centred, { color: theme.colors.label }]} testID="store-logo-name">
            {storeName === '' ? 'Store logo' : storeName}
          </Text>
        </FormRow>
      </FormSection>
      <FormSection disabled={loading} footer="This logo applies to this shopping list. Tap Save in List Settings to keep your changes.">
        <FormRow separatorInset={52}>
          <Row disabled={search === null} icon="search" onPress={() => search && deps.openUrl(search)} testID="store-logo-search" title="Search Google Images" />
        </FormRow>
        <FormRow>
          <FormText caption tone="secondary">
            Search for your store’s logo. Copy the image or save it to Photos, then return here to select it.
          </FormText>
        </FormRow>
        <FormRow separatorInset={52}>
          <Row icon="image-outline" onPress={() => void applyImage(deps.choosePhoto, LOGO_UNOPENABLE)} testID="store-logo-photos" tinted title="Choose from Photos" />
        </FormRow>
        <FormRow last={!imageData} separatorInset={52}>
          <Row icon="clipboard-outline" onPress={() => void paste()} testID="store-logo-paste" tinted title="Paste copied image" />
        </FormRow>
        {imageData ? (
          <FormRow last>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                onChange(null);
                setFailure(null);
              }}
              style={styles.row}
              testID="store-logo-automatic"
            >
              <Text style={[textStyles.body, { color: theme.colors.danger }]}>Use automatic store logo</Text>
            </Pressable>
          </FormRow>
        ) : null}
      </FormSection>
      {loading ? (
        <View style={styles.loading} testID="store-logo-loading">
          <ActivityIndicator color={theme.colors.secondaryLabel} />
          <Text style={[textStyles.body, { color: theme.colors.secondaryLabel }]}>Loading image…</Text>
        </View>
      ) : null}
      {failure ? (
        <Text style={[textStyles.body, styles.failure, { color: theme.colors.danger }]} testID="store-logo-failure">
          {failure}
        </Text>
      ) : null}
    </FormScroll>
  );
}

/**
 * A `Button(_:systemImage:)` row: the glyph in the tint; the title in the tint, or — as the capture
 * shows Search Google Images without a store name — in the label colour when disabled.
 */
function Row({ title, icon, onPress, disabled = false, tinted = false, testID }: { title: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void; disabled?: boolean; tinted?: boolean; testID: string }) {
  const theme = useTheme();
  return (
    <Pressable accessibilityLabel={title} accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={styles.row} testID={testID}>
      <Ionicons color={theme.colors.link} name={icon} size={22} />
      <Text style={[textStyles.body, styles.grow, { color: tinted && !disabled ? theme.colors.link : theme.colors.label }]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: { position: 'absolute', right: -2, bottom: -2, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#FFFFFF' },
  preview: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  centred: { flex: 1, textAlign: 'center' },
  grow: { flex: 1 },
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 44 },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 32, marginTop: 8 },
  failure: { marginHorizontal: 32, marginTop: 8 },
});
