import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import type { AssistantTurn } from '../api';
import { displaySections } from '../lib/assistantPresentation';
import { useTheme } from '../theme';
import { withAlpha } from './SignInBackdrop';
import { TaskSymbol } from './TaskSymbol';
import { Text } from './Text';

/**
 * `AskResponseView`, `AskResponseSummary` and `AskResponseCard` (ios/App/AskResponseView.swift) —
 * "Renders server-grounded sections without synthesizing counts or changing ranges."
 *
 * `AskResponseView.body` is `AskResponseView.swift:11-69`; `AskResponseSummary.body` is `:75-84`;
 * `AskResponseCard.body` is `:97-130`.
 */

export type AskResponseProps = {
  turn: AssistantTurn;
  /** The section currently being read aloud, or `null` (`readingSection`). */
  readingSection: number | null;
  /** `preparingSpeech`: the audio for `readingSection` has been requested but is not playing yet. */
  preparingSpeech: boolean;
  /** `readLoud`. Omitted means no Read Loud control on any card. */
  onReadLoud?: (section: number, text: string) => void;
  /** `model.busy`: disables the confirmation buttons while a request is in flight. */
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
};

export function AskResponse({ turn, readingSection, preparingSpeech, onReadLoud, busy, onApprove, onReject }: AskResponseProps) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState<number[]>([]);
  const sections = displaySections(turn);
  const blue = theme.colors.askBlue;

  const toggle = (section: number) =>
    setExpanded((previous) => (previous.includes(section) ? previous.filter((item) => item !== section) : [...previous, section]));

  const changes = turn.executive?.proposedScheduleChanges ?? [];

  return (
    <View style={styles.stack}>
      <AskResponseSummary text={turn.visual.summary} />

      {sections.map((section, index) => {
        const open = expanded.includes(index);
        // Only the FIRST section previews anything; every other one starts collapsed and empty.
        const previewCount = index === 0 ? Math.min(2, section.items.length) : 0;
        const visible = open ? section.items : section.items.slice(0, previewCount);
        const hidden = section.items.length - previewCount;

        return (
          <AskResponseCard
            key={`${section.title}-${index}`}
            title={section.title}
            itemCount={section.items.length}
            expanded={open}
            onToggle={() => toggle(index)}
            reading={readingSection === index}
            preparing={preparingSpeech && readingSection === index}
            onRead={onReadLoud ? () => onReadLoud(index, section.items.join('\n\n')) : undefined}
            testID={`ask-section-${index}`}
          >
            {visible.length === 0 ? (
              // `AskStyle.secondary` is `.secondaryLabel` (AskNexdoView.swift:51), not nexdoSecondary.
              <Text style={[styles.subheadline, styles.emptyHint, { color: theme.colors.secondaryLabel }]}>Tap to view the details.</Text>
            ) : null}

            {visible.map((item, itemIndex) => (
              <View key={`${itemIndex}-${item}`}>
                {itemIndex > 0 ? <View style={[styles.divider, { backgroundColor: withAlpha(blue, 0.06) }]} /> : null}
                <View style={styles.bulletRow}>
                  <View style={styles.bulletIcon}>
                    <TaskSymbol name="circle.fill" size={5} color={blue} />
                  </View>
                  <Text style={[styles.subheadline, styles.grow, { color: theme.colors.ink }]} selectable>
                    {item}
                  </Text>
                </View>
              </View>
            ))}

            {section.items.length > previewCount && !open ? (
              <Pressable accessibilityRole="button" onPress={() => toggle(index)} style={styles.moreButton}>
                <Text style={[styles.subheadline, styles.semibold, { color: blue }]}>{`Show ${hidden} more`}</Text>
              </Pressable>
            ) : open && section.items.length > previewCount ? (
              <Pressable accessibilityRole="button" onPress={() => toggle(index)} style={styles.moreButton}>
                <Text style={[styles.subheadline, styles.semibold, { color: blue }]}>Show less</Text>
              </Pressable>
            ) : null}
          </AskResponseCard>
        );
      })}

      {turn.confirmation ? (
        <AskResponseCard title="Review proposed changes" testID="ask-confirmation">
          <Text style={[styles.subheadline, styles.prompt, { color: theme.colors.ink }]}>{turn.confirmation.prompt}</Text>

          {changes.map((change, index) => (
            <View key={`${change.taskId}-${index}`} style={styles.change}>
              <Text style={[styles.subheadline, styles.semibold, { color: theme.colors.ink }]}>{change.title}</Text>
              <Text style={[styles.subheadline, { color: theme.colors.ink }]}>{`From: ${change.before ?? 'Unscheduled'}`}</Text>
              <Text style={[styles.subheadline, { color: theme.colors.ink }]}>{`To: ${change.after} · ${change.durationMin} min`}</Text>
              <Text style={[styles.subheadline, { color: theme.colors.secondaryLabel }]}>{change.reason}</Text>
            </View>
          ))}

          {/* `.buttonStyle(.borderedProminent)` under the view's `.tint(AskStyle.blue)`. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Approve changes"
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={onApprove}
            testID="ask-approve"
            // `.disabled(model.busy)` with no `.opacity` of its own: SwiftUI's own dim, about 0.45.
            style={[styles.approve, { backgroundColor: blue, opacity: busy ? 0.45 : 1 }]}
          >
            <Text style={[theme.typography.body, { color: '#FFFFFF' }]}>Approve changes</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Keep my current plan"
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={onReject}
            testID="ask-reject"
            style={[styles.reject, { opacity: busy ? 0.45 : 1 }]}
          >
            <Text style={[theme.typography.body, { color: blue }]}>Keep my current plan</Text>
          </Pressable>
        </AskResponseCard>
      ) : null}
    </View>
  );
}

/** `AskResponseSummary` (AskResponseView.swift:72-85). */
export function AskResponseSummary({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.summary, { backgroundColor: withAlpha(theme.colors.askBlue, 0.09) }]} testID="ask-summary">
      <View style={styles.summaryIcon}>
        <TaskSymbol name="sparkles" size={15} color={theme.colors.askBlue} />
      </View>
      {/* `.foregroundStyle(AskStyle.ink)` (AskResponseView.swift:78) is `.label`, not nexdoInk.
          The card BODY is different: Swift names `Color.nexdoInk` there explicitly (`:124`). */}
      <Text numberOfLines={3} style={[styles.subheadline, styles.medium, styles.grow, { color: theme.colors.label }]}>
        {text}
      </Text>
    </View>
  );
}

export type AskResponseCardProps = {
  title: string;
  itemCount?: number;
  expanded?: boolean;
  onToggle?: () => void;
  reading?: boolean;
  preparing?: boolean;
  onRead?: () => void;
  testID?: string;
  children: React.ReactNode;
};

/** `AskResponseCard` (AskResponseView.swift:86-131). */
export function AskResponseCard({
  title,
  itemCount = 0,
  expanded = false,
  onToggle,
  reading = false,
  preparing = false,
  onRead,
  testID,
  children,
}: AskResponseCardProps) {
  const theme = useTheme();
  const blue = theme.colors.askBlue;

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.background, borderColor: withAlpha(blue, 0.16) }]} testID={testID}>
      <View style={[styles.cardHeader, { backgroundColor: withAlpha(blue, 0.055) }]}>
        <Pressable accessibilityRole="header" onPress={onToggle} style={styles.cardTitleRow}>
          <Text style={[styles.caption, styles.bold, { color: blue }]}>{title.toUpperCase()}</Text>
          {itemCount > 0 ? (
            <View style={[styles.countPill, { backgroundColor: withAlpha(blue, 0.12) }]}>
              <Text style={[styles.caption2, styles.bold, { color: blue }]}>{String(itemCount)}</Text>
            </View>
          ) : null}
          <TaskSymbol name={expanded ? 'chevron.up' : 'chevron.down'} size={11} color={blue} />
        </Pressable>
        <View style={styles.grow} />
        {onRead ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={reading ? 'Stop reading' : `Read ${title} aloud`}
            accessibilityHint="Uses an AI-generated voice"
            onPress={onRead}
            style={styles.readButton}
            testID={`${testID ?? 'ask-card'}-read`}
          >
            {preparing ? <ActivityIndicator size="small" color={blue} /> : null}
            <TaskSymbol name={reading ? 'stop.fill' : 'speaker.wave.2.fill'} size={13} color={blue} />
            <Text style={[styles.caption, styles.semibold, { color: blue }]}>{reading ? 'Stop' : 'Read Loud'}</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  grow: { flex: 1 },
  semibold: { fontWeight: '600' },
  medium: { fontWeight: '500' },
  bold: { fontWeight: '700' },
  // `.subheadline` carries its own 21pt leading (style map section 2).
  subheadline: { fontSize: 15, lineHeight: 21 },
  caption: { fontSize: 12, lineHeight: 16 },
  caption2: { fontSize: 11, lineHeight: 13 },

  summary: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14, borderRadius: 16 },
  summaryIcon: { paddingTop: 2 },

  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 3 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  countPill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
  readButton: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 44, marginLeft: 8 },
  cardBody: { paddingHorizontal: 14, paddingVertical: 7 },

  emptyHint: { paddingVertical: 4 },
  divider: { height: StyleSheet.hairlineWidth },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 5 },
  bulletIcon: { paddingTop: 7 },
  moreButton: { minHeight: 36, justifyContent: 'center' },

  prompt: { paddingBottom: 8 },
  change: { gap: 6, paddingVertical: 8 },
  // `.buttonStyle(.borderedProminent).frame(minHeight: 44)` (AskResponseView.swift:58) inside a
  // `VStack(alignment: .leading)`: a capsule sized to its own label, not a full-width block.
  approve: { alignSelf: 'flex-start', minHeight: 44, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', borderRadius: 999 },
  reject: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
});
