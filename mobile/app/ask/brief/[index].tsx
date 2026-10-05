import { router, useLocalSearchParams } from 'expo-router';

import { BriefSectionDetail } from '../../../src/features/ask/BriefSectionDetail';
import { briefHandlers } from '../../../src/features/ask/briefHandlers';
import { displaySections } from '../../../src/lib/assistantPresentation';
import { briefStyle, visibleBriefSections } from '../../../src/lib/dailyBrief';
import { useTasks } from '../../../src/query/useTasks';
import { useAssistantStore } from '../../../src/store/assistant';

/**
 * `.fullScreenCover(item: $selectedSection) { BriefSectionDetailView(...) }` (DailyBriefView.swift:
 * 106-112): section `index` of the brief's visible sections, read live, so a task completed here leaves
 * the list as it does in Swift. A section that has gone keeps its title over an empty list ("Nothing to
 * report here today.") rather than Swift's blank cover (§22 "For the team").
 */
export default function BriefSection() {
  const params = useLocalSearchParams<{ index: string; title?: string }>();
  const index = Number(params.index);
  const turn = useAssistantStore((state) => state.turn);
  const tasks = useTasks().data?.tasks ?? [];
  const section = turn ? visibleBriefSections(displaySections(turn), tasks)[index] : undefined;
  const title = section ? briefStyle(section.title).title : (params.title ?? '');
  return (
    <BriefSectionDetail
      items={section?.items ?? []}
      onAsk={(query) => {
        // `requestHelp`: `dismiss(); ask(query)` (BriefSectionDetailView.swift:83).
        router.back();
        briefHandlers()?.ask(query);
      }}
      onBack={() => router.back()}
      onRead={() => {
        if (section) briefHandlers()?.read(index, section.items.join('\n\n'));
      }}
      title={title}
    />
  );
}
