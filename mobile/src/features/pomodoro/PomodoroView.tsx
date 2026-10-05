import Ionicons from '@expo/vector-icons/Ionicons';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Alert, AppState, Image, Modal, Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from 'zustand';

import { IOSSwitch } from '../../components/IOSSwitch';
import { withAlpha } from '../../components/SignInBackdrop';
import { Text } from '../../components/Text';
import { POMODORO_TOMATO } from '../wellness/art';
import { Confetti, ProgressRing } from './charts';
import { CATEGORY_ICONS, completionDuration, countdown, TIMER_TINTS } from './format';
import { isActive, POMODORO_CATEGORIES, POMODORO_CATEGORY_TITLES, progress, remaining, setKeepAwake, stop, togglePause, type PomodoroCategory, type PomodoroSession } from './model';
import { PomodoroDashboard } from './PomodoroDashboard';
import { currentSession, type PomodoroStoreApi } from './store';

/**
 * `PomodoroView` (ios/App/PomodoroView.swift): opens on the dashboard; "Start Focus Session" shows the
 * timer — setup, the running focus or break, or the completion card. The timer runs on the phone in the
 * part 1 store; this screen ticks it every second while it is shown, restores and syncs on open and on
 * return to the foreground, and keeps the screen awake during an unpaused focus when asked.
 */

const INK = '#0D0A40'; // Color(red: 0.05, green: 0.04, blue: 0.25)
const INDIGO = '#5856D6'; // `.tint(.indigo)`
const PURPLE = '#AF52DE';
const PINK = '#FF2D55';
const BLUE = '#007AFF';
const SECONDARY = 'rgba(60, 60, 67, 0.6)';
const GRADIENT = [PURPLE, INDIGO, BLUE] as const;

/** `UIApplication.shared.isIdleTimerDisabled` — one tag, so leaving always releases it. */
export const KEEP_AWAKE_TAG = 'pomodoro-focus';

export type PomodoroViewProps = {
  store: PomodoroStoreApi;
  owner: string | null;
  /** "Back to Tasks" (`onTasks(); dismiss()`). */
  onTasks: () => void;
  /** `dismiss()` from the dashboard's close button. */
  onClose: () => void;
  now?: () => number;
};

