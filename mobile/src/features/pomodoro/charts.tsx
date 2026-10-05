import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, View } from 'react-native';

import { withAlpha } from '../../components/SignInBackdrop';
import { Text } from '../../components/Text';
import type { PomodoroBucket, PomodoroPeriod } from './analytics';
import { axisLabel, axisMinutes, chartDomain, dashboardTime, selectedBucket, tickIndices } from './format';

/**
 * The Pomodoro charts and rings, hand-built from Views.
 *
 * VISUAL GAP: Swift Charts and SwiftUI's trimmed `Circle` have no React Native equivalent, and no
 * charting or SVG module is added (Weekly Summary made the same call). Same data, colours and sizes;
 * a bar is picked by tapping rather than by dragging along the chart (`chartXSelection`), and rings
 * and the donut are drawn from short segments.
 */

const INDIGO_SOFT = 'rgba(88, 86, 214, 0.07)';

/**
 * `chart(_:breaks:)` (PomodoroDashboard.swift:120-149): focus bars (and break bars beside them on the
 * overview), 170 tall, four minute labels on the leading edge, sparse date labels underneath. The picked
 * bar — or else the tallest — is purple; the trend chart labels it with its focus time.
 */
export function FocusChart({
  buckets,
  period,
  breaks,
  zone,
  picked,
  onPick,
  testID,
}: {
  buckets: PomodoroBucket[];
  period: PomodoroPeriod;
  breaks: boolean;
  zone: string;
  picked: number | null;
  onPick: (index: number) => void;
  testID: string;
}) {
  const domain = chartDomain(buckets);
  const ticks = new Set(tickIndices(buckets.length, period));
  const selected = selectedBucket(buckets, picked);
  const labels = axisMinutes(domain).reverse();
  return (
    <View style={styles.chartBlock} testID={testID}>
      <View style={styles.chart}>
        <View style={styles.yAxis}>
          {labels.map((minutes) => (
            <Text key={minutes} style={[styles.axisText, styles.yLabel, { bottom: `${(minutes / domain) * 100}%` }]}>{`${minutes}m`}</Text>
          ))}
        </View>
        <View style={styles.plot}>
          {labels.map((minutes) => (
            <View key={minutes} style={[styles.gridLine, { bottom: `${(minutes / domain) * 100}%`, backgroundColor: INDIGO_SOFT }]} />
          ))}
          <View style={styles.bars}>
            {buckets.map((bucket, index) => {
              const on = index === selected;
              const focusHeight = `${Math.min(100, (bucket.seconds / 60 / domain) * 100)}%` as const;
              const breakHeight = `${Math.min(100, (bucket.breakSeconds / 60 / domain) * 100)}%` as const;
              return (
                <Pressable
                  accessibilityLabel={axisLabel(bucket.start, period, zone)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityValue={{ text: `${dashboardTime(bucket.seconds)} focus${breaks ? `, ${dashboardTime(bucket.breakSeconds)} break` : ''}` }}
                  key={bucket.start}
                  onPress={() => onPick(index)}
                  style={styles.column}
                  testID={`${testID}-bar-${index}`}
                >
                  {!breaks && on && bucket.seconds > 0 ? (
                    <View style={[styles.annotation, { bottom: focusHeight }]} testID={`${testID}-label`}>
                      <Text style={styles.annotationText}>{dashboardTime(bucket.seconds)}</Text>
                    </View>
                  ) : null}
                  <View style={styles.pair}>
                    <LinearGradient
                      colors={on ? ['#AF52DE', withAlpha('#5856D6', 0.45)] : [withAlpha('#007AFF', 0.7), withAlpha('#32ADE6', 0.4)]}
                      style={[styles.bar, { height: focusHeight }]}
                    />
                    {breaks ? <View style={[styles.bar, { height: breakHeight, backgroundColor: withAlpha('#32ADE6', 0.55) }]} /> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
      <View style={styles.xAxis}>
        {buckets.map((bucket, index) => (
          <Text key={bucket.start} numberOfLines={1} style={[styles.axisText, styles.xLabel]}>
            {ticks.has(index) ? axisLabel(bucket.start, period, zone) : ''}
          </Text>
        ))}
      </View>
      {breaks ? (
        <View style={styles.legend}>
          <Legend color="#5856D6" title="Focus" />
          <Legend color="#32ADE6" title="Break" />
        </View>
      ) : null}
    </View>
  );
}

function Legend({ color, title }: { color: string; title: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={[styles.caption2, { color }]}>{title}</Text>
    </View>
  );
}

/** One short segment of a ring, rotated to `angle` (degrees clockwise from 12 o'clock). Also draws the Calorie Tracker's ring. */
export function Segment({ size, stroke, angle, length, color }: { size: number; stroke: number; angle: number; length: number; color: string }) {
  const radius = (size - stroke) / 2;
  return (
    <View
      style={{
        position: 'absolute',
        left: size / 2 - length / 2,
        top: size / 2 - stroke / 2,
        width: length,
        height: stroke,
        backgroundColor: color,
        // Turn to the angle, then step out along the turned "up": a tangent segment on the ring.
        transform: [{ rotate: `${angle}deg` }, { translateY: -radius }],
      }}
    />
  );
}

type RGBA = [number, number, number, number];

function mix(a: RGBA, b: RGBA, t: number): RGBA {
  return a.map((value, index) => value + (b[index] - value) * t) as RGBA;
}

/** An `AngularGradient` of three stops, read at `t` (0…1 round the circle from the top). */
function angular(stops: RGBA[], t: number): RGBA {
  const scaled = t * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.floor(scaled));
  return mix(stops[index], stops[index + 1], scaled - index);
}

/**
 * `color` drawn over the ring's 22% track on the white page, as one opaque colour. The segments overlap
 * by a little to close their gaps, and translucent ones doubled up at every seam (visible stripes).
 */
function overTrack([r, g, b, a]: RGBA, track: string): string {
  const [tr, tg, tb] = [1, 3, 5].map((start) => parseInt(track.slice(start, start + 2), 16));
  const base = [tr, tg, tb].map((value) => 255 + (value - 255) * 0.22);
  const [or, og, ob] = [r, g, b].map((value, index) => Math.round(base[index] + (value - base[index]) * a));
  return `rgb(${or}, ${og}, ${ob})`;
}

const FOCUS_STOPS: RGBA[] = [
  [175, 82, 222, 1],
  [255, 45, 85, 1],
  [255, 45, 85, 0.3],
];
const BREAK_STOPS: RGBA[] = [
  [0, 122, 255, 1],
  [50, 173, 230, 1],
  [0, 122, 255, 0.3],
];

/**
 * The timer ring (PomodoroView.swift:139-143): a 15-wide track at 22%, and the time LEFT drawn clockwise
 * from 12 o'clock in an angular purple → pink (blue → cyan on a break), at least a sliver.
 */
export function ProgressRing({ size, fraction, isBreak, children }: { size: number; fraction: number; isBreak: boolean; children?: React.ReactNode }) {
  const stroke = 15;
  const count = 180;
  const radius = (size - stroke) / 2;
  const length = (2 * Math.PI * radius) / count + 1.2;
  const shown = Math.max(1, Math.round(Math.max(0.002, Math.min(1, fraction)) * count));
  const stops = isBreak ? BREAK_STOPS : FOCUS_STOPS;
  const track = isBreak ? '#007AFF' : '#FF2D55';
  return (
    <View style={{ width: size, height: size }} testID="pomodoro-ring">
      <View
        style={[
          StyleSheet.absoluteFill,
          { borderRadius: size / 2, borderWidth: stroke, borderColor: withAlpha(track, 0.22) },
        ]}
      />
      {Array.from({ length: shown }, (_, index) => (
        <Segment key={index} angle={(index / count) * 360} color={overTrack(angular(stops, index / count), track)} length={length} size={size} stroke={stroke} />
      ))}
      <View style={[StyleSheet.absoluteFill, styles.ringCenter]}>{children}</View>
    </View>
  );
}

/**
 * `donut(_:)` (PomodoroDashboard.swift:178-184): each category's share of the focus time in its colour,
 * an inner radius of 72%, the total in the middle.
 */
export function CategoryDonut({ size, slices, center }: { size: number; slices: { color: string; seconds: number }[]; center: React.ReactNode }) {
  const total = slices.reduce((sum, slice) => sum + slice.seconds, 0);
  const stroke = (size / 2) * 0.28;
  const count = 180;
  const radius = (size - stroke) / 2;
  const length = (2 * Math.PI * radius) / count + 1.2;
  const bounds: { end: number; color: string }[] = [];
  let running = 0;
  for (const slice of slices) {
    running += total > 0 ? slice.seconds / total : 0;
    bounds.push({ end: running, color: slice.color });
  }
  return (
    <View style={{ width: size, height: size }} testID="pomodoro-donut">
      {total > 0
        ? Array.from({ length: count }, (_, index) => {
            const at = (index + 0.5) / count;
            const color = bounds.find((bound) => at <= bound.end)?.color ?? bounds[bounds.length - 1].color;
            return <Segment key={index} angle={(index / count) * 360} color={color} length={length} size={size} stroke={stroke} />;
          })
        : null}
      <View style={[StyleSheet.absoluteFill, styles.ringCenter, { padding: 30 }]}>{center}</View>
    </View>
  );
}

/** `PomodoroConfetti` (PomodoroView.swift:192-204): 28 capsules drifting, still under Reduce Motion. */
export function Confetti() {
  const [drift] = useState(() => new Animated.Value(0));
  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((reduce) => {
        if (cancelled) return;
        if (reduce) {
          drift.setValue(1);
          return;
        }
        loop = Animated.loop(
          Animated.sequence([
            Animated.timing(drift, { toValue: 1, duration: 2000, useNativeDriver: true }),
            Animated.timing(drift, { toValue: 0, duration: 2000, useNativeDriver: true }),
          ]),
        );
        loop.start();
      })
      .catch(() => drift.setValue(1));
    return () => {
      cancelled = true;
      loop?.stop();
    };
  }, [drift]);
  const colors = ['#FF2D55', '#AF52DE', '#007AFF', '#FF9500', '#00C7BE'];
  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants" pointerEvents="none" style={styles.confetti} testID="pomodoro-confetti">
      {Array.from({ length: 28 }, (_, index) => (
        <Animated.View
          key={index}
          style={{
            position: 'absolute',
            left: `${((index * 37) % 97) + 1}%`,
            top: ((index * 29) % 140) + 10,
            width: 5,
            height: 9,
            borderRadius: 2.5,
            backgroundColor: colors[index % 5],
            opacity: drift.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0.9] }),
            transform: [{ translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [-12, 12] }) }, { rotate: `${index * 47}deg` }],
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  chartBlock: { gap: 8, paddingTop: 8 },
  chart: { flexDirection: 'row', height: 170, gap: 6 },
  // Each label sits on its own grid line (the top line is below the top: the domain is 1.3× the tallest bar).
  // 24 wide plus the 6 gap is the x-axis's 30 inset.
  yAxis: { width: 24 },
  yLabel: { position: 'absolute', right: 0, marginBottom: -6.5 },
  axisText: { fontSize: 11, lineHeight: 13, color: '#575C80' },
  plot: { flex: 1 },
  gridLine: { position: 'absolute', left: 0, right: 0, height: 1 },
  bars: { flex: 1, flexDirection: 'row', alignItems: 'flex-end' },
  column: { flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'center' },
  pair: { flexDirection: 'row', alignItems: 'flex-end', height: '100%', width: '65%', gap: 1 },
  bar: { flex: 1, borderRadius: 4, minHeight: 0 },
  // `.annotation(position: .top)`: just above the bar's top, not pinned to the chart's.
  annotation: { position: 'absolute', marginBottom: 4, zIndex: 1, backgroundColor: '#AF52DE', borderRadius: 999, paddingHorizontal: 5, paddingVertical: 2 },
  annotationText: { fontSize: 11, lineHeight: 13, fontWeight: '700', color: '#FFFFFF' },
  xAxis: { flexDirection: 'row', marginLeft: 30 },
  xLabel: { flex: 1, textAlign: 'center' },
  legend: { flexDirection: 'row', gap: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  caption2: { fontSize: 11, lineHeight: 13 },
  ringCenter: { alignItems: 'center', justifyContent: 'center' },
  confetti: { position: 'absolute', left: 0, right: 0, top: 0, height: 180 },
});
