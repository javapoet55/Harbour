// Brand colours ported from `extension Color` in ios/App/RootView.swift (lines 885–891).
// SwiftUI declares them as sRGB component floats; each hex value is round(component * 255).

export const brand = {
  nexdoBlue: '#0594F5', // RootView.swift:888 Color(red: 0.02, green: 0.58, blue: 0.96)
  nexdoIndigo: '#3D29F0', // RootView.swift:889 Color(red: 0.24, green: 0.16, blue: 0.94)
  nexdoPurple: '#8514F5', // RootView.swift:890 Color(red: 0.52, green: 0.08, blue: 0.96)
  nexdoMagenta: '#F014C7', // RootView.swift:891 Color(red: 0.94, green: 0.08, blue: 0.78)
} as const;

/**
 * `AskStyle.blue` in dark (AskNexdoView.swift:46: UIColor(red: 0.42, green: 0.72, blue: 1.00)). It is
 * `askBlue` on the Ask screen and, on Android in dark, the ONE accent for anything tappable or active:
 * `link` and `accent` (docs/android-polish.md §6, §7). Filled controls stay the brand indigo.
 */
const ASK_BLUE_DARK = '#6BB8FF';

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
  /**
   * An OPAQUE stand-in for `.ultraThinMaterial`, for a card that sits on a gradient ring.
   *
   * `GlassCard` blurs what is behind it, and a `LinearGradient` ring behind the card is exactly that
   * — the blur samples it and the whole card takes the gradient's colour. A card that needs the ring
   * fills with this instead. Light is the Swift card measured off the Today screen, (238, 238, 241);
   * dark is `glassFill` composited over the black grouped background.
   */
  glassSolid: string;
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
  /**
   * The tab bar. Swift's sits on a material a shade darker than the content — measured
   * (245,245,245) light — and marks the selected tab with a rounded capsule of `nexdoIndigo` at
   * 10%, measured (227,225,244). React Native defaulted the bar to plain white with no capsule.
   */
  tabBarBackground: string;
  tabBarSelected: string;
  /**
   * Android form chrome (docs/android-polish.md §2). On Android the Swift look — inputs, menus,
   * cards and buttons all filled with the page colour behind a faint indigo hairline — reads as flat
   * dark rectangles, so fields sit one step above the page with a neutral hairline instead.
   * `fieldSurface` is one step above `background`; `fieldSurfaceElevated` is the same step above the
   * elevated (sheet) background, and `useTheme` swaps it in with the other elevated colours.
   */
  fieldSurface: string;
  fieldSurfaceElevated: string;
  /** The 1px hairline around an Android field or card, and on top of a bottom bar. */
  fieldBorder: string;
  /**
   * The accent for a focused Android field, an outlined secondary button's border, tint and label,
   * and the selected Settings Appearance segment. `nexdoIndigo` in light mode; in dark, the same Ask
   * blue as `link` (docs/android-polish.md §7), where #3D29F0 on black is about 2.8:1.
   */
  accent: string;
  /** `accent` at 10%: the outlined secondary button's fill. */
  accentTint: string;
  /** `accent` at 45%: the outlined secondary button's border. */
  accentBorder: string;
  /** An Android bottom bar, a shade above `fieldSurface` so it separates from the scroll content. */
  barSurface: string;
  /**
   * The Android field label (TASK NAME, PRIORITY, a form section header…): an opaque secondary grey
   * that reads at 4.5:1 or better on every page, card and group surface in its scheme
   * (docs/android-polish.md §4). Opaque so its contrast does not depend on what is behind it.
   */
  fieldLabel: string;
  /**
   * A value pill or input INSIDE a grouped form card (`androidGroup`), which is already on
   * `fieldSurface`: white in light, one step lighter in dark. `useTheme` swaps in the elevated one.
   */
  fieldOnGroup: string;
  fieldOnGroupElevated: string;
  /**
   * Tappable text and icon tint: links, text buttons, icon buttons, header chevrons and actions,
   * spinners (docs/android-polish.md §6). The palettes set it to `tint`; on Android in dark `useTheme`
   * resolves it to `askBlue` — the blue the Ask screen already uses for "Read Loud" and "Show
   * suggestions" — where the deep brand indigo read as muddy (2.2:1 on #1C1C1E). Filled controls —
   * switches on, selected chips, prominent buttons — keep `tint`.
   */
  link: string;
  /** An Android switch track, on: the brand indigo, at 85% over the surface in dark so it does not glow. */
  switchOn: string;
  /** An Android switch track, off: a neutral grey, drawn with a `fieldBorder` hairline. */
  switchOff: string;
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
    glassSolid: '#EEEEF1', // measured off the Swift Action Needed card: (238, 238, 241)
    glassStroke: 'rgba(255, 255, 255, 0.8)', // RootView.swift:355 Color.white.opacity(0.8)
    glassShadow: 'rgba(128, 0, 128, 0.09)', // RootView.swift:356 Color.purple.opacity(0.09)
    ruleFaint: 'rgba(87, 92, 128, 0.25)', // RootView.swift:385 nexdoSecondary.opacity(0.25)
    listSeparator: '#E8E8E8', // measured in the Swift Form on iOS 26
    segmentTrack: 'rgba(118, 118, 128, 0.12)',
    segmentSelected: '#FFFFFF',
    tabBarBackground: '#F5F5F5',
    tabBarSelected: 'rgba(61, 41, 240, 0.10)',
    fieldSurface: '#F2F2F7',
    fieldSurfaceElevated: '#F2F2F7',
    fieldBorder: 'rgba(0, 0, 0, 0.12)',
    accent: brand.nexdoIndigo,
    accentTint: 'rgba(61, 41, 240, 0.10)',
    accentBorder: 'rgba(61, 41, 240, 0.45)',
    barSurface: '#FAFAFC',
    fieldLabel: '#575C80',
    fieldOnGroup: '#FFFFFF',
    fieldOnGroupElevated: '#FFFFFF',
    link: brand.nexdoIndigo,
    switchOn: brand.nexdoIndigo,
    switchOff: 'rgba(120, 120, 128, 0.5)',
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
    askBlue: ASK_BLUE_DARK, // AskNexdoView.swift:46 dark: UIColor(red: 0.42, green: 0.72, blue: 1.00)
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
    glassSolid: '#1D1D20', // the same fill composited over the black grouped background
    // RootView.swift:355 `Color.white.opacity(0.8)`, the same as light. A previous pass guessed
    // this down to 0.14 on the assumption it would read as blown-out on black; measuring the Swift
    // app shows the stroke really is bright — (214,214,215) against a (28,28,30) card.
    glassStroke: 'rgba(255, 255, 255, 0.8)',
    glassShadow: 'rgba(128, 0, 128, 0.09)',
    ruleFaint: 'rgba(235, 235, 245, 0.15)', // secondaryLabel at 0.25 of its own 0.6 alpha
    listSeparator: '#38383A',
    segmentTrack: 'rgba(118, 118, 128, 0.18)',
    segmentSelected: 'rgba(235, 235, 245, 0.32)',
    tabBarBackground: '#1F1F1F',
    // Measured off the Swift app in dark mode: the capsule is (34, 32, 52) over a (31, 31, 31) bar,
    // which is `nexdoIndigo` at 10% — the *same* value as light mode, not a lighter indigo at 22%.
    tabBarSelected: 'rgba(61, 41, 240, 0.10)',
    fieldSurface: '#1C1C1E',
    fieldSurfaceElevated: '#2C2C2E',
    fieldBorder: 'rgba(255, 255, 255, 0.14)',
    // The same blue as `link` (§7): one accent for tappable and active, replacing §2's lighter indigo.
    accent: ASK_BLUE_DARK,
    accentTint: 'rgba(107, 184, 255, 0.10)',
    accentBorder: 'rgba(107, 184, 255, 0.45)',
    barSurface: '#242427',
    fieldLabel: '#A1A1AA',
    fieldOnGroup: '#2C2C2E',
    fieldOnGroupElevated: '#3A3A3C',
    link: brand.nexdoIndigo,
    switchOn: 'rgba(61, 41, 240, 0.85)',
    switchOff: '#48484A',
  },
};
