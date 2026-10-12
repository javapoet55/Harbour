import { useState, type ReactNode } from 'react';
import { Animated, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

/**
 * Tasks' drag-to-reorder within one date group (d568989, RootView.swift:1983-1989): each card is
 * `.draggable("nexdo-task:<id>")` with a `.dropDestination` that hands the dragged id and the card it
 * was dropped on to `reorderTask(_:to:tasks:)`. iOS lifts a card after a touch-and-hold; here a
 * long press (`LONG_PRESS_MS`) starts the drag, the card follows the finger, and letting go over
 * another card drops it there — `source` takes `target`'s place. Letting go anywhere else does nothing,
 * as a drop outside a destination does in Swift.
 *
 * Built on react-native-gesture-handler (`Gesture.Pan().activateAfterLongPress`) with the callbacks on
 * the JS thread and React Native's `Animated` for the lift, so it needs no worklets. Moments are passed
 * as not draggable: they never move and are never a drop target (`reorderTask`'s guards).
 */

/** About iOS's drag lift delay. */
export const LONG_PRESS_MS = 400;

type Item = { id: string; draggable: boolean; node: ReactNode };

export function ReorderableGroup({
  items,
  onDrop,
  onDragChange,
  testID,
}: {
  items: Item[];
  /** `reorderTask(source, to: target)`. */
  onDrop: (source: string, target: string) => void;
  /** The list stops scrolling while a card is held. */
  onDragChange?: (dragging: boolean) => void;
  testID?: string;
}) {
  // Each card's frame in the group, from `onLayout`; held in state (made once) so render never reads a ref.
  const [layouts] = useState(() => new Map<string, { y: number; height: number }>());
  const [dragging, setDragging] = useState<string | null>(null);
  const [offset] = useState(() => new Animated.Value(0));

  const targetFor = (source: string, translation: number): string | null => {
    const from = layouts.get(source);
    if (!from) return null;
    const centre = from.y + from.height / 2 + translation;
    for (const item of items) {
      if (item.id === source || !item.draggable) continue;
      const frame = layouts.get(item.id);
      if (frame && centre >= frame.y && centre <= frame.y + frame.height) return item.id;
    }
    return null;
  };

  const end = () => {
    offset.setValue(0);
    setDragging(null);
    onDragChange?.(false);
  };

  return (
    <View style={styles.group} testID={testID}>
      {items.map((item) => {
        const lifted = dragging === item.id;
        const gesture = Gesture.Pan()
          .enabled(item.draggable)
          .activateAfterLongPress(LONG_PRESS_MS)
          .withTestId(`reorder-${item.id}`)
          .runOnJS(true)
          .onStart(() => {
            setDragging(item.id);
            onDragChange?.(true);
          })
          .onUpdate((event) => offset.setValue(event.translationY))
          .onEnd((event) => {
            const target = targetFor(item.id, event.translationY);
            if (target) onDrop(item.id, target);
          })
          .onFinalize(end);
        return (
          <GestureDetector gesture={gesture} key={item.id}>
            <Animated.View
              onLayout={(event: LayoutChangeEvent) => {
                const { y, height } = event.nativeEvent.layout;
                layouts.set(item.id, { y, height });
              }}
              // The lifted card rides above its neighbours, slightly larger, as the system drag preview.
              style={lifted ? [styles.lifted, { transform: [{ translateY: offset }, { scale: 1.03 }] }] : undefined}
              testID={`reorder-item-${item.id}`}
            >
              {item.node}
            </Animated.View>
          </GestureDetector>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // The section's `VStack` spacing between cards.
  group: { gap: 8 },
  lifted: { zIndex: 10, elevation: 8, opacity: 0.95 },
});
