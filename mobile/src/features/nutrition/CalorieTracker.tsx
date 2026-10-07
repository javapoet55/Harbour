import Ionicons from '@expo/vector-icons/Ionicons';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { NutritionEntry, NutritionInsight, NutritionMeal, NutritionNoAnswer, NutritionSettings, NutritionSettingsUpdate } from '../../api/nutrition';
import { IOSSwitch } from '../../components/IOSSwitch';
import { ClockField } from '../../components/SettingsControls';
import { withAlpha } from '../../components/SignInBackdrop';
import { Text } from '../../components/Text';
import { clockLabel } from '../../lib/profileSettings';
import { MenuPicker } from '../moments/form';
import { CALORIE_AGENT } from '../wellness/art';
import { FoodEditor, type FoodDraft } from './FoodEditor';
import { callNowNotice, chartValues, DEFAULT_VOICES, e164, goalsFrom, intake, MEALS, needsReview, NO_ANSWER_CHOICES, NUTRIENTS, nutritionDay, nutritionZone, zoneChoices } from './model';
import { CalorieRing, Card, ChartBars, DateSelector, Feature, GRADIENT, IconTile, INK, Primary, ProgressBar, SECONDARY, Segmented, Stepper, Steps, styles as parts, SYSTEM_INDIGO, TextButton, type IconName } from './parts';
import { SAMPLE_INTAKE } from './sample';
import { useCalorieStore } from './useCalorieStore';
import { useNutritionSettings } from '../../query/useNutrition';

/** An integer as SwiftUI's `Text("\(n)")` prints it: a `LocalizedStringKey` groups thousands ("2,000"). */
function grouped(value: number): string {
  return value.toLocaleString('en-US');
}

/**
 * `CalorieTrackerView` (ios/App/CalorieTrackerView.swift:245-916): the Daily Food Check-in. Eight pages
 * under one header, moved between with Swift's own `page` and `history` (`go(_:)` pushes, Back pops, and
 * Back on the first page closes) — not a navigation stack.
 *
 * `live` is Swift's `store.live`: true with the signed-in account's API, false for the design preview,
 * where the same pages show sample data, sample labels, and save nothing.
 */

export type CaloriePage = 'intro' | 'time' | 'goals' | 'confirm' | 'ready' | 'dashboard' | 'insights' | 'log';
type Period = 'Today' | 'Week' | 'Month';

/** `labels`, `units`, `symbols` and `colors` (:283-287). Ionicons for the SF Symbols. */
const SYMBOLS: IconName[] = ['grid', 'nutrition', 'water', 'leaf', 'water', 'flame', 'sunny', 'fish'];
const COLORS = ['#FF2D55', '#FF9500', '#FFCC00', '#34C759', '#007AFF', '#FF3B30', '#FF9500', '#007AFF'];
const DEFAULT_GOALS = NUTRIENTS.map((row) => row.goal);

const TITLES: Record<CaloriePage, (live: boolean) => string> = {
  intro: () => 'Create Agent',
  time: () => 'Daily Food Check-in',
  goals: () => 'Daily Food Check-in',
  confirm: () => 'Review & Confirm',
  ready: (live) => (live ? 'Daily Check-in' : 'Agent Preview'),
  dashboard: () => 'Nutrition',
  insights: () => 'Nutrition Insights',
  log: () => 'Today’s Food Log',
};

/** `zoneName(_:)` (:451-454): the zone's generic name ("Pacific Time"), UTC as itself. */
export function zoneName(id: string): string {
  if (id === 'UTC') return id;
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: id, timeZoneName: 'longGeneric' }).formatToParts(new Date()).find((part) => part.type === 'timeZoneName')?.value ?? id;
  } catch {
    return id;
  }
}

/** The device region `CalorieStore.e164` reads (`Locale.current … countryCode`). */
export function deviceRegion(): string | null {
  const locale = Intl.DateTimeFormat().resolvedOptions().locale;
  return /[-_]([A-Z]{2})\b/.exec(locale)?.[1] ?? null;
}