export function PomodoroView({ store, owner, onTasks, onClose, now = Date.now }: PomodoroViewProps) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const state = useStore(store);
  const current = currentSession(state);
  const [showingDashboard, setShowingDashboard] = useState(true);
  const [history, setHistory] = useState(false);
  // `scenePhase == .active`. `currentState` can be unknown before the first AppState event (a cold
  // launch), so only `background` and `inactive` count as away.
  const [appActive, setAppActive] = useState(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  const [, setTick] = useState(0);

  // `.task { visible = true; await store.restore() }`, once the account's cache has loaded.
  useEffect(() => {
    if (!owner) return;
    void store
      .getState()
      .activate(owner)
      .then(() => store.getState().restore());
  }, [owner, store]);

  // `.onReceive(clock) { _ in store.tick() }`, every second.
  useEffect(() => {
    const timer = setInterval(() => {
      store.getState().tick();
      setTick((value) => value + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [store]);

  // `.onChange(of: scenePhase)`: back in the foreground, catch up and restore.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      setAppActive(next === 'active');
      if (next === 'active') {
        store.getState().tick();
        void store.getState().restore();
      }
    });
    return () => subscription.remove();
  }, [store]);

  // `updateAwake()` (:79-81): only an unpaused focus on the timer screen, in the foreground, when asked.
  const awake = appActive && !showingDashboard && !history && current?.phase === 'focus' && !current.paused && current.keepAwake;
  useEffect(() => {
    if (awake) void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => undefined);
    else void Promise.resolve(deactivateKeepAwake(KEEP_AWAKE_TAG)).catch(() => undefined);
  }, [awake]);
  // `.onDisappear { UIApplication.shared.isIdleTimerDisabled = false }`
  useEffect(() => () => void Promise.resolve(deactivateKeepAwake(KEEP_AWAKE_TAG)).catch(() => undefined), []);

  const startFromDashboard = () => {
    if (!current || !isActive(current)) store.getState().newSession();
    setShowingDashboard(false);
  };

  if (showingDashboard) {
    return <PomodoroDashboard onClose={onClose} onStart={startFromDashboard} restore={() => store.getState().restore()} state={state} now={now} />;
  }

  const at = now();
  const confirmStop = () =>
    Alert.alert('Stop this focus session?', 'Your time so far will be saved in session history.', [
      { text: 'Stop session', style: 'destructive', onPress: () => store.getState().mutate((session, time) => stop(session, time)) },
      { text: 'Cancel', style: 'cancel' },
    ]);

  return (
    <View style={styles.fill} testID="pomodoro-timer">
      <LinearGradient colors={[withAlpha(PURPLE, 0.05), '#FFFFFF', withAlpha(BLUE, 0.06)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: 16 + insets.top, paddingBottom: 16 + insets.bottom }]} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Pressable accessibilityLabel="Pomodoro dashboard" accessibilityRole="button" onPress={() => setShowingDashboard(true)} style={styles.circleButton} testID="pomodoro-open-dashboard">
            <Ionicons color={INDIGO} name="chevron-back" size={20} />
          </Pressable>
          <Text accessibilityRole="header" style={styles.title2}>
            {current ? '' : 'Pomodoro'}
          </Text>
          <Pressable accessibilityLabel="Session history" accessibilityRole="button" onPress={() => setHistory(true)} style={styles.circleButton} testID="pomodoro-open-history">
            <Ionicons color={INDIGO} name="time-outline" size={20} />
          </Pressable>
        </View>
        {current ? (
          isActive(current) ? (
            <Timer compact={height < 740} now={at} onStop={confirmStop} session={current} store={store} />
          ) : (
            <Completion onAnother={() => store.getState().newSession()} onTasks={onTasks} session={current} />
          )
        ) : (
          <Setup onStart={(input) => store.getState().start(input)} />
        )}
        {state.syncMessage ? (
          <View style={styles.sync}>
            <Text style={[styles.caption, { color: SECONDARY }]}>{state.syncMessage}</Text>
            <Pressable accessibilityRole="button" disabled={state.syncing} onPress={() => void store.getState().restore()} testID="pomodoro-retry-sync">
              <Text style={[styles.body, { color: INDIGO, opacity: state.syncing ? 0.4 : 1 }]}>Retry sync</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      {/* `.sheet(isPresented: $history) { historyView }` (:73, :180-187): the dashboard on Sessions. */}
      <Modal animationType="slide" onRequestClose={() => setHistory(false)} presentationStyle="pageSheet" visible={history}>
        <PomodoroDashboard
          initialTab="Sessions"
          now={now}
          onClose={() => setHistory(false)}
          onStart={() => {
            setHistory(false);
            startFromDashboard();
          }}
          restore={() => store.getState().restore()}
          state={state}
        />
      </Modal>
    </View>
  );
}

