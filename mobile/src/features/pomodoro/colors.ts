import { useTheme } from '../../theme';

/**
 * Pomodoro's colours in the current scheme. Since ce6d20a Swift no longer forces light on the dashboard:
 * the ink is `nexdoInk`, the page `systemBackground`, the cards `secondarySystemGroupedBackground`, the tint
 * `wellnessAccent`, and the system colours (`.purple`, `.indigo`, `.blue`, `.pink`) take their dark values.
 * Text without a colour takes the theme's ink.
 */
export function usePomodoroColors() {
  const { scheme, colors } = useTheme();
  const dark = scheme === 'dark';
  const purple = dark ? '#BF5AF2' : '#AF52DE';
  const indigo = dark ? '#5E5CE6' : '#5856D6';
  const blue = dark ? '#0A84FF' : '#007AFF';
  return {
    dark,
    /** `Color.nexdoInk`. */
    ink: colors.ink,
    /** `.secondary`. */
    secondary: colors.secondaryLabel,
    placeholder: colors.placeholder,
    separator: colors.separator,
    /** `Color(uiColor: .separator).opacity(0.35)`: the metric tiles' stroke (ce6d20a; it was white). */
    metricStroke: dark ? 'rgba(84, 84, 88, 0.21)' : 'rgba(60, 60, 67, 0.1)',
    /** The faint rule between history rows. */
    rule: dark ? 'rgba(84, 84, 88, 0.24)' : 'rgba(60, 60, 67, 0.12)',
    /** `.tint(.wellnessAccent)`: switches, the Focus legend, the stopwatch, Done and Return to Timer. */
    accent: colors.wellnessAccent,
    purple,
    indigo,
    blue,
    pink: dark ? '#FF375F' : '#FF2D55',
    gradient: [purple, indigo, blue] as const,
    /** `systemBackground`. */
    background: dark ? '#000000' : '#FFFFFF',
    /** `secondarySystemGroupedBackground`. */
    card: dark ? '#1C1C1E' : '#FFFFFF',
    /** The chart's axis labels: `nexdoSecondary` in light, `.secondary` in dark. */
    axis: dark ? colors.secondaryLabel : '#575C80',
  };
}

export type PomodoroColors = ReturnType<typeof usePomodoroColors>;
