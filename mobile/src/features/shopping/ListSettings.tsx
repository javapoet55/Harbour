import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, TextInput, View } from 'react-native';

import type { GroceryList, ShoppingStoreSuggestion } from '../../api/shopping';
import { Text } from '../../components/Text';
import { inputText, textStyles, useTheme } from '../../theme';
import { MomentSheet } from '../moments/components';
import { momentDate, momentDay } from '../moments/dates';
import { DateField, FormField, FormRow, FormScroll, FormSection, FormText, FormToggle } from '../moments/form';
import { StoreFinderPage, StoreHoursPage } from './StorePages';
import { addressZip, fullAddress, mapsUrl, storeAddress, type ShoppingStoreAddress } from './storeAddress';
import { withStoreName } from './listLogo';
import { LogoEditButton, LogoEditorPage, type LogoEditorDeps } from './LogoEditor';

/**
 * `ShoppingSettings` (ios/App/ShoppingViews.swift:651-700): name, date and weekly repeat, then "Store
 * details" — Add New Store (Stores Near You), the store's name and two address lines, Directions, and
 * Store Hours. Save, disabled while the name is empty or the ZIP is not a US ZIP.
 *
 * Android ahead of iOS (§24 bug 2): Swift's only toolbar button is Save and the sheet cannot be swiped
 * away, so leaving without saving means finding its top edge. Here **Cancel** closes it and discards the
 * draft; the system back does the same on the settings page.
 *
 * Swift pushes Stores Near You and Store Hours inside the sheet's `NavigationStack`; here they are
 * pages of the same sheet, with Back. The Store Logo editor (bdb68ce) is a sheet over this one in Swift;
 * it is a page here too, with Swift's Done, since Android cannot stack a second sheet on this modal.
 */

const ZIP = /^[0-9]{5}(-[0-9]{4})?$/;

/** The Save button's rule (:682). */
export function settingsSavable(list: Pick<GroceryList, 'title' | 'storeZip'>): boolean {
  const zip = list.storeZip ?? '';
  return list.title.trim() !== '' && (zip === '' || ZIP.test(zip));
}

/** `onSelect` (:657-663): the store replaces every store field, and drops the old store's logo (bdb68ce). */
export function withStore(list: GroceryList, store: ShoppingStoreSuggestion): GroceryList {
  return { ...list, storeLogoData: null, storePlaceId: store.id, storeWebsite: store.website ?? null, storeName: store.name, storeAddress: store.address, storeZip: store.zip };
}

/** `updateAddress(street:locality:)` (:684-691): a typed address is no longer the chosen place. */
export function withAddress(list: GroceryList, lines: ShoppingStoreAddress): GroceryList {
  return { ...list, storeAddress: fullAddress(lines), storeZip: addressZip(lines), storePlaceId: null, storeWebsite: null };
}

/** The store a logo lookup would resolve: its name, website and place (the logo itself is separate). */
function sameStore(a: GroceryList, b: GroceryList): boolean {
  return (a.storeName ?? null) === (b.storeName ?? null) && (a.storeWebsite ?? null) === (b.storeWebsite ?? null) && (a.storePlaceId ?? null) === (b.storePlaceId ?? null);
}

/**
 * `automaticLookup` for List Settings' logo (ce6d20a, :672-675): only while the draft's store is the one the
 * server has saved for this list, since `store-brand` resolves the SAVED store by list id. A newly picked
 * or typed store shows the cart until it is saved.
 */
export function logoLookupAllowed(saved: GroceryList, draft: GroceryList): boolean {
  return saved.id === draft.id && sameStore(saved, draft);
}

/** A change the detail screen holds back until the server confirms it (`save(_:)`, ce6d20a, :516-522). */
export function storeChanged(original: GroceryList, next: GroceryList): boolean {
  return !sameStore(original, next) || (original.storeLogoData ?? null) !== (next.storeLogoData ?? null);
}

type Page = 'settings' | 'stores' | 'hours' | 'logo';

