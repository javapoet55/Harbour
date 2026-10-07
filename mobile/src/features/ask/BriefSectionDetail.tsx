import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, View, type ImageSourcePropType, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCoordinator } from '../../actions/coordinator';
import type { NexdoTask } from '../../api';
import { withAlpha } from '../../components/SignInBackdrop';
import { TaskSymbol, type TaskSymbolName } from '../../components/TaskSymbol';
import { Text } from '../../components/Text';
import { briefDetailCopy, briefHelpQuery, briefItemCount, briefTask } from '../../lib/dailyBrief';
import type { TaskActionChannel } from '../../lib/todayActionQueue';
import { useMinuteTick } from '../../lib/useMinuteTick';
import { isConflictCancelled, isStaleWrite, useCompleteTask, useTasks, type ScheduleConflict } from '../../query/useTasks';
import { useSession } from '../../store/session';
import { palettes } from '../../theme';
import { PopoverMenu, usePopoverMenu } from '../moments/form';
import { startedLabel } from '../pomodoro/format';
import { BriefArtwork, briefColors, briefInk, briefSecondary } from './DailyBrief';

/**
 * `BriefSectionDetailView` (ios/App/BriefSectionDetailView.swift), opened full screen from a Daily Brief
 * section card. A line that names exactly one open task (`task(for:)`) becomes a task card — complete,
 * open, add a note, (re)schedule, or Call / Message for a task with a contact action — and anything
 * else an insight card. "Need help with this?" goes back to the brief and asks about every line.
 *
 * FIXED LIGHT, as in Swift.
 */

/** `DetailArtwork` (:154-173): regions of `brief-detail-pack`, cropped into assets/brief. */
const ART: Record<'star' | 'target' | 'phone' | 'calendar', ImageSourcePropType> = {
  star: require('../../../assets/brief/detail-star.png'),
  target: require('../../../assets/brief/detail-target.png'),
  phone: require('../../../assets/brief/detail-phone.png'),
  calendar: require('../../../assets/brief/detail-calendar.png'),
};

/** The task editor sections `TaskDetailsView(initialSection:)` scrolls to. */
type InitialSection = 'notes' | 'schedule';

const openTask = (task: NexdoTask, section?: InitialSection) =>
  router.push({ pathname: '/task/[id]', params: { id: task.id, ...(section ? { section } : {}) } });

/** `TaskActionView(actionID:preferred:startSelectedAction: true)` (:78-80). */
const openAction = (id: string, channel: TaskActionChannel) => router.push({ pathname: '/action/[id]', params: { id, preferred: channel, start: '1' } });

/** `confirmScheduleWarnings` (NexdoApp.swift:87-98), as Task Details shows it. */
function confirmConflict(conflict: ScheduleConflict) {
  Alert.alert('Review this time', conflict.warnings.join('\n\n'), [
    { text: 'Keep previous schedule', style: 'cancel', onPress: conflict.cancel },
    { text: 'Save anyway', onPress: conflict.confirm },
  ]);
}