/** `setup` (:87-122). */
function Setup({ onStart }: { onStart: (input: { category: PomodoroCategory; name: string; minutes: number; autoBreak: boolean; sound: boolean }) => void }) {
  const [category, setCategory] = useState<PomodoroCategory>('focus');
  const [name, setName] = useState('');
  const [minutes, setMinutes] = useState(25);
  const [autoBreak, setAutoBreak] = useState(true);
  const [sound, setSound] = useState(true);
  return (
    <View style={styles.setup} testID="pomodoro-setup">
      <Text style={[styles.body, styles.centered, { color: SECONDARY }]}>Choose a focus type and set your timer.</Text>
      <Text style={styles.headline}>Focus Category</Text>
      <View style={styles.categories}>
        {POMODORO_CATEGORIES.map((item) => {
          const on = item === category;
          return (
            <Pressable
              accessibilityLabel={POMODORO_CATEGORY_TITLES[item]}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              key={item}
              onPress={() => setCategory(item)}
              style={[styles.categoryRow, on && { backgroundColor: withAlpha(PURPLE, 0.09) }]}
              testID={`pomodoro-category-${item}`}
            >
              <View style={[styles.categoryIcon, { backgroundColor: TIMER_TINTS[item] }]}>
                <Ionicons color="#FFFFFF" name={CATEGORY_ICONS[item]} size={16} />
              </View>
              <Text style={[styles.body, styles.medium, styles.grow]}>{POMODORO_CATEGORY_TITLES[item]}</Text>
              <Ionicons color={on ? PURPLE : withAlpha(INDIGO, 0.4)} name={on ? 'checkmark-circle' : 'ellipse-outline'} size={22} />
            </Pressable>
          );
        })}
      </View>
      <View style={styles.field}>
        <Text style={styles.body}>+ Session name</Text>
        <TextInput
          accessibilityLabel="Session name (optional)"
          maxLength={120}
          onChangeText={setName}
          placeholder="What will you focus on?"
          placeholderTextColor="rgba(60, 60, 67, 0.3)"
          style={styles.nameInput}
          testID="pomodoro-name"
          value={name}
        />
      </View>
      <View style={styles.field}>
        <Text style={styles.body}>Focus Duration</Text>
        <View style={styles.stepper}>
          <Pressable
            accessibilityLabel="Decrease focus duration by 5 minutes"
            accessibilityRole="button"
            accessibilityState={{ disabled: minutes <= 5 }}
            disabled={minutes <= 5}
            onPress={() => setMinutes(Math.max(5, minutes - 5))}
            style={styles.stepButton}
            testID="pomodoro-minutes-down"
          >
            <Ionicons color={minutes <= 5 ? 'rgba(60, 60, 67, 0.3)' : INDIGO} name="remove-circle-outline" size={26} />
          </Pressable>
          <Text style={[styles.headline, styles.grow, styles.centered]} testID="pomodoro-minutes">{`${minutes} min`}</Text>
          <Pressable
            accessibilityLabel="Increase focus duration by 5 minutes"
            accessibilityRole="button"
            accessibilityState={{ disabled: minutes === 120 }}
            disabled={minutes === 120}
            onPress={() => setMinutes(Math.min(120, minutes + 5))}
            style={styles.stepButton}
            testID="pomodoro-minutes-up"
          >
            <Ionicons color={minutes === 120 ? 'rgba(60, 60, 67, 0.3)' : INDIGO} name="add-circle-outline" size={26} />
          </Pressable>
        </View>
      </View>
      <View style={styles.toggleRow}>
        <View style={styles.grow}>
          <Text style={styles.body}>Auto Start Break</Text>
          <Text style={[styles.caption, { color: SECONDARY }]}>Start a 5-minute break automatically after focus.</Text>
        </View>
        <IOSSwitch accessibilityLabel="Auto Start Break" onValueChange={setAutoBreak} testID="pomodoro-auto-break" tint={INDIGO} value={autoBreak} />
      </View>
      <View style={styles.toggleRow}>
        <Text style={[styles.body, styles.grow]}>Play Sound</Text>
        <IOSSwitch accessibilityLabel="Play Sound" onValueChange={setSound} testID="pomodoro-sound" tint={INDIGO} value={sound} />
      </View>
      <View style={styles.startSpacing}>
        <Primary
          onPress={() => {
            onStart({ category, name, minutes, autoBreak, sound });
            setName('');
          }}
          testID="pomodoro-start"
          title="Start Focus Session"
        />
      </View>
    </View>
  );
}

