import Constants from 'expo-constants';
import { Platform, type View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import type { BugDeviceInfo } from './coordinator';

/**
 * The device side of `BugReportCoordinator` (ios/App/BugReportCoordinator.swift:52-65, :80-87), from
 * modules the app already has: the version from expo-constants, the model and OS release from React
 * Native's own `Platform.constants` (Android `Build.MODEL` and `Build.VERSION.RELEASE`). No expo-device
 * or expo-application is needed for these four values.
 */
export function bugDeviceInfo(): BugDeviceInfo {
  const constants = Platform.constants as unknown as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === 'string' && value !== '' ? value : null);
  return {
    // `CFBundleShortVersionString` and `CFBundleVersion`.
    appVersion: Constants.expoConfig?.version ?? null,
    buildNumber: Constants.nativeBuildVersion ?? null,
    model: Platform.OS === 'android' ? text(constants.Model) : null,
    osVersion: Platform.OS === 'android' ? text(constants.Release) : String(Platform.Version),
  };
}

/**
 * The rendered size: `format.scale = min(2, 1170 / window.bounds.width)` (:62), so at most twice the
 * points and never wider than 1,170 pixels. view-shot's `width`/`height` are pixels, and Android needs
 * both to resize.
 */
export function bugCaptureSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(2, 1170 / width);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** The app root as JPEG 0.7, base64 (:63-64). */
export function captureAppRoot(root: View, size: { width: number; height: number }): Promise<string> {
  return captureRef(root, { format: 'jpg', quality: 0.7, result: 'base64', ...bugCaptureSize(size.width, size.height) });
}