export function BriefSectionDetail({ title, items, onBack, onAsk, onRead }: { title: string; items: string[]; onBack: () => void; onAsk: (query: string) => void; onRead: () => string | null }) {
  const tasks = useTasks().data?.tasks ?? [];
  const complete = useCompleteTask({ onConflict: confirmConflict });
  const busy = complete.isPending;
  const failure = complete.error && !isStaleWrite(complete.error) && !isConflictCancelled(complete.error) ? complete.error.message : null;
  // Android ahead of iOS: counts items, not "nothing" bullets (9f32f13 on fix/ios-bug-pass).
  const copy = briefDetailCopy(title, briefItemCount(items));
  const anchor = useRef<View>(null);
  const menu = usePopoverMenu(anchor);
  // Android ahead of iOS: Swift sets Ask's `voiceError`, which lives in the composer this page hides, so
  // "Read aloud" with OpenAI sharing off did nothing on screen (AskNexdoView.swift:531, :333).
  const [readError, setReadError] = useState<string | null>(null);

  return (
    <View style={styles.fill} testID="brief-detail">
      <LinearGradient colors={[withAlpha(briefColors.purple, 0.07), withAlpha(briefColors.blue, 0.04)]} end={{ x: 1, y: 1 }} start={{ x: 0, y: 0 }} style={StyleSheet.absoluteFill} />
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.fill}>
        <View style={styles.header}>
          <Pressable accessibilityLabel="Back to briefing" accessibilityRole="button" onPress={onBack} style={styles.round} testID="brief-detail-back">
            <TaskSymbol color={briefInk} name="chevron.left" size={22} />
          </Pressable>
          <View style={styles.titles}>
            <Text accessibilityRole="header" style={[styles.title2, styles.bold, styles.centered, { color: briefInk }]}>
              {title}
            </Text>
            <Text style={[styles.subheadline, { color: briefSecondary }]} testID="brief-detail-count">
              {copy.subtitle}
            </Text>
          </View>
          <View collapsable={false} ref={anchor}>
            <Pressable accessibilityLabel="Briefing options" accessibilityRole="button" onPress={menu.open} style={styles.round} testID="brief-detail-options">
              <TaskSymbol color={briefInk} name="ellipsis" size={22} />
            </Pressable>
          </View>
        </View>
        <PopoverMenu
          items={[
            { key: 'read', title: 'Read aloud', onPress: () => setReadError(onRead()), testID: 'brief-detail-read' },
            { key: 'share', title: 'Share briefing', onPress: () => void Share.share({ message: items.join('\n\n') }), testID: 'brief-detail-share' },
          ]}
          menu={menu}
          testID="brief-detail-menu"
        />

        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.banner}>
            <BriefArtwork height={48} source={ART.star} width={48} />
            <View style={[styles.grow, styles.bannerText]}>
              <Text style={[styles.headline, { color: briefColors.pink }]}>{copy.heading}</Text>
              <Text style={[styles.subheadline, { color: briefSecondary }]}>Based on your schedule, deadlines, and context.</Text>
            </View>
            <BriefArtwork height={60} source={ART.target} width={70} />
          </View>

          {items.map((item, index) => {
            const task = briefTask(tasks, item);
            return task ? (
              <BriefTaskCard busy={busy} context={item} index={index} key={`${index}-${item}`} onComplete={() => complete.mutate(task)} task={task} />
            ) : (
              <View key={`${index}-${item}`} style={[styles.card, styles.insight]} testID={`brief-insight-${index}`}>
                <BriefArtwork height={44} source={ART.star} width={44} />
                <Text style={[styles.headline, styles.grow, { color: briefInk }]}>{item}</Text>
              </View>
            );
          })}
          {items.length === 0 ? <Text style={[styles.body, styles.empty, { color: briefSecondary }]}>Nothing to report here today.</Text> : null}
          {failure ? (
            <Text style={[styles.subheadline, { color: briefColors.red }]} testID="brief-detail-error">
              {failure}
            </Text>
          ) : null}
          {readError ? (
            <Text style={[styles.subheadline, { color: briefColors.red }]} testID="brief-detail-read-error">
              {readError}
            </Text>
          ) : null}

          <View style={styles.help}>
            <View style={styles.label}>
              <TaskSymbol color={briefInk} name="sparkles" size={17} />
              <Text style={[styles.headline, { color: briefInk }]}>Need help with this?</Text>
            </View>
            <Text style={[styles.subheadline, { color: briefSecondary }]}>Ask Nexdo to take action, draft a message, or find options.</Text>
            <Pressable
              accessibilityLabel="Ask Nexdo"
              accessibilityRole="button"
              accessibilityState={{ disabled: busy }}
              disabled={busy}
              onPress={() => onAsk(briefHelpQuery(title, items))}
              testID="brief-detail-ask"
            >
              <LinearGradient colors={[briefColors.purple, briefColors.indigo]} end={{ x: 1, y: 0.5 }} start={{ x: 0, y: 0.5 }} style={styles.askButton}>
                <TaskSymbol color="#FFFFFF" name="sparkles" size={17} />
                <Text style={[styles.headline, { color: '#FFFFFF' }]}>Ask Nexdo</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