/** `timer(_:compact:)` (:123-163). */
function Timer({ session, compact, now, store, onStop }: { session: PomodoroSession; compact: boolean; now: number; store: PomodoroStoreApi; onStop: () => void }) {
  const isBreak = session.phase === 'shortBreak';
  const color = isBreak ? BLUE : PURPLE;
  const left = remaining(session, now);
  const ring = compact ? 240 : 300;
  return (
    <View style={[styles.timer, { gap: compact ? 10 : 20 }]} testID="pomodoro-running">
      <View style={[styles.phasePill, { backgroundColor: withAlpha(color, 0.08) }]}>
        <Ionicons color={color} name={isBreak ? 'cafe' : CATEGORY_ICONS[session.category]} size={15} />
        <Text style={[styles.subheadline, styles.semibold, { color }]}>{isBreak ? 'Short Break' : POMODORO_CATEGORY_TITLES[session.category]}</Text>
      </View>
      <Text style={[styles.title2, styles.centered]}>{isBreak ? 'Time for a short break!' : session.name === '' ? 'Time to focus' : session.name}</Text>
      {isBreak ? <Text style={[styles.body, { color: SECONDARY }]}>You’ve earned it! ☕</Text> : null}
      <View style={styles.ringWrap}>
        <ProgressRing fraction={1 - progress(session, now)} isBreak={isBreak} size={ring}>
          <View style={[styles.ringContent, { padding: compact ? 15 : 30 }]}>
            {isBreak ? (
              <Text style={{ fontSize: compact ? 48 : 65, lineHeight: compact ? 56 : 76 }}>☕</Text>
            ) : (
              <Image accessible={false} resizeMode="contain" source={POMODORO_TOMATO} style={{ width: compact ? 65 : 90, height: compact ? 60 : 82 }} />
            )}
            <Text adjustsFontSizeToFit minimumFontScale={0.6} numberOfLines={1} style={[styles.countdown, { fontSize: compact ? 42 : 54, lineHeight: compact ? 50 : 64 }]} testID="pomodoro-countdown">
              {countdown(left)}
            </Text>
            <Text style={styles.title3}>{session.paused ? 'Paused' : isBreak ? 'Short Break' : 'Focus Time'}</Text>
          </View>
        </ProgressRing>
      </View>
      <View style={[styles.quote, { backgroundColor: withAlpha(color, 0.06) }]}>
        <Text style={[styles.subheadline, styles.italic, styles.centered]}>{isBreak ? '“A rested mind is a more productive mind.”' : '“Small steps. Big results.” 💪'}</Text>
      </View>
      <View style={[styles.controls, { paddingVertical: compact ? 0 : 8 }]}>
        {isBreak ? (
          <>
            <Control color={BLUE} icon="play-skip-forward" onPress={() => store.getState().mutate((value, time) => stop(value, time))} title="Skip" />
            <Control color={BLUE} icon="stop" onPress={() => store.getState().mutate((value, time) => stop(value, time))} title="End Break" />
          </>
        ) : (
          <>
            <Control color={PINK} icon={session.paused ? 'play' : 'pause'} onPress={() => store.getState().mutate((value, time) => togglePause(value, time))} title={session.paused ? 'Resume' : 'Pause'} />
            <Control color={PINK} icon="stop" onPress={onStop} title="Stop" />
          </>
        )}
      </View>
      {!isBreak ? (
        <View style={[styles.awake, { backgroundColor: withAlpha(PURPLE, 0.06) }]}>
          <Ionicons color={PURPLE} name="moon" size={20} />
          <View style={styles.grow}>
            <Text style={[styles.subheadline, styles.semibold]}>Distraction-free mode</Text>
            <Text style={[styles.caption, { color: SECONDARY }]}>Keep this focus screen awake.</Text>
          </View>
          <IOSSwitch
            accessibilityLabel="Distraction-free mode"
            onValueChange={(value) => store.getState().mutate((item, time) => setKeepAwake(item, value, time))}
            testID="pomodoro-keep-awake"
            tint={INDIGO}
            value={session.keepAwake}
          />
        </View>
      ) : null}
    </View>
  );
}

/** `completion(_:)` (:164-177). */
function Completion({ session, onAnother, onTasks }: { session: PomodoroSession; onAnother: () => void; onTasks: () => void }) {
  const completed = session.phase === 'completed';
  return (
    <View style={styles.completion} testID="pomodoro-completion">
      <View style={styles.celebration}>
        {completed ? <Confetti /> : null}
        <LinearGradient colors={GRADIENT} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.badge}>
          <Ionicons color="#FFFFFF" name={completed ? 'checkmark' : 'stop'} size={46} />
        </LinearGradient>
      </View>
      <View style={styles.completionText}>
        <Text style={styles.largeTitle}>{completed ? 'Great job!' : 'Session stopped'}</Text>
        <Text style={[styles.body, { color: SECONDARY }]}>{completed ? 'Focus session completed.' : 'Your focus time has been saved.'}</Text>
      </View>
      <View style={styles.statistics}>
        <Statistic emoji="🍅" label="Focus time" time={completionDuration(session.focusSeconds)} />
        <View style={styles.vertical} />
        <Statistic emoji="☕" label="Break time" time={completionDuration(session.breakSeconds)} />
        <View style={styles.vertical} />
        <Statistic emoji="📅" label="Completed" time={completed ? '1' : '0'} />
      </View>
      <View style={[styles.summary, { backgroundColor: withAlpha(PURPLE, 0.07) }]}>
        <Ionicons color={PURPLE} name={CATEGORY_ICONS[session.category]} size={24} />
        <View style={styles.grow}>
          <Text style={[styles.body, styles.bold]}>{POMODORO_CATEGORY_TITLES[session.category]}</Text>
          {session.name !== '' ? <Text style={styles.subheadline}>{session.name}</Text> : null}
        </View>
      </View>
      <Primary onPress={onAnother} testID="pomodoro-another" title="Start Another Session" />
      <Pressable accessibilityRole="button" onPress={onTasks} style={[styles.secondary, { backgroundColor: withAlpha(PURPLE, 0.07) }]} testID="pomodoro-back-to-tasks">
        <Text style={[styles.headline, { color: INDIGO }]}>Back to Tasks</Text>
      </Pressable>
    </View>
  );
}