function capitalized(value: string): string {
  return value.replace(/(^|[^\p{L}\p{N}])(\p{L})/gu, (_match, before: string, letter: string) => before + letter.toUpperCase());
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

export function CalorieTracker({ live, onClose, now = Date.now, region = deviceRegion() }: { live: boolean; onClose: () => void; now?: () => number; region?: string | null }) {
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState<CaloriePage>('intro');
  const [history, setHistory] = useState<CaloriePage[]>([]);
  const [callTime, setCallTime] = useState('20:00');
  const [timeZoneID, setTimeZoneID] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [repeatDaily, setRepeatDaily] = useState(true);
  const [noAnswer, setNoAnswer] = useState<string>('NOTIFY');
  const [voice, setVoice] = useState('marin');
  const [calorieGoal, setCalorieGoal] = useState(2000);
  const [goals, setGoals] = useState<number[]>(DEFAULT_GOALS);
  const [goalsVersion, setGoalsVersion] = useState(0);
  const [phoneInput, setPhoneInput] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [editingPhone, setEditingPhone] = useState(false);
  /** How the last code went out (`channel` in the server's answer). */
  const [codeByText, setCodeByText] = useState(false);
  const [working, setWorking] = useState(false);
  const [period, setPeriod] = useState<Period>('Today');
  const [insightsTab, setInsightsTab] = useState<'Insights' | 'Recommendations'>('Insights');
  const [selectedDate, setSelectedDate] = useState(now);
  const [editor, setEditor] = useState<FoodDraft | null>(null);
  const [insightsEnabled, setInsightsEnabled] = useState(true);
  const [started, setStarted] = useState(false);

  const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  // `userZone` (:295): the saved settings' zone, else the one being chosen. The same cached query the store reads.
  const savedSettings = useNutritionSettings({ enabled: live }).data;
  const userZone = nutritionZone({ timeZone: (live ? savedSettings?.timeZone : undefined) ?? timeZoneID }, deviceZone);
  const dateKey = nutritionDay(selectedDate, userZone);
  const isToday = dateKey === nutritionDay(now(), userZone);
  /** The one alert (:356-358): an error or a notice, titled by whether this is the preview. */
  const setNotice = (text: string) => Alert.alert(live ? 'Calorie Tracker' : 'Calorie Tracker Preview', text, [{ text: 'OK', style: 'cancel' }]);
  const store = useCalorieStore({ live, dateKey, period, onInsightsPage: page === 'insights', isToday, onError: setNotice });

  const entries = store.day?.entries ?? [];
  const total = store.day?.totals.kcal ?? 0;
  const goal = live ? (store.settings?.calorieGoal ?? calorieGoal) : calorieGoal;
  const ratio = Math.min(total / Math.max(goal, 1), 1);
  const phoneVerified = store.settings?.phoneVerified === true && !editingPhone;
  const voices = store.settings?.voices ?? DEFAULT_VOICES;
  const callLabel = clockLabel(callTime, 'h12');
  const statusLine = !live
    ? 'UI Preview · Sample data · No calls are scheduled'
    : !store.settings
      ? 'Loading…'
      : store.settings.enabled
        ? `Daily call at ${callLabel}`
        : 'Daily calls are off';

  /** `apply(_:)` (:384-394). */
  const apply = (settings: NutritionSettings) => {
    setCallTime(settings.localTime);
    setTimeZoneID(settings.timeZone);
    setRepeatDaily(settings.repeatDaily);
    setNoAnswer(settings.noAnswer);
    setVoice(settings.voice);
    setCalorieGoal(settings.calorieGoal);
    setGoals((current) => goalsFrom(settings.goals, current));
    setGoalsVersion((value) => value + 1);
    setPhoneInput(settings.phone ?? '');
    setInsightsEnabled(settings.insightsEnabled ?? true);
  };

  // `start()` (:367-374): once the settings load, apply them; a check-in already on opens the dashboard.
  // Adjusted while rendering, once, as React documents for state that follows a prop.
  if (live && !started && store.settings) {
    setStarted(true);
    apply(store.settings);
    if (store.settings.enabled) {
      setHistory([]);
      setPage('dashboard');
    }
  }

  const go = (next: CaloriePage) => {
    setHistory((list) => [...list, page]);
    setPage(next);
    if (next === 'insights' || next === 'dashboard' || next === 'log') store.refresh();
  };
  const back = () => {
    if (history.length === 0) return onClose();
    setPage(history[history.length - 1]);
    setHistory(history.slice(0, -1));
  };
  const perform = async (work: () => Promise<void>) => {
    setWorking(true);
    try {
      await work();
    } finally {
      setWorking(false);
    }
  };

  /** `settingsUpdate` (:396-400): goals clamped to 1 … 10,000; the insight switch only when live. */
  const settingsUpdate = (): NutritionSettingsUpdate => ({
    localTime: callTime,
    timeZone: timeZoneID,
    repeatDaily,
    noAnswer: noAnswer as NutritionNoAnswer,
    voice,
    calorieGoal,
    goals: Object.fromEntries(NUTRIENTS.map((row, index) => [row.label, Math.min(10000, Math.max(1, goals[index]))])),
    ...(live ? { insightsEnabled } : {}),
  });

  const openEditor = (name = '', entry?: NutritionEntry) =>
    setEditor({ entry: entry ?? null, name: entry?.description ?? name, calories: entry ? String(entry.kcal) : '', meal: (entry?.meal as NutritionMeal) ?? 'BREAKFAST' });

  const intakeAt = (index: number): number | null => (live ? intake(store.day?.totals, index) : SAMPLE_INTAKE[index]);

  // ---------------------------------------------------------------------------------------------
  // Pages

  const art = (height: number) => <Image accessible={false} resizeMode="contain" source={CALORIE_AGENT} style={[styles.art, { height }]} />;

  const intro = (
    <>
      {art(165)}
      <Text style={[parts.title2, styles.centered]}>Daily Food Check-in</Text>
      <Text style={[parts.body, styles.centered, { color: SECONDARY }]}>
        {live
          ? 'Build a daily habit. NexDo calls you once a day, logs what you ate and adds up the calories.'
          : 'Build a daily habit. Plan a check-in, track meals and explore your nutrition goals.'}
      </Text>
      <Feature
        color="#34C759"
        detail={live ? 'A short, natural conversation about your meals and snacks — five minutes at most.' : 'Preview a natural conversation about your meals and snacks.'}
        icon="call"
        title="AI calls you daily"
      />
      <Feature color="#AF52DE" detail="See how your daily meals fit your nutrition goals." icon="bar-chart" title="Tracks calories & nutrients" />
      <Feature
        color="#FF9500"
        detail={live ? 'Follow your week and month, and review anything the call wasn’t sure about.' : 'Explore progress and food ideas in the sample dashboard.'}
        icon="bulb"
        title="Personalized insights"
      />
      <Primary onPress={() => go('time')} testID="calorie-set-up" title="Set Up Agent" />
      <TextButton onPress={() => go('dashboard')} testID="calorie-to-dashboard" title={live ? 'Go to my dashboard' : 'Explore sample dashboard'} />
      <TextButton
        onPress={() =>
          setNotice(
            live
              ? 'At your chosen time NexDo phones you and asks what you ate. Calories come from USDA and Open Food Facts nutrition data; anything it has to estimate is marked for you to review. Calls are only placed between 8:00 AM and 9:30 PM and last five minutes at most.'
              : 'This is a design preview. Check-in calls, nutrition calculations and saved history will be connected in a future release.',
          )
        }
        testID="calorie-learn-more"
        title="Learn more"
      />
    </>
  );

  const timeSetup = (
    <>
      <Steps current={0} />
      <Text style={parts.title3}>When should NexDo call you?</Text>
      <Text style={[parts.body, { color: SECONDARY }]}>Choose a time for your daily meal check-in.</Text>
      <Card>
        <ClockField hourCycle="h12" label="Call time" onChange={setCallTime} testID="calorie-call-time" value={callTime} variant="formRow" />
        <Divider />
        <MenuPicker hideLabel label="Time zone" onChange={setTimeZoneID} options={zoneChoices(timeZoneID).map((value) => ({ value, title: zoneName(value) }))} testID="calorie-time-zone" value={timeZoneID} />
        <Divider />
        <ToggleRow label="Repeat every day" onChange={setRepeatDaily} testID="calorie-repeat" value={repeatDaily} />
        <Divider />
        <MenuPicker hideLabel label="Agent voice" onChange={setVoice} options={voices.map((value) => ({ value, title: capitalized(value) }))} testID="calorie-voice" value={voice} />
      </Card>
      <Text style={[parts.caption, { color: SECONDARY }]}>Calls are placed between 8:00 AM and 9:30 PM.</Text>
      <Text style={parts.headline}>If I don’t answer</Text>
      <Card>
        {NO_ANSWER_CHOICES.map((choice) => {
          const on = noAnswer === choice.key;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              key={choice.key}
              onPress={() => setNoAnswer(choice.key)}
              style={styles.choice}
              testID={`calorie-no-answer-${choice.key}`}
            >
              <Ionicons color={SYSTEM_INDIGO} name={on ? 'checkmark-circle' : 'ellipse-outline'} size={22} />
              <View style={parts.grow}>
                <Text style={parts.headline}>{choice.title}</Text>
                <Text style={[parts.caption, { color: SECONDARY }]}>{choice.detail}</Text>
              </View>
            </Pressable>
          );
        })}
      </Card>
      <Primary onPress={() => go('goals')} testID="calorie-time-next" title="Next" />
    </>
  );

  const goalRows = (from: number, to: number) => (
    <Card>
      {NUTRIENTS.slice(from, to).map((row, offset) => {
        const index = from + offset;
        return (
          <View key={row.label} style={styles.goalRow}>
            <View style={styles.goalIcon}>
              <Ionicons color={COLORS[index]} name={SYMBOLS[index]} size={18} />
            </View>
            <Text style={[parts.subheadline, parts.grow]}>{row.label}</Text>
            <GoalField
              key={`${row.label}-${goalsVersion}`}
              label={row.label}
              onChange={(value) => setGoals((current) => current.map((item, at) => (at === index ? value : item)))}
              testID={`calorie-goal-${index}`}
              value={goals[index]}
            />
            <Text style={[parts.caption, styles.unit, { color: SECONDARY }]}>{row.unit}</Text>
          </View>
        );
      })}
    </Card>
  );

  const goalSetup = (
    <>
      <Steps current={1} />
      <Text style={parts.title2}>Your Nutrition Goals</Text>
      <Text style={[parts.subheadline, { color: SECONDARY }]}>Customize your targets. These values are examples, not personalized recommendations.</Text>
      <Card>
        <View style={styles.goalHeader}>
          <IconTile color="#FF3B30" name="flame" />
          <View>
            <Text style={parts.body}>Daily calorie goal</Text>
            <Text style={parts.title2} testID="calorie-goal-value">{`${grouped(calorieGoal)} kcal`}</Text>
          </View>
        </View>
        <Stepper label="Adjust calories" max={5000} min={500} onChange={setCalorieGoal} step={50} testID="calorie-goal-stepper" value={calorieGoal} />
      </Card>
      <Text style={parts.headline}>Macro Targets</Text>
      {goalRows(0, 3)}
      <Text style={parts.headline}>Key Nutrients (Optional)</Text>
      {goalRows(3, 8)}
      {live ? (
        <Card>
          <ToggleRow label="Daily insight" onChange={setInsightsEnabled} testID="insights-toggle" value={insightsEnabled} />
          <Text style={[parts.caption, { color: SECONDARY }]}>
            One factual observation a day about your own goals, with an optional shopping suggestion. It never labels foods good or bad.
          </Text>
        </Card>
      ) : null}
      <TextButton
        inline
        onPress={() => {
          setCalorieGoal(2000);
          setGoals(DEFAULT_GOALS);
          setGoalsVersion((value) => value + 1);
        }}
        testID="calorie-restore-goals"
        title="↺ Restore sample values"
      />
      <Primary
        onPress={() => {
          setGoals((current) => current.map((value) => Math.min(10000, Math.max(1, value))));
          setGoalsVersion((value) => value + 1);
          go('confirm');
        }}
        testID="calorie-goals-next"
        title="Next"
      />
    </>
  );

  const summary = (
    <Card testID="calorie-summary">
      <SummaryLabel icon="time-outline" text={`Call time: ${callLabel}`} />
      <Divider />
      <SummaryLabel icon="globe-outline" text={zoneName(timeZoneID)} />
      <SummaryLabel icon="repeat" text={repeatDaily ? 'Every day' : 'One check-in'} />
      <SummaryLabel icon="pulse" text={`Voice: ${capitalized(voice)}`} />
      <SummaryLabel icon="flame-outline" text={`${grouped(calorieGoal)} kcal goal`} />
      <SummaryLabel icon="restaurant-outline" text="Protein, Carbs, Fats & key nutrients" />
      <SummaryLabel icon="notifications-outline" text={`If no answer: ${NO_ANSWER_CHOICES.find((choice) => choice.key === noAnswer)?.title ?? noAnswer}`} />
    </Card>
  );

  const phoneCard = (
    <Card testID="calorie-phone">
      <View style={styles.label}>
        <Ionicons color={INK} name="call" size={17} />
        <Text style={parts.headline}>Your phone number</Text>
      </View>
      {phoneVerified ? (
        <View style={styles.row}>
          <Ionicons color="#34C759" name="shield-checkmark" size={20} />
          <Text style={[parts.body, parts.grow]}>{store.settings?.phone ?? phoneInput}</Text>
          <TextButton
            inline
            onPress={() => {
              setEditingPhone(true);
              setCodeSent(false);
              setCodeInput('');
            }}
            testID="calorie-change-phone"
            title="Change"
          />
        </View>
      ) : (
        <>
          <Text style={[parts.caption, { color: SECONDARY }]}>
            {codeSent && codeByText ? "NexDo calls this number. First we'll text it a 6-digit code." : "NexDo calls this number. First we'll call it once and read out a 6-digit code."}
          </Text>
          <TextInput
            autoComplete="tel"
            keyboardType="phone-pad"
            onChangeText={setPhoneInput}
            placeholder="Mobile number, e.g. +1 650 555 0123"
            placeholderTextColor="rgba(60, 60, 67, 0.3)"
            style={styles.input}
            testID="calorie-phone-input"
            textContentType="telephoneNumber"
            value={phoneInput}
          />
          <TextButton
            inline
            onPress={() => {
              const number = e164(phoneInput, region);
              if (!number) return setNotice('Enter your mobile number with its country code, for example +1 650 555 0123.');
              void perform(async () => {
                // Android ahead of iOS: Swift always says it is calling (CalorieTrackerView.swift:590-595). The
                // server sends the code by voice or SMS, and sends none for a number it has already verified.
                const answer = await store.sendCode(number);
                if (!answer) return;
                if (answer.alreadyVerified) {
                  setEditingPhone(false);
                  setCodeSent(false);
                  setCodeInput('');
                  setNotice(`${number} is already verified.`);
                  return;
                }
                const byText = answer.channel === 'sms';
                setCodeByText(byText);
                setCodeSent(true);
                setNotice(byText ? `We’ve texted a 6-digit code to ${number}.` : `Calling ${number} now. Answer to hear your 6-digit code.`);
              });
            }}
            testID="calorie-send-code"
            title={codeSent ? (codeByText ? 'Text me again with a code' : 'Call me again with a code') : 'Call me with a code'}
          />
          {codeSent ? (
            <>
              <TextInput
                autoComplete="sms-otp"
                keyboardType="number-pad"
                onChangeText={setCodeInput}
                placeholder="6-digit code"
                placeholderTextColor="rgba(60, 60, 67, 0.3)"
                style={styles.input}
                testID="calorie-code-input"
                textContentType="oneTimeCode"
                value={codeInput}
              />
              <TextButton
                disabled={codeInput.replace(/\D/g, '').length !== 6}
                inline
                onPress={() =>
                  void perform(async () => {
                    if (await store.verify(codeInput.replace(/\D/g, ''))) {
                      setEditingPhone(false);
                      setCodeSent(false);
                      setCodeInput('');
                    }
                  })
                }
                testID="calorie-verify"
                title="Verify"
              />
            </>
          ) : null}
        </>
      )}
    </Card>
  );

  const confirmation = (
    <>
      <Steps current={2} />
      {art(125)}
      <Text style={[parts.title2, styles.centered]}>Daily Food Check-in</Text>
      <Text style={[parts.body, { color: SECONDARY }]}>
        {live ? 'Here’s what you’ve set up. You can change these options anytime.' : 'Here’s what you’ve set up. You can change these options anytime in this preview.'}
      </Text>
      {summary}
      {live ? phoneCard : null}
      {live ? (
        <>
          <Primary
            disabled={!phoneVerified}
            onPress={() =>
              void perform(async () => {
                if (await store.save({ ...settingsUpdate(), enabled: true })) {
                  setHistory(['intro']);
                  setPage('ready');
                }
              })
            }
            testID="calorie-turn-on"
            title="Turn On Daily Calls"
          />
          <TextButton
            onPress={() =>
              void perform(async () => {
                if (await store.save(settingsUpdate())) go('dashboard');
              })
            }
            testID="calorie-save-without-calls"
            title="Save without calls"
          />
        </>
      ) : (
        <>
          <Primary onPress={() => go('ready')} testID="calorie-preview-activation" title="Preview Activation" />
          <TextButton onPress={() => go('dashboard')} testID="calorie-maybe-later" title="Maybe later" />
        </>
      )}
    </>
  );

  const ready = (
    <>
      <View style={styles.readyIcon}>
        <MaskedView maskElement={<Ionicons name="checkmark-circle" size={80} />} style={styles.readyMask}>
          <LinearGradient colors={GRADIENT} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
        </MaskedView>
      </View>
      <Text style={[parts.largeTitle, styles.centered]}>All Set!</Text>
      <Text style={[parts.body, styles.centered, { color: SECONDARY }]}>
        {live ? `NexDo will call you at ${callLabel} to log your meals.` : 'Your check-in design is ready. No agent has been activated and no calls will be placed.'}
      </Text>
      {summary}
      <Text style={parts.headline}>What happens next?</Text>
      <Feature
        color={SYSTEM_INDIGO}
        detail={live ? 'Answer the call and tell NexDo what you ate. It reads the list back before saving.' : 'A future voice agent will ask about your meals.'}
        icon={1}
        title="Daily check-in"
      />
      <Feature color="#007AFF" detail="Review your food log and nutrition progress." icon={2} title="Track your day" />
      <Feature color="#34C759" detail="Explore insights and adjust your goals." icon={3} title="Build healthy habits" />
      <Primary
        onPress={() => {
          setHistory(['intro']);
          setPage('dashboard');
          store.refresh();
        }}
        testID="calorie-view-dashboard"
        title="View Nutrition Dashboard"
      />
      {live ? (
        <TextButton
          onPress={() =>
            void perform(async () => {
              // Android ahead of iOS: Swift drops the answer's `status` and always says it is calling
              // (CalorieTrackerView.swift:643-644).
              const status = await store.callNow();
              if (status !== null) setNotice(callNowNotice(status));
            })
          }
          testID="calorie-call-now"
          title="Call me now to try it"
        />
      ) : null}
      <TextButton onPress={() => go('time')} testID="calorie-edit-setup" title="Edit setup" />
    </>
  );

  const dateSelector = <DateSelector at={selectedDate} now={now()} onChange={setSelectedDate} zone={userZone} />;

  const chart = (() => {
    if (live) return chartValues(store.summary, period === 'Week' ? 'Week' : 'Month');
    const daily = store.summary?.daily ?? [];
    if (period === 'Week') return { values: daily.map((day) => day.kcal), labels: ['M', 'T', 'W', 'T', 'F', 'S', 'S'] };
    // Previews' sample dates don't parse, so the month falls back to chunks of seven (:706-712).
    const recent = daily.slice(-28);
    const values: number[] = [];
    for (let at = 0; at < recent.length; at += 7) {
      const logged = recent.slice(at, at + 7).filter((day) => day.kcal > 0);
      values.push(logged.length === 0 ? 0 : Math.trunc(logged.reduce((sum, day) => sum + day.kcal, 0) / logged.length));
    }
    return { values, labels: values.map((_, index) => `W${index + 1}`) };
  })();

  const reviewCount = store.day?.needsReview ?? 0;

  const dashboard = (
    <>
      <Segmented
        onChange={setPeriod}
        options={(['Today', 'Week', 'Month'] as const).map((value) => ({ value, title: value }))}
        testID="calorie-period"
        value={period}
      />
      {dateSelector}
      {period === 'Today' && isToday && live && store.insight && (store.insight.state === 'open' || store.insight.state === 'added') ? (
        <InsightCard insight={store.insight} onAct={(add) => void store.actOnInsight(add)} />
      ) : null}
      {period === 'Today' ? (
        <>
          <View style={styles.today}>
            <View accessibilityLabel={`${total} of ${goal} calories`} accessible style={styles.ringWrap}>
              <CalorieRing ratio={ratio}>
                <Text style={parts.largeTitle} testID="calorie-total">
                  {total.toLocaleString('en-US')}
                </Text>
                <Text style={parts.caption}>{`of ${grouped(goal)} kcal`}</Text>
              </CalorieRing>
            </View>
            <View style={styles.todayCards}>
              <Card>
                <Text style={parts.title2} testID="calorie-left">
                  {grouped(Math.max(0, goal - total))}
                </Text>
                <Text style={parts.caption}>kcal left</Text>
              </Card>
              <Card>
                <Text style={parts.headline} testID="calorie-percent">{`${Math.trunc(ratio * 100)}%`}</Text>
                <Text style={parts.caption}>of daily goal</Text>
              </Card>
            </View>
          </View>
          {live && reviewCount > 0 ? (
            <Pressable accessibilityRole="button" onPress={() => go('log')} style={styles.label} testID="calorie-review-link">
              <Ionicons color="#FF9500" name="alert-circle" size={16} />
              <Text style={[parts.subheadline, { color: '#FF9500' }]}>{`${plural(reviewCount, 'item')} to review in your food log`}</Text>
            </Pressable>
          ) : null}
        </>
      ) : (
        <Card testID="calorie-chart-card">
          <Text style={parts.headline}>{period === 'Week' ? (live ? 'Calories · This week (Mon–Sun)' : 'Calories · Last 7 days') : 'Calories · Weekly averages'}</Text>
          <ChartBars goal={goal} labels={chart.labels} values={chart.values} />
          {live && store.summary ? (
            <Text style={[parts.caption, { color: SECONDARY }]}>
              {store.summary.daysLogged === 0 ? 'Nothing logged in this period yet' : `Average ${store.summary.averageKcal} kcal on ${plural(store.summary.daysLogged, 'logged day')}`}
            </Text>
          ) : !live ? (
            <Text style={[parts.caption, { color: SECONDARY }]}>Illustrative trends · Sample data</Text>
          ) : null}
        </Card>
      )}
      <View style={styles.macros}>
        {[0, 1, 2].map((index) => (
          <View key={index} style={parts.grow}>
            <Card testID={`calorie-macro-${index}`}>
              <Text style={[parts.subheadline, parts.bold]}>{NUTRIENTS[index].label}</Text>
              <Text style={parts.caption}>{`${intakeAt(index) ?? 0} / ${Math.max(1, goals[index])} g`}</Text>
              <ProgressBar color={COLORS[index]} value={(intakeAt(index) ?? 0) / Math.max(1, goals[index])} />
            </Card>
          </View>
        ))}
      </View>
      <View style={styles.row}>
        <Text style={[parts.headline, parts.grow]}>Key Nutrients</Text>
        <Pressable accessibilityRole="button" onPress={() => go('insights')} testID="calorie-view-insights">
          <Text style={[parts.subheadline, { color: INK }]}>View Insights</Text>
        </Pressable>
      </View>
      <Card testID="calorie-key-nutrients">
        {[3, 4, 5, 6, 7].map((index) => {
          const value = intakeAt(index);
          const target = Math.max(1, goals[index]);
          return (
            <View key={index} style={styles.nutrient}>
              <View style={styles.row}>
                <Ionicons color={COLORS[index]} name={SYMBOLS[index]} size={17} />
                <Text style={[parts.body, parts.grow]}>{NUTRIENTS[index].label}</Text>
                {value !== null ? (
                  <Text style={parts.caption}>{`${value} / ${target} ${NUTRIENTS[index].unit}`}</Text>
                ) : (
                  <Text style={[parts.caption, { color: SECONDARY }]}>{`Goal ${grouped(target)} ${NUTRIENTS[index].unit}`}</Text>
                )}
              </View>
              {value !== null ? <ProgressBar color={COLORS[index]} value={value / target} /> : null}
            </View>
          );
        })}
        {live ? (
          <Text style={[parts.caption, { color: SECONDARY }]}>
            Omega-3 isn’t tracked yet. Other values come from USDA and Open Food Facts data for the foods you log; estimated items don’t add to them.
          </Text>
        ) : null}
      </Card>
      <Primary onPress={() => go('log')} testID="calorie-view-log" title="View Food Log" />
      <TextButton onPress={() => go('time')} testID="calorie-manage" title="Manage daily check-in" />
      {live && store.settings?.enabled ? (
        <TextButton
          destructive
          onPress={() =>
            void perform(async () => {
              if (await store.save({ enabled: false })) setNotice('Daily calls are paused. Turn them back on from Manage daily check-in.');
            })
          }
          testID="calorie-pause"
          title="Pause daily calls"
        />
      ) : null}
    </>
  );

  const insights = (
    <>
      <Segmented
        onChange={setInsightsTab}
        options={[
          { value: 'Insights', title: 'Insights' },
          { value: 'Recommendations', title: 'Recommendations' },
        ]}
        testID="calorie-insights-tab"
        value={insightsTab}
      />
      <Card>
        <Feature
          color="#FF9500"
          detail={live ? `You’ve logged ${Math.trunc(ratio * 100)}% of today’s calorie goal.` : `You’ve logged ${Math.trunc(ratio * 100)}% of your sample calorie goal.`}
          icon="bulb"
          title="Keep building your habit"
        />
      </Card>
      {insightsTab === 'Insights' ? (
        live ? (
          <>
            <Text style={parts.title3}>This Week</Text>
            <Card testID="calorie-this-week">
              <Feature
                color={SYSTEM_INDIGO}
                detail={`Average ${store.summary?.averageKcal ?? 0} kcal on the days you logged, against a ${goal} kcal goal.`}
                icon="calendar"
                title={`${store.summary?.daysLogged ?? 0} of 7 days logged`}
              />
            </Card>
            {reviewCount > 0 ? (
              <Card>
                <Feature
                  color="#FF9500"
                  detail="These calories were estimated because the food wasn’t found in the nutrition database. Check them in your food log."
                  icon="alert-circle"
                  title={`${plural(reviewCount, 'item')} to review`}
                />
              </Card>
            ) : null}
          </>
        ) : (
          <>
            <Text style={parts.title3}>Nutrient Gaps</Text>
            {[3, 6, 7].map((index) => (
              <Card key={index} testID={`calorie-gap-${index}`}>
                <Feature color={COLORS[index]} detail={`${Math.max(0, goals[index] - SAMPLE_INTAKE[index])} ${NUTRIENTS[index].unit} below the sample target`} icon={SYMBOLS[index]} title={NUTRIENTS[index].label} />
                <Text style={[parts.subheadline, { color: SECONDARY }]}>
                  {index === 3 ? 'Explore fruits, vegetables and whole grains.' : index === 6 ? 'Explore foods containing vitamin D.' : 'Explore fish, flaxseed and other sources of omega-3.'}
                </Text>
              </Card>
            ))}
          </>
        )
      ) : null}
      <Text style={parts.title3}>Food Ideas</Text>
      {['🥣 Greek yogurt', '🌱 Chia seeds', '🐟 Salmon'].map((name) => (
        <Card key={name}>
          <View style={styles.row}>
            <Text style={[parts.headline, parts.grow]}>{name}</Text>
            <Pressable accessibilityLabel="Add to log" accessibilityRole="button" onPress={() => openEditor(Array.from(name).slice(2).join(''))} testID={`calorie-idea-${name}`}>
              <Ionicons color={INK} name="add-circle" size={26} />
            </Pressable>
          </View>
          <Text style={[parts.caption, { color: SECONDARY }]}>{live ? 'Add it to your food log for this day.' : 'Explore this food in your sample meal log.'}</Text>
        </Card>
      ))}
      <Text style={[parts.caption, { color: SECONDARY }]}>These ideas are general examples; they are not an assessment of your nutrition or supplement needs.</Text>
      <Primary onPress={() => go('log')} testID="calorie-open-log" title="Open Food Log" />
    </>
  );

  const foodLog = (
    <>
      {dateSelector}
      <Text style={[parts.caption, { color: SECONDARY }]}>{live ? 'Items from your check-in call and ones you add here' : 'Sample meals · Edits last while this preview is open'}</Text>
      {MEALS.map((group) => {
        const items = entries.filter((entry) => entry.meal === group.key);
        return (
          <Card key={group.key} testID={`calorie-meal-${group.key}`}>
            <View style={styles.row}>
              <Text style={[parts.headline, parts.grow]}>{group.title}</Text>
              <Text style={parts.subheadline}>{`${grouped(items.reduce((sum, entry) => sum + entry.kcal, 0))} kcal`}</Text>
            </View>
            {items.map((food) => (
              <View key={food.id}>
                <Divider />
                <FoodRow
                  food={food}
                  onConfirm={() => void store.update(food, { confirm: true })}
                  onEdit={() => openEditor('', food)}
                  onRemove={() => void store.remove(food)}
                />
              </View>
            ))}
          </Card>
        );
      })}
      <Card testID="calorie-log-total">
        <View style={styles.label}>
          <Ionicons color={INK} name="flame" size={17} />
          <Text style={parts.body}>Total Calories</Text>
        </View>
        <Text style={parts.title2}>{`${grouped(total)} / ${grouped(goal)} kcal`}</Text>
        <ProgressBar color="#00C7BE" value={ratio} />
      </Card>
      <Primary onPress={() => openEditor('')} testID="calorie-add-food" title="Add Food" />
    </>
  );

  const content: Record<CaloriePage, React.ReactNode> = { intro, time: timeSetup, goals: goalSetup, confirm: confirmation, ready, dashboard, insights, log: foodLog };

  return (
    <View style={styles.fill} testID={`calorie-page-${page}`}>
      <LinearGradient colors={[withAlpha('#AF52DE', 0.065), '#FFFFFF', withAlpha('#007AFF', 0.055)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <Pressable accessibilityLabel="Back" accessibilityRole="button" onPress={back} style={styles.headerButton} testID="calorie-back">
          <Ionicons color={INK} name="chevron-back" size={22} />
        </Pressable>
        <Text accessibilityRole="header" style={[parts.headline, styles.headerTitle]}>
          {TITLES[page](live)}
        </Text>
        <Pressable accessibilityLabel="Close calorie tracker" accessibilityRole="button" onPress={onClose} style={styles.headerButton} testID="calorie-close">
          <Ionicons color={INK} name="close" size={22} />
        </Pressable>
      </View>
      <Text style={[parts.caption, styles.status, { color: SECONDARY }]} testID="calorie-status">
        {statusLine}
      </Text>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 20 + insets.bottom }]} key={page} keyboardShouldPersistTaps="handled">
        {content[page]}
      </ScrollView>
      {store.loading || working ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, parts.center]} testID="calorie-working">
          <View style={styles.progress}>
            <ActivityIndicator color={INK} />
          </View>
        </View>
      ) : null}
      <FoodEditor
        draft={editor}
        live={live}
        onCancel={() => setEditor(null)}
        onChange={setEditor}
        onSave={async (draft) => {
          const name = draft.name.trim();
          const kcal = Number.parseInt(draft.calories, 10) || 0;
          // Any `kcal` is a manual correction on the server (source MANUAL, every nutrient cleared), so an
          // edit sends it only when the value changed: renaming a food or moving its meal keeps its nutrients.
          // Android ahead of iOS: Swift always sends it (CalorieTrackerView.swift:905).
          const saved = draft.entry
            ? await store.update(draft.entry, { meal: draft.meal, description: name, ...(kcal !== draft.entry.kcal ? { kcal } : {}) })
            : await store.add({ meal: draft.meal, description: name, kcal });
          if (saved) setEditor(null);
        }}
        selectedDate={selectedDate}
        zone={userZone}
      />
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

