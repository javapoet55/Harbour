import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { useStore } from 'zustand';

import { FestivalGreetingCard } from './GreetingCard';
import type { ManageModel } from './manageModel';

/**
 * The finished card, rendered off-screen so it can be captured to an image.
 *
 * Swift renders the same thing with `ImageRenderer` at a fixed 380-point width
 * (ios/App/FestivalServices.swift:181-186); React Native has no off-tree renderer, so the card is
 * mounted for real, parked outside the viewport and captured from its ref. The width is fixed for
 * the same reason Swift fixes it: the uploaded card should not change shape with the phone.
 *
 * It must stay mounted and laid out — `display: none`, zero size or a parent with `opacity: 0` all
 * produce a blank or failed capture — so it is pushed off-screen instead, and hidden from touches
 * and from screen readers.
 */

/** Swift's `.frame(width: 380)`. */
export const CARD_CAPTURE_WIDTH = 380;

/**
 * The mounted card per screen, keyed by that screen's manage model. A module-level registry is what
 * lets the model — a plain zustand store with no React tree of its own — reach the view: the model
 * owns the upload, and only the view can hold the ref that `captureRef` needs.
 */
const captors = new Map<ManageModel, () => Promise<string>>();

/** Captures the mounted card to a temporary JPEG file and resolves to its URI. */
export async function captureCard(model: ManageModel): Promise<string | null> {
  const capture = captors.get(model);
  if (!capture) return null;
  return capture();
}

export function GreetingCardCapture({ model }: { model: ManageModel }) {
  const view = useRef<View>(null);
  const imageUri = useStore(model, (state) => state.imageUri);
  const title = useStore(model, (state) => state.title);
  const settings = useStore(model, (state) => state.settings);

  useEffect(() => {
    // Registered only while there is artwork: without it there is no card worth uploading, and the
    // model reads a missing captor as "nothing to attach" rather than as a failure.
    if (imageUri === null) {
      captors.delete(model);
      return;
    }
    captors.set(model, () => captureRef(view, { result: 'tmpfile', format: 'jpg', quality: 1 }));
    return () => {
      captors.delete(model);
    };
  }, [model, imageUri]);

  if (imageUri === null) return null;
  return (
    <View
      ref={view}
      collapsable={false}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.offscreen}
      testID="greeting-card-capture"
    >
      <FestivalGreetingCard
        artwork={imageUri}
        title={title}
        message={settings.cardGreeting ?? settings.baseMessage}
        signature={settings.cardSignature ?? ''}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Far enough left that it never shows, still laid out so the capture has real pixels.
  offscreen: { position: 'absolute', left: -10_000, top: 0, width: CARD_CAPTURE_WIDTH },
});
