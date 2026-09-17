import { AddTaskByVoiceView } from '../../src/components/AddTaskByVoiceView';

/**
 * `AddTaskByVoiceView(calendarOnly: true)`, presented as a `.fullScreenCover` from the Calendar tab's
 * "Add by Voice" card (ios/App/CalendarView.swift:161).
 *
 * The flag narrows the tool scope to `calendar`, so the session refuses every tool but
 * `get_current_time`, `create_calendar_event`, `get_schedule` and `find_free_time`
 * (ios/App/VoiceToolExecutor.swift:17-19).
 */
export default function CalendarVoice() {
  return <AddTaskByVoiceView calendarOnly />;
}
