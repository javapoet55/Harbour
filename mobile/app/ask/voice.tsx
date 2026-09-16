import { AddTaskByVoiceView } from '../../src/components/AddTaskByVoiceView';

/**
 * `AddTaskByVoiceView(askMode: true)`, presented as a `.fullScreenCover` from Ask Nexdo
 * (ios/App/AskNexdoView.swift:270) by the "Ask by Voice" entry card and by the composer's mic button.
 *
 * PHASE 9 — the transcription session underneath is still `src/voice/taskCaptureStub.ts`, and in ask
 * mode the answer should come back as an assistant turn rather than a created task. Only the shell,
 * its copy and its states are real here.
 */
export default function AskVoice() {
  return <AddTaskByVoiceView askMode />;
}