function ToggleRow({ label, value, onChange, testID }: { label: string; value: boolean; onChange: (next: boolean) => void; testID: string }) {
  return (
    <View style={styles.row}>
      <Text style={[parts.body, parts.grow]}>{label}</Text>
      <IOSSwitch accessibilityLabel={label} onValueChange={onChange} testID={testID} tint={SYSTEM_INDIGO} value={value} />
    </View>
  );
}

function SummaryLabel({ icon, text }: { icon: IconName; text: string }) {
  return (
    <View style={styles.label}>
      <Ionicons color={INK} name={icon} size={17} />
      <Text style={parts.body}>{text}</Text>
    </View>
  );
}

/**
 * `TextField(_, value:, format: .number)` with a number pad, 65 wide, right-aligned. `.number` shows the
 * value grouped ("1,000") and regroups it when editing ends.
 */
function GoalField({ label, value, onChange, testID }: { label: string; value: number; onChange: (next: number) => void; testID: string }) {
  const [text, setText] = useState(grouped(value));
  return (
    <TextInput
      accessibilityLabel={label}
      keyboardType="number-pad"
      onBlur={() => setText((current) => (current === '' ? current : grouped(Number.parseInt(current.replace(/\D/g, ''), 10))))}
      onChangeText={(next) => {
        const digits = next.replace(/\D/g, '');
        setText(digits);
        onChange(digits === '' ? 0 : Number.parseInt(digits, 10));
      }}
      style={styles.goalInput}
      testID={testID}
      value={text}
    />
  );
}

