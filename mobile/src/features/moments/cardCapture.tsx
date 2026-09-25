import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { useStore } from 'zustand';

import { FestivalGreetingCard } from './GreetingCard';
import { cardMessage, type ManageModel } from './manageModel';

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
const captors = new Map<ManageModel, (message: string) => Promise<string>>();

/**
 * Renders the card with `message` and captures it to a temporary JPEG file, resolving to its URI.
 *
 * The message is an argument rather than whatever the card happens to be showing, for two reasons.
 * Recipients with their own message each need their own card, so one upload renders several texts in
 * turn; and a capture taken in the same tick as the edit that changed the message would shoot the
 * previous frame, which is how an edited wish used to reach the server on a stale card.
 */
export async function captureCard(model: ManageModel, message: string): Promise<string | null> {
  const capture = captors.get(model);
  if (!capture) return null;
  return capture(message);
}

/** Resolves once the next frame has been drawn, so the re-rendered text is really on screen. */
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

export function GreetingCardCapture({ model }: { model: ManageModel }) {
  const view = useRef<View>(null);
  const imageUri = useStore(model, (state) => state.imageUri);
  const title = useStore(model, (state) => state.title);
  const settings = useStore(model, (state) => state.settings);
  const shared = cardMessage({ settings });
  // The text this capture wants, which is not always the shared preview's.
  const [message, setMessage] = useState<string | null>(null);
  const shown = message ?? shared;
  const rendered = useRef(shown);
  const waiting = useRef<(() => void) | null>(null);

  // No dependency list: every commit reports the text that is now mounted and releases a capture
  // waiting for it, so a requested text that React batched away can never strand the upload.
  useEffect(() => {
    rendered.current = shown;
    const release = waiting.current;
    waiting.current = null;
    release?.();
  });

  useEffect(() => {
    // Registered only while there is artwork: without it there is no card worth uploading, and the
    // model reads a missing captor as "nothing to attach" rather than as a failure.
    if (imageUri === null) {
      captors.delete(model);
      return;
    }
    captors.set(model, async (text) => {
      if (rendered.current !== text) {
        await new Promise<void>((resolve) => {
          waiting.current = resolve;
          setMessage(text);
        });
      }
      await nextFrame();
      return captureRef(view, { result: 'tmpfile', format: 'jpg', quality: 1 });
    });
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
      <FestivalGreetingCard artwork={imageUri} title={title} message={shown} signature={settings.cardSignature ?? ''} />
    </View>
  );
}

const styles = StyleSheet.create({
  // Far enough left that it never shows, still laid out so the capture has real pixels.
  offscreen: { position: 'absolute', left: -10_000, top: 0, width: CARD_CAPTURE_WIDTH },
});
