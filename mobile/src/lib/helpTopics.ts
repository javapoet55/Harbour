import { standardContains } from './taskQuery';

/**
 * `HelpCategory`, `HelpTopic` and `HelpTopics` (ios/Sources/NexdoCore/HelpTopics.swift), copied
 * verbatim. Help is entirely on the phone: no server route, and its only exit ("Still need help?") is
 * Feedback (HelpView.swift:77-87).
 */

export const HELP_CATEGORIES = ['Calendar', 'Tasks'] as const;
export type HelpCategory = (typeof HELP_CATEGORIES)[number];

export type HelpTopic = { id: string; category: HelpCategory; question: string; answer: string; keywords: string };

export const HELP_TOPICS: HelpTopic[] = [
  {
    id: 'calendar-create',
    category: 'Calendar',
    question: 'How do I add an appointment?',
    answer: 'Open Calendar and tap Add Manually. Enter the event title, choose its start and end, and add a location or notes if needed. Save the event and review any confirmation shown. You can also use Add by Voice to describe the appointment.',
    keywords: 'create book meeting event new',
  },
  {
    id: 'calendar-views',
    category: 'Calendar',
    question: 'How do I switch between Schedule, Week, and Month?',
    answer: 'Use the Schedule, Week, and Month tabs at the top of Calendar. Schedule lists your items by day. Week and Month help you browse dates. In Schedule, use the date-range menu to choose how many days to show.',
    keywords: 'view dates upcoming next seven days',
  },
  {
    id: 'calendar-complete',
    category: 'Calendar',
    question: 'How do I mark an appointment complete or incomplete?',
    answer: 'Tap the appointment to open Event Details. Choose Mark Complete (the green check) when it is finished, or Mark Incomplete (the red cross) to undo completion. Nexdo saves this status. Marking an imported event complete does not change the event in its original calendar.',
    keywords: 'done finish check cross undo status',
  },
  {
    id: 'calendar-edit',
    category: 'Calendar',
    question: 'How do I change an appointment’s time or notes?',
    answer: 'Open the appointment and tap Edit in Event Details. Update the title, location, start, end, or notes, then tap Save. For an event imported from another calendar, edit it in the original calendar. Open in Calendar opens your device’s calendar at the event date.',
    keywords: 'reschedule move rename details location',
  },
  {
    id: 'calendar-repeat',
    category: 'Calendar',
    question: 'Can I create a repeating appointment?',
    answer: 'When adding an appointment manually, use Repeat to choose Daily, Weekly, Monthly, or Particular days of the week. Choose Repeat until and, when needed, the weekdays. Monthly events repeat on the same date; months without that date are skipped.',
    keywords: 'recurring recurrence series weekdays',
  },
  {
    id: 'calendar-connect',
    category: 'Calendar',
    question: 'How do I connect Google Calendar?',
    answer: 'Open your profile, choose Edit profile and settings, and find the calendar connection section. Tap Connect Google Calendar and finish Google sign-in. Review the connection’s settings: a read-only connection imports events but does not receive tasks or events created in Nexdo.',
    keywords: 'sync synchronize external import account integration',
  },
  {
    id: 'calendar-find',
    category: 'Calendar',
    question: 'Why can’t I see an event or task in Calendar?',
    answer: 'Check the selected date and date range, then check the Calendar filters. Turn on Tasks or Calendar events as needed, and clear search text or use Reset filters. Completed shows items marked complete. A task without a scheduled time or due date may appear under Unscheduled & overdue rather than on a day’s timeline.',
    keywords: 'missing search filter hidden empty',
  },
  {
    id: 'calendar-conflicts',
    category: 'Calendar',
    question: 'What should I do when a scheduling conflict appears?',
    answer: 'Review the overlapping task or appointment and choose another time if needed. For voice booking, clearly confirm the final date and time before creation. A requested time outside working hours or on a weekend is not, by itself, an overlapping appointment. Check the saved event’s details after it is created.',
    keywords: 'overlap clash weekend working hours voice booking',
  },
  {
    id: 'calendar-task',
    category: 'Calendar',
    question: 'What does Add to Tasks do?',
    answer: 'In Event Details, tap Add to Tasks to create a task using the appointment’s title and notes, with its start time as the task’s due date. It does not create another calendar appointment. Repeating this action for the same event reuses the task. The task and appointment have separate completion states.',
    keywords: 'convert copy to do duplicate deadline',
  },
  {
    id: 'calendar-delete',
    category: 'Calendar',
    question: 'How do I delete an appointment?',
    answer: 'Open an event created in Nexdo, tap Delete Event, and confirm. If it was sent to a connected calendar, Nexdo also attempts to remove it there and shows a warning if that fails. Delete an imported event in its original calendar. Mark Incomplete changes completion status; it does not delete the event.',
    keywords: 'remove cancel trash external',
  },
  {
    id: 'tasks-create',
    category: 'Tasks',
    question: 'How do I create a task?',
    answer: 'Open Tasks and choose Add Manually to enter a task, or Add by Voice to describe it aloud. Give it a clear title and add scheduling details if needed. Review the details and save or confirm the task. Check the task list for the saved result.',
    keywords: 'new add voice speech create',
  },
  {
    id: 'tasks-edit',
    category: 'Tasks',
    question: 'How do I edit a task?',
    answer: 'Tap a task to open its details. Change its title, notes, priority, estimate, or other available fields, then tap Save changes. Some tasks show a compact layout; use Show additional details to reveal more fields.',
    keywords: 'change rename update save details',
  },
  {
    id: 'tasks-complete',
    category: 'Tasks',
    question: 'How do I complete a task or reopen it?',
    answer: 'Open the task and tap Mark complete. To reopen it, find it using the Completed filter, open its details, and tap Mark incomplete. A completed task no longer appears with open tasks in the same way, so check your filters if it seems to disappear.',
    keywords: 'done finish undo check status reopen',
  },
  {
    id: 'tasks-schedule',
    category: 'Tasks',
    question: 'What is the difference between a scheduled time and a due date?',
    answer: 'A scheduled time is when you plan to work on the task. A due date is its deadline. Use the task’s schedule fields to change when you plan to work, then save. Calendar can show scheduled tasks and task deadlines, so a deadline is not necessarily a booked appointment.',
    keywords: 'start end time deadline reschedule calendar',
  },
  {
    id: 'tasks-find',
    category: 'Tasks',
    question: 'Why is my task missing from Today?',
    answer: 'Today shows tasks that match that view’s date and filters. Try Tomorrow, This Week, or All, and clear any search or extra filters. If you already completed the task, check Completed. Open the task to check its schedule and due date.',
    keywords: 'search missing hidden list empty tomorrow week all',
  },
  {
    id: 'tasks-priority',
    category: 'Tasks',
    question: 'How do I set a task’s priority and duration?',
    answer: 'Open task details and use Priority to choose Low, Normal, High, or Critical. Use Estimate to set how many minutes the work may take, then tap Save changes. The estimate describes planned effort; it does not mean the task is automatically finished after that time.',
    keywords: 'important urgent critical estimate minutes effort',
  },
  {
    id: 'tasks-repeat',
    category: 'Tasks',
    question: 'How do I make a task repeat?',
    answer: 'Open task details and find Repeat. Choose Daily, Weekly, Monthly, or Yearly, then save your changes. Choose None to turn repetition off. If the Repeat field is hidden, open Show additional details first.',
    keywords: 'recurring recurrence daily weekly monthly yearly',
  },
  {
    id: 'tasks-project',
    category: 'Tasks',
    question: 'How do I organize tasks into a project?',
    answer: 'Use the Projects tab in Tasks to manage your projects. In a task’s details, use the Project field to choose its project and save. Project assignment groups related work while the task keeps its own schedule, priority, and completion status.',
    keywords: 'group organize folder assignment',
  },
  {
    id: 'tasks-notes',
    category: 'Tasks',
    question: 'Can I add notes and smaller steps to a task?',
    answer: 'Yes. Open task details and use the steps section to break the work into smaller actions. Add context or links under Notes, then tap Save changes. If these fields are not visible, choose Show additional details.',
    keywords: 'subtasks checklist description links context',
  },
  {
    id: 'tasks-focus',
    category: 'Tasks',
    question: 'How can I use Pomodoro while working on a task?',
    answer: 'Open the center navigation icon and choose Pomodoro Focus. Choose a focus category, optionally enter the task as your session name, set the duration, and start. Some task screens also offer Start a 25-minute focus session. Finishing a focus timer does not automatically mark the task complete; mark it complete when the work is done.',
    keywords: 'timer concentrate focus session break productivity',
  },
];

/**
 * `HelpTopics.search(_:category:)`: every whitespace-separated term must appear (case- and
 * diacritic-insensitive, `localizedStandardContains`) in the category, question, answer or keywords.
 * A blank query lists everything in the category.
 */
export function searchHelp(query: string, category: HelpCategory | null = null): HelpTopic[] {
  const terms = query.split(/\s+/u).filter((term) => term !== '');
  return HELP_TOPICS.filter(
    (topic) =>
      (category === null || topic.category === category) &&
      terms.every((term) => standardContains(`${topic.category} ${topic.question} ${topic.answer} ${topic.keywords}`, term)),
  );
}
