import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { InlineNavBar } from '../../components/InlineNavBar';
import { withAlpha } from '../../components/SignInBackdrop';
import { TaskSymbol, type TaskSymbolName } from '../../components/TaskSymbol';
import { Text } from '../../components/Text';
import { TodayBackdrop } from '../../components/TodayShell';
import { HELP_CATEGORIES, searchHelp, type HelpCategory } from '../../lib/helpTopics';
import { brand, useTheme } from '../../theme';

/**
 * `HelpView` (ios/App/HelpView.swift), pushed from Account: a search field, the Calendar and Tasks
 * category cards, the matching topics as disclosure cards, and "Still need help?" into Feedback. Topics
 * and search are the part 1 `HELP_TOPICS` / `searchHelp` (HelpTopics.swift). Typing collapses every
 * open topic (`.onChange(of: query) { expanded = [] }`).
 *
 * DARK MODE: Swift's cards are fixed white (`.white.opacity(0.95)`) under adaptive ink, which is white
 * on white in dark mode (§22 "For the team"). Light mode is Swift's; dark mode uses the theme surface.
 */

const SUBTITLES: Record<HelpCategory, string> = {
  Calendar: 'Appointments, dates & scheduling',
  Tasks: 'To-dos, priorities & progress',
};

export function HelpScreen({ onBack, onFeedback }: { onBack: () => void; onFeedback: () => void }) {
  const theme = useTheme();
  const large = useWindowDimensions().fontScale >= 1.6;
  const [query, setQueryState] = useState('');
  const [category, setCategory] = useState<HelpCategory | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const results = searchHelp(query, category);
  const dark = theme.scheme === 'dark';
  const card = dark ? theme.colors.surface : 'rgba(255, 255, 255, 0.95)';
  const tint = (value: HelpCategory) => (value === 'Calendar' ? (dark ? '#0A84FF' : '#007AFF') : theme.colors.link);
  const icon = (value: HelpCategory): TaskSymbolName => (value === 'Calendar' ? 'calendar' : 'checkmark.circle');

  const setQuery = (next: string) => {
    setQueryState(next);
    setExpanded(new Set());
  };
  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.fill} testID="help-screen">
      <TodayBackdrop subtle />
      <InlineNavBar onBack={onBack} testID="help-nav" title="Help" />
      <ScrollView contentContainerStyle={styles.content} keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled">
        <View style={styles.intro}>
          <View style={styles.eyebrow}>
            <TaskSymbol color={theme.colors.link} name="questionmark.circle.fill" size={12} />
            <Text style={[styles.eyebrowText, { color: theme.colors.link }]}>NEXDO HELP</Text>
          </View>
          <Text style={[styles.title2, { color: theme.colors.ink }]}>How can we help you?</Text>
          <Text style={[styles.body, { color: theme.colors.secondary }]}>Find quick answers for planning your day and getting things done.</Text>
        </View>

        <View style={[styles.search, { backgroundColor: dark ? theme.colors.surface : '#FFFFFF', borderColor: withAlpha(brand.nexdoIndigo, 0.22) }]}>
          <TaskSymbol color={theme.colors.link} name="magnifyingglass" size={17} />
          <TextInput
            accessibilityLabel="Search help topics"
            autoCorrect={false}
            onChangeText={setQuery}
            placeholder="Search help topics"
            placeholderTextColor={theme.colors.placeholder}
            returnKeyType="search"
            style={[styles.searchInput, { color: theme.colors.ink }]}
            testID="help-search"
            value={query}
          />
          {query !== '' ? (
            <Pressable accessibilityLabel="Clear search" accessibilityRole="button" onPress={() => setQuery('')} style={styles.clear} testID="help-clear">
              <TaskSymbol color={theme.colors.link} name="xmark.circle.fill" size={17} />
            </Pressable>
          ) : null}
        </View>

        <View style={[styles.grid, large && styles.gridColumn]}>
          {HELP_CATEGORIES.map((value) => {
            const on = category === value;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                key={value}
                onPress={() => {
                  setCategory(on ? null : value);
                  setExpanded(new Set());
                }}
                style={[styles.categoryCard, { backgroundColor: card, borderColor: on ? tint(value) : 'transparent' }, !large && styles.half]}
                testID={`help-category-${value}`}
              >
                <View style={styles.categoryTop}>
                  <View style={[styles.categoryIcon, { backgroundColor: withAlpha(tint(value), 0.1) }]}>
                    <TaskSymbol color={tint(value)} name={icon(value)} size={22} />
                  </View>
                  <TaskSymbol color={tint(value)} name={on ? 'checkmark.circle.fill' : 'chevron.right'} size={15} />
                </View>
                <Text style={[styles.title3, { color: theme.colors.ink }]}>{value}</Text>
                <Text style={[styles.subheadline, { color: theme.colors.secondary }]}>{SUBTITLES[value]}</Text>
                <Text style={[styles.captionBold, { color: tint(value) }]}>10 questions</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.row}>
          <Text style={[styles.title3, styles.grow, { color: theme.colors.ink }]}>{category ? `${category} questions` : 'Browse help topics'}</Text>
          {category ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setCategory(null);
                setExpanded(new Set());
              }}
              testID="help-view-all"
            >
              <Text style={[styles.subheadline, styles.semibold, { color: theme.colors.link }]}>View all</Text>
            </Pressable>
          ) : null}
        </View>

        {results.length === 0 ? (
          <View style={[styles.empty, { backgroundColor: card }]} testID="help-empty">
            <TaskSymbol color={theme.colors.link} name="magnifyingglass" size={34} />
            <Text style={[styles.headline, { color: theme.colors.ink }]}>No matching topics</Text>
            <Text style={[styles.body, styles.centered, { color: theme.colors.secondary }]}>Try “repeat”, “complete”, or “add an appointment”, or search all categories.</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setQuery('');
                setCategory(null);
              }}
              style={[styles.bordered, { backgroundColor: withAlpha(brand.nexdoIndigo, 0.12) }]}
              testID="help-reset"
            >
              <Text style={[styles.body, { color: theme.colors.link }]}>Reset search</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {query.trim() !== '' ? (
              <Text style={[styles.subheadline, { color: theme.colors.secondary }]} testID="help-count">{`${results.length} ${results.length === 1 ? 'answer' : 'answers'} found`}</Text>
            ) : null}
            {HELP_CATEGORIES.map((group) => {
              const topics = results.filter((topic) => topic.category === group);
              if (topics.length === 0) return null;
              return (
                <View key={group} style={styles.group}>
                  {category === null ? (
                    <View style={styles.groupLabel}>
                      <TaskSymbol color={tint(group)} name={icon(group)} size={17} />
                      <Text style={[styles.headline, { color: tint(group) }]}>{group}</Text>
                    </View>
                  ) : null}
                  {topics.map((topic) => {
                    const open = expanded.has(topic.id);
                    return (
                      <View key={topic.id} style={[styles.topic, { backgroundColor: card }]} testID={`help-topic-${topic.id}`}>
                        <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => toggle(topic.id)} style={styles.topicHeader}>
                          {/* The label hugs its text; a wrapped question centres its lines, as the
                              `DisclosureGroup` label does (`help`). The indicator is ink, not the tint. */}
                          <Text style={[styles.question, styles.shrink, styles.centered, { color: theme.colors.ink }]}>{topic.question}</Text>
                          <View style={styles.grow} />
                          <TaskSymbol color={theme.colors.ink} name={open ? 'chevron.down' : 'chevron.right'} size={13} />
                        </Pressable>
                        {open ? (
                          <Text selectable style={[styles.body, styles.answer, { color: theme.colors.secondary }]}>
                            {topic.answer}
                          </Text>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              );
            })}
          </>
        )}

        <Pressable accessibilityRole="button" onPress={onFeedback} style={[styles.stillCard, { backgroundColor: card }]} testID="help-feedback">
          <TaskSymbol color={theme.colors.ink} name="bubble.left.and.text.bubble.right" size={22} />
          <View style={styles.grow}>
            <Text style={[styles.headline, { color: theme.colors.ink }]}>Still need help?</Text>
            <Text style={[styles.subheadline, { color: theme.colors.secondary }]}>Share a question or suggestion in Feedback.</Text>
          </View>
          <TaskSymbol color={theme.colors.ink} name="chevron.right" size={15} />
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

// No `elevation`: Android draws it at full strength and shows it through the translucent card as a lighter
// inner panel (docs/android-polish.md §28). iOS keeps Swift's faint shadow.
const shadow = { shadowColor: brand.nexdoIndigo, shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } } as const;

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flex: 1 },
  shrink: { flexShrink: 1 },
  content: { padding: 20, gap: 18 },
  intro: { gap: 10 },
  eyebrow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  eyebrowText: { fontSize: 12, lineHeight: 16, fontWeight: '700' },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  title3: { fontSize: 20, lineHeight: 25, fontWeight: '700' },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 17, lineHeight: 22 },
  subheadline: { fontSize: 15, lineHeight: 20 },
  captionBold: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  semibold: { fontWeight: '600' },
  centered: { textAlign: 'center' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, minHeight: 56, borderRadius: 18, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 17, paddingVertical: 12 },
  clear: { minWidth: 32, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', gap: 14 },
  gridColumn: { flexDirection: 'column' },
  half: { flex: 1 },
  categoryCard: { gap: 12, padding: 16, borderRadius: 22, borderWidth: 2, ...shadow },
  categoryTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  categoryIcon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
  empty: { alignItems: 'center', gap: 12, padding: 24, borderRadius: 22, ...shadow },
  bordered: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  group: { gap: 12 },
  groupLabel: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  topic: { padding: 16, borderRadius: 22, ...shadow },
  topicHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  question: { fontSize: 15, lineHeight: 20, fontWeight: '600', paddingVertical: 7 },
  answer: { paddingTop: 12 },
  stillCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 18, borderRadius: 22, ...shadow },
});