/** `insightCard(_:)` (:779-801): today's one insight and its one action. */
function InsightCard({ insight, onAct }: { insight: NutritionInsight; onAct: (add: boolean) => void }) {
  const gap = insight.kind === 'GAP';
  return (
    <Card testID="insight-card">
      <View style={styles.insightHeader}>
        <IconTile color={gap ? '#AF52DE' : '#FF9500'} name={gap ? 'sparkles' : insight.kind === 'STREAK' ? 'flame' : 'trending-up'} />
        <View style={parts.grow}>
          <Text style={[parts.captionBold, { color: SECONDARY }]}>Today’s insight</Text>
          <Text style={parts.headline}>{insight.title}</Text>
          <Text style={parts.subheadline}>{insight.text}</Text>
        </View>
      </View>
      {insight.state === 'added' ? (
        <View style={styles.label}>
          <Ionicons color="#34C759" name="checkmark-circle" size={16} />
          <Text style={[parts.subheadline, { color: '#34C759' }]}>{`Added to ${insight.listTitle ?? 'your shopping list'}`}</Text>
        </View>
      ) : insight.items.length > 0 ? (
        <View style={styles.row}>
          <Pressable accessibilityRole="button" onPress={() => onAct(true)} style={styles.prominent} testID="insight-add">
            <Ionicons color="#FFFFFF" name="cart" size={16} />
            <Text style={[parts.subheadline, styles.prominentText]}>{`Add to ${insight.listTitle ?? 'shopping list'}`}</Text>
          </Pressable>
          <TextButton inline onPress={() => onAct(false)} testID="insight-dismiss" title="Not now" />
        </View>
      ) : (
        <TextButton inline onPress={() => onAct(false)} testID="insight-dismiss" title="Got it" />
      )}
    </Card>
  );
}

