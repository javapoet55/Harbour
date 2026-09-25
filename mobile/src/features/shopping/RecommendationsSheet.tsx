import { Modal, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { GroceryList } from '../../api/shopping';
import { AskNexdoView } from '../../components/AskNexdoView';
import { useTheme } from '../../theme';

/**
 * `.sheet(isPresented: $recommendations) { AskNexdoView(textPage: true, shoppingContext:
 * ShoppingRecommendationContext(listName: list.title, itemNames: list.items.map(\.name))) }`
 * (ios/App/ShoppingViews.swift:299), opened by AI Powered Recommendations (`:321-328`).
 */
export function ShoppingRecommendationsSheet({ list, visible, onClose }: { list: GroceryList; visible: boolean; onClose: () => void }) {
  const theme = useTheme({ elevated: true });
  const insets = useSafeAreaInsets();
  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined}
      statusBarTranslucent
      transparent={Platform.OS === 'android'}
      visible={visible}
    >
      {Platform.OS === 'android' ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.dim]} /> : null}
      <View
        style={[styles.sheet, { backgroundColor: theme.colors.background, marginTop: Platform.OS === 'android' ? insets.top + 8 : 0 }, Platform.OS === 'android' && styles.shape]}
        testID="shopping-recommendations"
      >
        {visible ? <AskNexdoView textPage shoppingContext={{ listName: list.title, itemNames: list.items.map((item) => item.name) }} onClose={onClose} /> : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1 },
  shape: { borderTopLeftRadius: 38, borderTopRightRadius: 38, overflow: 'hidden' },
  dim: { backgroundColor: 'rgba(0, 0, 0, 0.25)' },
});
