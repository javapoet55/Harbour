import { useLocalSearchParams } from 'expo-router';

import { AddTaskByVoiceView } from '../../src/components/AddTaskByVoiceView';

/**
 * `AddTaskByVoiceView()` — task mode, opened from the Tasks screen (ios/App/RootView.swift:1909) and from Create New
 * Task's microphone, which passes the folder chosen in the form (`AddTaskByVoiceView(projectID:)`, :2333, 08a64da).
 */
export default function VoiceCapture() {
  const { projectId } = useLocalSearchParams<{ projectId?: string }>();
  return <AddTaskByVoiceView projectId={projectId || undefined} />;
}
