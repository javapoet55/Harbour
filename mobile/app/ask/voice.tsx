import { AddTaskByVoiceView } from '../../src/components/AddTaskByVoiceView';

/**
 * `AddTaskByVoiceView(askMode: true)`, presented as a `.fullScreenCover` from Ask Nexdo
 * (ios/App/AskNexdoView.swift:270) by the "Ask by Voice" entry card and by the composer's mic button.
 *
 * The session underneath is the REAL one: the same `/api/realtime/task-session` conversation the
 * other two modes use. `askMode` changes four pieces of copy and nothing else — Swift has no separate
 * ask-mode transport, and no assistant turn comes back; the model answers out loud and edits tasks
 * through tool calls.
 */
export default function AskVoice() {
  return <AddTaskByVoiceView askMode />;
}