export function ListSettingsSheet({
  visible,
  list,
  onSave,
  onClose,
  logoDeps,
}: {
  visible: boolean;
  list: GroceryList;
  onSave: (list: GroceryList) => void;
  onClose: () => void;
  /** Test seam for the logo editor's photo, clipboard and encoder. */
  logoDeps?: LogoEditorDeps;
}) {
  const [draft, setDraft] = useState(list);
  const [lines, setLines] = useState(() => storeAddress(list.storeAddress, list.storeZip));
  const [page, setPage] = useState<Page>('settings');
  // The editor's `loading` and `failure` (ShoppingListLogoEditor.swift:14-15): Done is off while loading.
  const [logoLoading, setLogoLoading] = useState(false);
  const [logoFailure, setLogoFailure] = useState<string | null>(null);
  const [shown, setShown] = useState(visible);
  // A fresh copy of the list each time the sheet opens, as Swift's `@State var initial` is.
  if (shown !== visible) {
    setShown(visible);
    if (visible) {
      setDraft(list);
      setLines(storeAddress(list.storeAddress, list.storeZip));
      setPage('settings');
    }
  }
  // A push inside the sheet's own `NavigationStack` in Swift: the system back, an ink chevron on glass
  // (`shopping-store-hours`, `shopping-stores-results`).
  const back = { title: 'Back', icon: 'back' as const, onPress: () => setPage('settings'), testID: 'list-settings-back' };
  return (
    <MomentSheet
      visible={visible}
      title={page === 'stores' ? 'Stores Near You' : page === 'hours' ? 'Store Hours' : page === 'logo' ? 'Store Logo' : ''}
      onRequestClose={page === 'settings' ? onClose : page === 'logo' ? () => !logoLoading && setPage('settings') : () => setPage('settings')}
      left={page === 'settings' ? { title: 'Cancel', onPress: onClose, testID: 'list-settings-cancel' } : page === 'logo' ? undefined : back}
      right={
        page === 'logo'
          ? { title: 'Done', bold: true, disabled: logoLoading, onPress: () => setPage('settings'), testID: 'store-logo-done' }
          : page === 'settings'
          ? {
              title: 'Save',
              disabled: !settingsSavable(draft),
              bold: true,
              onPress: () => {
                onSave(draft);
                onClose();
              },
              testID: 'list-settings-save',
            }
          : undefined
      }
      plain={page === 'stores'}
      testID="list-settings-sheet"
    >
      {page === 'stores' ? (
        <StoreFinderPage
          initialArea={draft.storeZip ?? ''}
          onSelect={(store) => {
            setDraft(withStore(draft, store));
            setLines(storeAddress(store.address, store.zip));
            setPage('settings');
          }}
        />
      ) : page === 'logo' ? (
        <LogoEditorPage
          deps={logoDeps}
          failure={logoFailure}
          automaticLookup={logoLookupAllowed(list, draft)}
          imageData={draft.storeLogoData}
          listId={draft.id}
          loading={logoLoading}
          onChange={(storeLogoData) => setDraft({ ...draft, storeLogoData })}
          setFailure={setLogoFailure}
          setLoading={setLogoLoading}
          storeName={draft.storeName ?? ''}
          website={draft.storeWebsite}
        />
      ) : page === 'hours' ? (
        <StoreHoursPage
          mapsUrl={mapsUrl({ name: draft.storeName, address: draft.storeAddress, placeId: draft.storePlaceId, directions: false })}
          name={draft.storeName ?? 'Store'}
          placeId={draft.storePlaceId ?? null}
        />
      ) : (
        <SettingsPage
          automaticLookup={logoLookupAllowed(list, draft)}
          draft={draft}
          lines={lines}
          onAddress={(next) => {
            setLines(next);
            setDraft(withAddress(draft, next));
          }}
          onPage={(next) => {
            if (next === 'logo') setLogoFailure(null);
            setPage(next);
          }}
          setDraft={setDraft}
        />
      )}
    </MomentSheet>
  );
}

