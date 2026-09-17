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
  /** iOS `.label` — what an unstyled SwiftUI `Text` uses. Not the same as `ink` (`nexdoInk`). */
  label: string;
  /** iOS `.placeholderText` — what an unstyled `TextField` placeholder uses. */
  placeholder: string;
  /** iOS `.secondaryLabel` — used by `Form` section headers and footers. Not `nexdoSecondary`. */
  secondaryLabel: string;
  secondary: string;
  scheduleBlue: string;
  /** `AskStyle.blue` (ios/App/AskNexdoView.swift:45-50). Close to `scheduleBlue`, but not equal. */
  askBlue: string;
  /** `.secondarySystemBackground`: `AskStyle.cardBackground` (AskNexdoView.swift:54). */
  secondaryBackground: string;
  tint: string;
  onTint: string;
  background: string;
  groupedBackground: string;
  surface: string;
  /**
   * iOS raises the dark-mode system backgrounds one level inside a presented sheet, so a sheet is
   * #1C1C1E where the root screen is black. In light mode nothing changes.
   */
  backgroundElevated: string;
  groupedBackgroundElevated: string;
  surfaceElevated: string;
  separator: string;
  danger: string;
  /** `.ultraThinMaterial` stand-in for the auth cards. expo-blur tints over this. */
  glassFill: string;
  /** `RoundedRectangle(...).stroke(Color.white.opacity(0.8))` on the auth cards. */
  glassStroke: string;
  /** `.shadow(color: Color.purple.opacity(0.09), radius: 25, y: 12)` on the auth cards. */
  glassShadow: string;
  /** `Color.nexdoSecondary.opacity(0.25)`: the rules either side of "OR" on sign-in. */
  ruleFaint: string;
  /** The row separator inside an inset-grouped `Form`, which is lighter than `.separator`. */
  listSeparator: string;
  /**
   * `Picker(...).pickerStyle(.segmented)`. Both are translucent system fills in Swift, so the
   * backdrop tints through them; mapping them to opaque greys turns the dark control into a black
   * box. Measured off the Swift app on the Tasks screen: the track renders (238,231,237) light and
   * (36,29,37) dark, the selected segment (255,255,255) and (98,91,102).
   */
  segmentTrack: string;
  segmentSelected: string;
};

export type ColorScheme = 'light' | 'dark';

export const palettes: Record<ColorScheme, Palette> = {
  light: {
    ink: '#080F2E', // RootView.swift:885 light: UIColor(red: 0.03, green: 0.06, blue: 0.18)
    label: '#000000', // iOS .label
    placeholder: 'rgba(60, 60, 67, 0.3)', // iOS .placeholderText
    secondaryLabel: 'rgba(60, 60, 67, 0.6)', // iOS .secondaryLabel
    secondary: '#575C80', // RootView.swift:886 light: UIColor(red: 0.34, green: 0.36, blue: 0.50)
    scheduleBlue: '#26578F', // RootView.swift:887 light: UIColor(red: 0.15, green: 0.34, blue: 0.56)
    askBlue: '#2E598F', // AskNexdoView.swift:47 light: UIColor(red: 0.18, green: 0.35, blue: 0.56)
    secondaryBackground: '#F2F2F7',
    tint: brand.nexdoIndigo, // RootView.swift:46 `.tint(.nexdoIndigo)`
    onTint: '#FFFFFF',
    // iOS system colours used alongside the brand colours in RootView.swift
    // (systemBackground, systemGroupedBackground, secondarySystemGroupedBackground, separator, systemRed).
    background: '#FFFFFF',
    groupedBackground: '#F2F2F7',
    surface: '#FFFFFF',
    backgroundElevated: '#FFFFFF',
    groupedBackgroundElevated: '#F2F2F7',
    surfaceElevated: '#FFFFFF',
    separator: 'rgba(60, 60, 67, 0.29)',
    danger: '#FF3B30',
    glassFill: 'rgba(236, 236, 240, 0.72)', // RootView.swift:354 `.ultraThinMaterial`, tuned against the Swift render
    glassStroke: 'rgba(255, 255, 255, 0.8)', // RootView.swift:355 Color.white.opacity(0.8)
    glassShadow: 'rgba(128, 0, 128, 0.09)', // RootView.swift:356 Color.purple.opacity(0.09)
    ruleFaint: 'rgba(87, 92, 128, 0.25)', // RootView.swift:385 nexdoSecondary.opacity(0.25)
    listSeparator: '#E8E8E8', // measured in the Swift Form on iOS 26
    segmentTrack: 'rgba(118, 118, 128, 0.12)',
    segmentSelected: '#FFFFFF',
  },
  dark: {
    // TODO(phase1-decision): the Swift dark variant is the dynamic system `.label`; this is its standard dark value.
    ink: '#FFFFFF', // RootView.swift:885 dark: .label
    label: '#FFFFFF', // iOS .label
    placeholder: 'rgba(235, 235, 245, 0.3)', // iOS .placeholderText
    secondaryLabel: 'rgba(235, 235, 245, 0.6)', // iOS .secondaryLabel
    // TODO(phase1-decision): the Swift dark variant is the dynamic system `.secondaryLabel`; this is its standard dark value.
    secondary: 'rgba(235, 235, 245, 0.6)', // RootView.swift:886 dark: .secondaryLabel
    scheduleBlue: '#7ABAFF', // RootView.swift:887 dark: UIColor(red: 0.48, green: 0.73, blue: 1)
    askBlue: '#6BB8FF', // AskNexdoView.swift:46 dark: UIColor(red: 0.42, green: 0.72, blue: 1.00)
    secondaryBackground: '#1C1C1E',
    tint: brand.nexdoIndigo,
    onTint: '#FFFFFF',
    background: '#000000',
    groupedBackground: '#000000',
    surface: '#1C1C1E',
    backgroundElevated: '#1C1C1E',
    groupedBackgroundElevated: '#1C1C1E',
    surfaceElevated: '#2C2C2E',
    separator: 'rgba(84, 84, 88, 0.6)',
    danger: '#FF453A',
    glassFill: 'rgba(40, 40, 44, 0.72)', // `.ultraThinMaterial` over the dark systemBackground
    // RootView.swift:355 `Color.white.opacity(0.8)`, the same as light. A previous pass guessed
    // this down to 0.14 on the assumption it would read as blown-out on black; measuring the Swift
    // app shows the stroke really is bright — (214,214,215) against a (28,28,30) card.
    glassStroke: 'rgba(255, 255, 255, 0.8)',
    glassShadow: 'rgba(128, 0, 128, 0.09)',
    ruleFaint: 'rgba(235, 235, 245, 0.15)', // secondaryLabel at 0.25 of its own 0.6 alpha
    listSeparator: '#38383A',
    segmentTrack: 'rgba(118, 118, 128, 0.18)',
    segmentSelected: 'rgba(235, 235, 245, 0.32)',
  },
};
