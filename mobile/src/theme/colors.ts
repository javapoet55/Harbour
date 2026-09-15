// Brand colours ported from `extension Color` in ios/App/RootView.swift (lines 885–891).
// SwiftUI declares them as sRGB component floats; each hex value is round(component * 255).

export const brand = {
  nexdoBlue: '#0594F5', // RootView.swift:888 Color(red: 0.02, green: 0.58, blue: 0.96)
  nexdoIndigo: '#3D29F0', // RootView.swift:889 Color(red: 0.24, green: 0.16, blue: 0.94)
  nexdoPurple: '#8514F5', // RootView.swift:890 Color(red: 0.52, green: 0.08, blue: 0.96)
  nexdoMagenta: '#F014C7', // RootView.swift:891 Color(red: 0.94, green: 0.08, blue: 0.78)
} as const;

export type Palette = {
  ink: string;
  secondary: string;
  scheduleBlue: string;
  tint: string;
  onTint: string;
  background: string;
  groupedBackground: string;
  surface: string;
  separator: string;
  danger: string;
};

export type ColorScheme = 'light' | 'dark';

export const palettes: Record<ColorScheme, Palette> = {
  light: {
    ink: '#080F2E', // RootView.swift:885 light: UIColor(red: 0.03, green: 0.06, blue: 0.18)
    secondary: '#575C80', // RootView.swift:886 light: UIColor(red: 0.34, green: 0.36, blue: 0.50)
    scheduleBlue: '#26578F', // RootView.swift:887 light: UIColor(red: 0.15, green: 0.34, blue: 0.56)
    tint: brand.nexdoIndigo, // RootView.swift:46 `.tint(.nexdoIndigo)`
    onTint: '#FFFFFF',
    // iOS system colours used alongside the brand colours in RootView.swift
    // (systemBackground, systemGroupedBackground, secondarySystemGroupedBackground, separator, systemRed).
    background: '#FFFFFF',
    groupedBackground: '#F2F2F7',
    surface: '#FFFFFF',
    separator: 'rgba(60, 60, 67, 0.29)',
    danger: '#FF3B30',
  },
  dark: {
    // TODO(phase1-decision): the Swift dark variant is the dynamic system `.label`; this is its standard dark value.
    ink: '#FFFFFF', // RootView.swift:885 dark: .label
    // TODO(phase1-decision): the Swift dark variant is the dynamic system `.secondaryLabel`; this is its standard dark value.
    secondary: 'rgba(235, 235, 245, 0.6)', // RootView.swift:886 dark: .secondaryLabel
    scheduleBlue: '#7ABAFF', // RootView.swift:887 dark: UIColor(red: 0.48, green: 0.73, blue: 1)
    tint: brand.nexdoIndigo,
    onTint: '#FFFFFF',
    background: '#000000',
    groupedBackground: '#000000',
    surface: '#1C1C1E',
    separator: 'rgba(84, 84, 88, 0.6)',
    danger: '#FF453A',
  },
};
