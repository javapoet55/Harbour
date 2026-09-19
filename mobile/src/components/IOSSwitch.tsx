import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';

import { useTheme } from '../theme';

/**
 * SwiftUI's `Toggle` as iOS 26 draws it (UI-parity pass 2). Android's Material `Switch` is a 36dp
 * track with a round thumb; the iOS 26 switch is a CAPSULE, measured on `moment-manage-details`:
 *
 * - track 62 x 28pt, the tint when on, `systemFill` grey when off — (186, 186, 192) over light;
 * - thumb a white 36 x 23pt pill, 2.5pt in from the edge, sliding with a spring;
 * - a disabled switch at 0.4 opacity, as every disabled SwiftUI control.
 *
 * It keeps `Switch`'s props (`value`, `onValueChange`, `disabled`, `accessibilityLabel`, `testID`), so a
 * caller swaps the element and nothing else, and it reports itself as a `switch` to accessibility.
 */
export const IOS_SWITCH = { width: 62, height: 28, thumbWidth: 36, thumbHeight: 23, inset: 2.5 } as const;

export function IOSSwitch({
  value,
  onValueChange,
  disabled = false,
  accessibilityLabel,
  testID,
  tint,
}: {
  value: boolean;
  onValueChange?: (next: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  testID?: string;
  tint?: string;
}) {
  const theme = useTheme();
  // Held in state (created once) rather than a ref, so render never reads a ref.
  const [position] = useState(() => new Animated.Value(value ? 1 : 0));
  useEffect(() => {
    Animated.spring(position, { toValue: value ? 1 : 0, useNativeDriver: false, bounciness: 4, speed: 18 }).start();
  }, [value, position]);

  const travel = IOS_SWITCH.width - IOS_SWITCH.thumbWidth - IOS_SWITCH.inset * 2;
  const off = theme.scheme === 'dark' ? 'rgba(120, 120, 128, 0.32)' : 'rgba(120, 120, 128, 0.5)';
  const on = tint ?? theme.colors.tint;

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={() => onValueChange?.(!value)}
      style={disabled && styles.dimmed}
      testID={testID}
    >
      <Animated.View
        style={[
          styles.track,
          { backgroundColor: position.interpolate({ inputRange: [0, 1], outputRange: [off, on] }) },
        ]}
      >
        <Animated.View
          style={[
            styles.thumb,
            { transform: [{ translateX: position.interpolate({ inputRange: [0, 1], outputRange: [0, travel] }) }] },
          ]}
        />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: { width: IOS_SWITCH.width, height: IOS_SWITCH.height, borderRadius: IOS_SWITCH.height / 2, justifyContent: 'center', paddingHorizontal: IOS_SWITCH.inset },
  thumb: {
    width: IOS_SWITCH.thumbWidth,
    height: IOS_SWITCH.thumbHeight,
    borderRadius: IOS_SWITCH.thumbHeight / 2,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  dimmed: { opacity: 0.4 },
});