function Statistic({ emoji, time, label }: { emoji: string; time: string; label: string }) {
  return (
    <View style={styles.statistic}>
      <Text style={styles.emoji}>{emoji}</Text>
      <Text style={styles.headline}>{time}</Text>
      <Text style={styles.caption}>{label}</Text>
    </View>
  );
}

function Primary({ title, onPress, testID }: { title: string; onPress: () => void; testID: string }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} testID={testID}>
      <LinearGradient colors={GRADIENT} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.primary}>
        <Text style={styles.primaryText}>{title}</Text>
      </LinearGradient>
    </Pressable>
  );
}

function Control({ title, icon, color, onPress }: { title: string; icon: 'play-skip-forward' | 'stop' | 'play' | 'pause'; color: string; onPress: () => void }) {
  return (
    <Pressable accessibilityLabel={title} accessibilityRole="button" onPress={onPress} style={styles.control} testID={`pomodoro-control-${title.toLowerCase().replace(' ', '-')}`}>
      <View style={[styles.controlCircle, { backgroundColor: withAlpha(color, 0.1) }]}>
        <Ionicons color={color} name={icon} size={24} />
      </View>
      <Text style={styles.subheadline}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#FFFFFF' },
  grow: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 14, width: '100%', maxWidth: 620, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center' },
  circleButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(PURPLE, 0.07) },
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: '700', color: INK, textAlign: 'center' },
  title2: { flex: 1, fontSize: 22, lineHeight: 28, fontWeight: '700', color: INK, textAlign: 'center' },
  title3: { fontSize: 20, lineHeight: 25, color: INK },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600', color: INK },
  body: { fontSize: 17, lineHeight: 22, color: INK },
  subheadline: { fontSize: 15, lineHeight: 20, color: INK },
  caption: { fontSize: 12, lineHeight: 16, color: INK },
  emoji: { fontSize: 28, lineHeight: 34 },
  bold: { fontWeight: '700' },
  semibold: { fontWeight: '600' },
  medium: { fontWeight: '500' },
  italic: { fontStyle: 'italic' },
  centered: { textAlign: 'center' },
  sync: { alignItems: 'center', gap: 8 },
  setup: { gap: 12 },
  categories: {
    gap: 2,
    padding: 3,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    shadowColor: INDIGO,
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  categoryRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 5, borderRadius: 12 },
  categoryIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  field: { gap: 8 },
  nameInput: { padding: 12, borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: 'rgba(61, 41, 240, 0.5)', fontSize: 17, color: INK },
  stepper: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, backgroundColor: '#FFFFFF' },
  stepButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  // `.padding(.top, max(0, startButtonSpacing - 12))`, `@ScaledMetric startButtonSpacing = 60`.
  startSpacing: { paddingTop: 48 },
  primary: { padding: 17, borderRadius: 16, alignItems: 'center' },
  primaryText: { color: '#FFFFFF', fontSize: 17, lineHeight: 22, fontWeight: '600' },
  timer: { alignItems: 'center' },
  phasePill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999 },
  ringWrap: { padding: 8, alignSelf: 'stretch', alignItems: 'center' },
  ringContent: { alignItems: 'center', gap: 8 },
  countdown: { fontWeight: '700', color: INK, fontVariant: ['tabular-nums'] },
  quote: { alignSelf: 'stretch', padding: 16, borderRadius: 16 },
  controls: { flexDirection: 'row', gap: 40 },
  control: { alignItems: 'center', gap: 10 },
  controlCircle: { width: 66, height: 66, borderRadius: 33, alignItems: 'center', justifyContent: 'center' },
  awake: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 18 },
  completion: { gap: 24 },
  celebration: { height: 180, alignItems: 'center', justifyContent: 'center' },
  badge: {
    width: 110,
    height: 110,
    borderRadius: 55,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: PURPLE,
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  completionText: { alignItems: 'center', gap: 8 },
  statistics: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    shadowColor: INDIGO,
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  statistic: { flex: 1, alignItems: 'center', gap: 8 },
  vertical: { width: StyleSheet.hairlineWidth, height: 60, backgroundColor: 'rgba(60, 60, 67, 0.29)' },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, borderRadius: 18 },
  secondary: { padding: 16, borderRadius: 16, alignItems: 'center' },
});
