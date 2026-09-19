import { useFocusEffect, useNavigation } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { BackHandler } from 'react-native';

/**
 * SwiftUI's `.interactiveDismissDisabled(_:)`: while `blocked`, the screen cannot be swiped or
 * backed away from.
 *
 * iOS has one gesture to stop; Android has two — the swipe (or drag, on a sheet), which is the
 * navigator's `gestureEnabled`, and the system back button, which only a `BackHandler` listener can
 * swallow. `parent` also blocks the navigator the screen sits in, for a screen PUSHED inside a sheet:
 * Swift's modifier there stops the whole sheet from being dismissed (ProfileView.swift:256).
 */
export function useBlockDismiss(blocked: boolean, { parent = false }: { parent?: boolean } = {}) {
  const navigation = useNavigation();

  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !blocked });
    if (parent) navigation.getParent()?.setOptions({ gestureEnabled: !blocked });
  }, [navigation, blocked, parent]);

  useFocusEffect(
    useCallback(() => {
      if (!blocked) return undefined;
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
      return () => subscription.remove();
    }, [blocked]),
  );
}