/** `taskCard(_:context:index:)` (:91-126). */
function BriefTaskCard({ task, context, index, busy, onComplete }: { task: NexdoTask; context: string; index: number; busy: boolean; onComplete: () => void }) {
  const profileZone = useSession((state) => state.profile?.timeZone);
  const action = useCoordinator((state) => state.actions.find((item) => item.taskId === task.id));
  const now = useMinuteTick();
  const done = task.status === 'COMPLETED';
  const deadline = task.dueAt ? Date.parse(task.dueAt) : null;
  const scheduled = task.startAt ? Date.parse(task.startAt) : null;
  const overdue = !done && deadline !== null && deadline < now;
  const when = deadline ?? scheduled;
  const zone = task.timeZone ?? profileZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <View style={[styles.card, styles.taskCard]} testID={`brief-task-card-${index}`}>
      <View style={styles.taskTop}>
        <Pressable
          accessibilityLabel={done ? `Reopen ${task.title}` : `Complete ${task.title}`}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={onComplete}
          style={styles.check}
          testID={`brief-complete-${index}`}
        >
          <TaskSymbol color={done ? briefColors.green : briefSecondary} name={done ? 'checkmark.circle.fill' : 'circle'} size={24} />
        </Pressable>
        <BriefArtwork height={44} source={action ? ART.phone : ART.calendar} width={42} />
        <Pressable accessibilityRole="button" onPress={() => openTask(task)} style={styles.taskOpen} testID={`brief-task-${index}`}>
          <View style={[styles.grow, styles.taskText]}>
            <Text style={[styles.headline, { color: briefInk }]}>{task.title}</Text>
            {done || overdue ? (
              <Text style={[styles.captionBold, { color: done ? briefColors.green : briefColors.pink }]}>{done ? 'Completed' : 'Overdue'}</Text>
            ) : null}
            {when !== null ? <Text style={[styles.subheadline, { color: overdue ? briefColors.pink : briefColors.blue }]}>{startedLabel(when, zone)}</Text> : null}
            <View style={styles.label}>
              <TaskSymbol color={briefSecondary} name="clock" size={12} />
              <Text style={[styles.caption, { color: briefSecondary }]}>{`${task.durationMin} min`}</Text>
            </View>
          </View>
          <TaskSymbol color={briefInk} name="chevron.right" size={12} />
        </Pressable>
      </View>
      <Text style={[styles.subheadline, { color: briefSecondary }]}>{task.notes ? task.notes : context}</Text>
      {/* `ViewThatFits`: one row, or a column when the pills do not fit. */}
      <View style={styles.pills}>
        {action && !done ? (
          <>
            <Pill disabled={busy} color={briefColors.pink} icon="phone" onPress={() => openAction(action.id, 'call')} testID={`brief-call-${index}`} title="Call" />
            <Pill disabled={busy} color={briefColors.purple} icon="message" onPress={() => openAction(action.id, 'message')} testID={`brief-message-${index}`} title="Message" />
          </>
        ) : (
          <>
            <Pill disabled={busy} color={briefColors.blue} icon="doc.text" onPress={() => openTask(task)} testID={`brief-open-${index}`} title="Open" />
            <Pill disabled={busy} color={briefColors.purple} icon="pencil" onPress={() => openTask(task, 'notes')} testID={`brief-note-${index}`} title="Add Note" />
          </>
        )}
        <Pill
          color={briefColors.blue}
          disabled={busy}
          icon="calendar"
          onPress={() => openTask(task, 'schedule')}
          testID={`brief-schedule-${index}`}
          title={task.startAt ? 'Reschedule' : 'Schedule'}
        />
      </View>
    </View>
  );
}

/** `pill(_:icon:color:action:)` (:137-142). */
function Pill({ title, icon, color, disabled, onPress, testID }: { title: string; icon: TaskSymbolName; color: string; disabled: boolean; onPress: () => void; testID: string }) {
  return (
    <Pressable
      accessibilityLabel={title}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.pill, { backgroundColor: withAlpha(color, 0.07), opacity: disabled ? 0.45 : 1 }]}
      testID={testID}
    >
      <TaskSymbol color={color} name={icon} size={12} />
      <Text style={[styles.caption, { color }]}>{title}</Text>
    </Pressable>
  );
}

// iOS: Swift's faint shadow. Android: no `elevation` (it drew at full strength through the translucent card
// as a lighter inner panel) but a 1pt hairline instead, as the task agent cards do (docs/android-polish.md
// §27, §28); without either, a near-white card vanished into the page's white end.
const shadow = Platform.OS === 'android' ? ({ borderWidth: 1, borderColor: palettes.light.fieldBorder } as const) : ({ shadowColor: briefColors.indigo, shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: 5 } } as const);

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#FFFFFF' },
  grow: { flex: 1 },
  bold: { fontWeight: '700' },
  centered: { textAlign: 'center' },
  title2: { fontSize: 22, lineHeight: 28 },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 17, lineHeight: 22 },
  subheadline: { fontSize: 15, lineHeight: 20 },
  caption: { fontSize: 12, lineHeight: 16 },
  captionBold: { fontSize: 12, lineHeight: 16, fontWeight: '700' },

  header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16 },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(briefColors.indigo, 0.07) },
  titles: { flex: 1, alignItems: 'center', gap: 4 },
  content: { gap: 14, paddingHorizontal: 14, paddingBottom: 24 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    backgroundColor: withAlpha(briefColors.purple, 0.045),
  },
  bannerText: { gap: 5 },
  card: { padding: 16, borderRadius: 24, backgroundColor: 'rgba(255, 255, 255, 0.95)', ...shadow },
  insight: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  taskCard: { gap: 14 },
  taskTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  check: { width: 32, height: 44, alignItems: 'center', justifyContent: 'center' },
  taskOpen: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  taskText: { gap: 8 },
  label: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 12, borderRadius: 15 },
  empty: { padding: 16 },
  help: { gap: 12, padding: 16, borderRadius: 22, backgroundColor: 'rgba(255, 255, 255, 0.65)' },
  askButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, borderRadius: 18 },
});
