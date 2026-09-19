import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { FESTIVAL_REGIONS, festivalMomentInput } from '../../src/features/moments/device';
import { FormLink, FormRow, FormScroll, FormSection, FormText, MenuPicker } from '../../src/features/moments/form';

/**
 * `MomentFestivalView` (ios/App/MomentEditor.swift:311-322): the hard-coded regions, sorted, and each
 * region's festivals, opening the editor with a "<name> Wishes" festival whose date must be confirmed.
 * Moving dates are never guessed; catalog dates come from the server's `festivalCatalog` later.
 */
export default function ChooseFestivalsScreen() {
  const [region, setRegion] = useState('Choose region');
  const festivals = FESTIVAL_REGIONS[region] ?? [];
  return (
    <View style={styles.fill}>
      <FormScroll testID="festivals">
        <FormSection>
          <FormRow>
            <FormText>Choose the region and celebrations you observe. Confirm the festival date and recipient yourself. Moving festival dates are not automatically guessed.</FormText>
          </FormRow>
          <FormRow last={festivals.length === 0}>
            <MenuPicker
              label="Region"
              options={[{ value: 'Choose region', title: 'Choose region' }, ...Object.keys(FESTIVAL_REGIONS).sort().map((value) => ({ value, title: value }))]}
              value={region}
              onChange={setRegion}
              testID="festival-region"
            />
          </FormRow>
          {festivals.map((name, index) => (
            <FormRow key={name} last={index === festivals.length - 1}>
              <FormLink
                title={name}
                onPress={() => router.push({ pathname: '/moments/editor', params: { imported: JSON.stringify(festivalMomentInput(name)), done: 'back' } })}
                testID={`festival-${name}`}
              />
            </FormRow>
          ))}
        </FormSection>
      </FormScroll>
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
