import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, TextInput } from 'react-native';

import type { GroceryList, ShoppingStoreSuggestion } from '../../api/shopping';
import { Text } from '../../components/Text';
import { inputText, textStyles, useTheme } from '../../theme';
import { MomentSheet } from '../moments/components';
import { momentDate, momentDay } from '../moments/dates';
import { DateField, FormField, FormRow, FormScroll, FormSection, FormText, FormToggle } from '../moments/form';
import { StoreFinderPage, StoreHoursPage } from './StorePages';
import { addressZip, fullAddress, mapsUrl, storeAddress, type ShoppingStoreAddress } from './storeAddress';

/**
 * `ShoppingSettings` (ios/App/ShoppingViews.swift:642-692): name, date and weekly repeat, then "Store
 * details" — Add New Store (Stores Near You), the store's name and two address lines, Directions, and
 * Store Hours. Save only, disabled while the name is empty or the ZIP is not a US ZIP.
 *
 * Swift pushes Stores Near You and Store Hours inside the sheet's `NavigationStack`; here they are
 * pages of the same sheet, with Back.
 */

const ZIP = /^[0-9]{5}(-[0-9]{4})?$/;

/** The Save button's rule (:682). */
export function settingsSavable(list: Pick<GroceryList, 'title' | 'storeZip'>): boolean {
  const zip = list.storeZip ?? '';
  return list.title.trim() !== '' && (zip === '' || ZIP.test(zip));
}

/** `onSelect` (:657-663): the store replaces every store field. */
export function withStore(list: GroceryList, store: ShoppingStoreSuggestion): GroceryList {
  return { ...list, storePlaceId: store.id, storeWebsite: store.website ?? null, storeName: store.name, storeAddress: store.address, storeZip: store.zip };
}

/** `updateAddress(street:locality:)` (:684-691): a typed address is no longer the chosen place. */
export function withAddress(list: GroceryList, lines: ShoppingStoreAddress): GroceryList {
  return { ...list, storeAddress: fullAddress(lines), storeZip: addressZip(lines), storePlaceId: null, storeWebsite: null };
}

type Page = 'settings' | 'stores' | 'hours';

export function ListSettingsSheet({ visible, list, onSave, onClose }: { visible: boolean; list: GroceryList; onSave: (list: GroceryList) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(list);
  const [lines, setLines] = useState(() => storeAddress(list.storeAddress, list.storeZip));
  const [page, setPage] = useState<Page>('settings');
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
      title={page === 'stores' ? 'Stores Near You' : page === 'hours' ? 'Store Hours' : ''}
      onRequestClose={page === 'settings' ? onClose : () => setPage('settings')}
      left={page === 'settings' ? undefined : back}
      right={
        page === 'settings'
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
      ) : page === 'hours' ? (
        <StoreHoursPage
          mapsUrl={mapsUrl({ name: draft.storeName, address: draft.storeAddress, placeId: draft.storePlaceId, directions: false })}
          name={draft.storeName ?? 'Store'}
          placeId={draft.storePlaceId ?? null}
        />
      ) : (
        <SettingsPage
          draft={draft}
          lines={lines}
          onAddress={(next) => {
            setLines(next);
            setDraft(withAddress(draft, next));
          }}
          onPage={setPage}
          setDraft={setDraft}
        />
      )}
    </MomentSheet>
  );
}

function SettingsPage({
  draft,
  setDraft,
  lines,
  onAddress,
  onPage,
}: {
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
          {/* Typing a name forgets the chosen place (:666). */}
          <FormField
            placeholder="Store name"
            value={draft.storeName ?? ''}
            onChangeText={(storeName) => setDraft({ ...draft, storeName, storeWebsite: null, storePlaceId: null })}
            testID="list-settings-store-name"
          />
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
});