/** `foodRow(_:)` (:856-872). */
function FoodRow({ food, onEdit, onRemove, onConfirm }: { food: NutritionEntry; onEdit: () => void; onRemove: () => void; onConfirm: () => void }) {
  return (
    <View style={styles.food} testID={`calorie-food-${food.id}`}>
      <View style={styles.row}>
        {food.fromCall ? <Ionicons accessibilityLabel="From your call" color="#34C759" name="call" size={12} /> : null}
        <Text style={[parts.subheadline, parts.grow]}>{food.description}</Text>
        <Pressable accessibilityLabel={`Edit ${food.description}, ${food.kcal} calories`} accessibilityRole="button" onPress={onEdit}>
          <Text style={parts.caption}>{`${grouped(food.kcal)} kcal`}</Text>
        </Pressable>
        <Pressable accessibilityLabel={`Remove ${food.description}`} accessibilityRole="button" onPress={onRemove} style={styles.remove}>
          <Ionicons color="#FF3B30" name="remove-circle-outline" size={20} />
        </Pressable>
      </View>
      {needsReview(food) ? (
        <View style={styles.review}>
          <View style={styles.label}>
            <Ionicons color="#FF9500" name="alert-circle-outline" size={12} />
            <Text style={[parts.caption, { color: '#FF9500' }]}>Estimated</Text>
          </View>
          <TextButton bold inline onPress={onConfirm} small testID={`calorie-confirm-${food.id}`} title="Looks right" />
          <TextButton bold inline onPress={onEdit} small testID={`calorie-edit-${food.id}`} title="Edit" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#FFFFFF' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center' },
  status: { textAlign: 'center', paddingBottom: 8 },
  content: { padding: 20, gap: 20, width: '100%', maxWidth: 650, alignSelf: 'center' },
  centered: { textAlign: 'center' },
  // Full width, the picture centred in it (`CaloriePackArt`'s GeometryReader); `stretch` alone left Android at the intrinsic 218 wide.
  art: { alignSelf: 'stretch', width: '100%' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(60, 60, 67, 0.29)' },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 },
  goalHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  goalRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  goalIcon: { width: 22, alignItems: 'center' },
  goalInput: {
    width: 65,
    textAlign: 'right',
    fontSize: 17,
    color: INK,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(60, 60, 67, 0.29)',
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 4,
    backgroundColor: '#FFFFFF',
  },
  unit: { minWidth: 20 },
  input: {
    fontSize: 17,
    color: INK,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(60, 60, 67, 0.29)',
    borderRadius: 5,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: '#FFFFFF',
  },
  readyIcon: { alignItems: 'center', paddingVertical: 20 },
  readyMask: { width: 80, height: 80 },
  today: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  ringWrap: { padding: 8 },
  todayCards: { flex: 1, gap: 12 },
  macros: { flexDirection: 'row', gap: 8 },
  nutrient: { gap: 8 },
  insightHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  prominent: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: SYSTEM_INDIGO, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  prominentText: { color: '#FFFFFF', fontWeight: '600' },
  food: { gap: 6, paddingTop: 8 },
  remove: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  review: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  progress: { padding: 24, borderRadius: 16, backgroundColor: 'rgba(242, 242, 247, 0.95)' },
});