function SettingsPage({
  automaticLookup,
  draft,
  setDraft,
  lines,
  onAddress,
  onPage,
}: {
  automaticLookup: boolean;
  draft: GroceryList;
  setDraft: (list: GroceryList) => void;
  lines: ShoppingStoreAddress;
  onAddress: (lines: ShoppingStoreAddress) => void;
  onPage: (page: Page) => void;
}) {
  const theme = useTheme();
  const directions = mapsUrl({ name: draft.storeName, address: draft.storeAddress, placeId: draft.storePlaceId, directions: true });
  const address = (value: string, placeholder: string, onChange: (next: string) => void, maxHeight: number, testID: string) => (
    <TextInput
      accessibilityLabel={placeholder}
      multiline
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={theme.colors.placeholder}
      style={[inputText(textStyles.body), styles.address, { maxHeight, color: theme.colors.label }]}
      testID={testID}
      value={value}
    />
  );
  return (
    <FormScroll testID="list-settings">
      <Text style={[textStyles.largeTitle, styles.bold, styles.sheetTitle, { color: theme.colors.label }]}>List Settings</Text>
      <FormSection>
        <FormRow>
          <FormField placeholder="List name" value={draft.title} onChangeText={(title) => setDraft({ ...draft, title })} testID="list-settings-name" />
        </FormRow>
        <FormRow>
          <DateField
            label="Shopping date"
            value={momentDate(draft.date, draft.timeZone)}
            onChange={(value) => setDraft({ ...draft, date: momentDay(value, draft.timeZone) })}
            zone={draft.timeZone}
            testID="list-settings-date"
          />
        </FormRow>
        <FormRow>
          <FormToggle label="Repeat weekly" value={draft.weekly} onValueChange={(weekly) => setDraft({ ...draft, weekly })} testID="list-settings-weekly" />
        </FormRow>
        <FormRow last>
          <FormText>Next week’s list is created when you complete this trip.</FormText>
        </FormRow>
      </FormSection>
      <FormSection header="Store details" footer="Used to find offers for your store location. Verified sources are required; some stores are not available yet.">
        <FormRow>
          <LinkRow icon="add" title="Add New Store" chevron onPress={() => onPage('stores')} testID="shopping-add-store" />
        </FormRow>
        <FormRow>
          {/* Typing a name forgets the chosen place and its logo (:671); the logo editor sits beside it
              (`HStack(spacing: 14)`, :670-674). */}
          <View style={styles.storeName}>
            <View style={styles.grow}>
              <FormField
                placeholder="Store name"
                value={draft.storeName ?? ''}
                onChangeText={(storeName) => setDraft(withStoreName(draft, storeName))}
                testID="list-settings-store-name"
              />
            </View>
            <LogoEditButton
              automaticLookup={automaticLookup}
              identity={`${draft.storeName ?? ''}|${draft.storeWebsite ?? ''}`}
              imageData={draft.storeLogoData}
              listId={draft.id}
              onPress={() => onPage('logo')}
            />
          </View>
        </FormRow>
        <FormRow>{address(lines.street, 'Street address', (street) => onAddress({ ...lines, street }), 3 * 22 + 16, 'list-settings-street')}</FormRow>
        <FormRow>{address(lines.locality, 'City, state and ZIP code', (locality) => onAddress({ ...lines, locality }), 2 * 22 + 16, 'list-settings-locality')}</FormRow>
        {directions ? (
          <FormRow>
            <LinkRow icon="navigate-circle-outline" title="Directions" tinted onPress={() => void Linking.openURL(directions)} testID="list-settings-directions" />
          </FormRow>
        ) : null}
        <FormRow last>
          <LinkRow icon="time-outline" title="Store Hours" chevron onPress={() => onPage('hours')} testID="list-settings-hours" />
        </FormRow>
      </FormSection>
    </FormScroll>
  );
}

/** A `Label` row: a tinted glyph, the title (tinted for a `Link`), and a chevron for a `NavigationLink`. */
function LinkRow({ icon, title, onPress, chevron = false, tinted = false, testID }: { icon: keyof typeof Ionicons.glyphMap; title: string; onPress: () => void; chevron?: boolean; tinted?: boolean; testID: string }) {
  const theme = useTheme();
  return (
    <Pressable accessibilityLabel={title} accessibilityRole={tinted ? 'link' : 'button'} onPress={onPress} style={styles.link} testID={testID}>
      <Ionicons color={theme.colors.link} name={icon} size={22} />
      <Text style={[textStyles.body, styles.grow, { color: tinted ? theme.colors.link : theme.colors.label }]}>{title}</Text>
      {chevron ? <Ionicons color={theme.colors.secondaryLabel} name="chevron-forward" size={17} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bold: { fontWeight: '700' },
  grow: { flex: 1 },
  sheetTitle: { marginHorizontal: 16, marginTop: 4 },
  address: { flex: 1, paddingVertical: 8, backgroundColor: 'transparent' },
  link: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 44 },
  storeName: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 4 },
});
