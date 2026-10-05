import { getApi, type ApiClient } from './index';

/**
 * Business research for a task (src/app/api/tasks/[id]/agent/route.ts), typed as `TaskAgentEnvelope`
 * (ios/Sources/NexdoCore/TaskAgent.swift:2-26) and called as `AppModel.loadTaskAgent` /
 * `updateTaskAgent` (ios/App/NexdoApp.swift:553-560). Server errors ("Please enter a valid answer.",
 * "This run changed. Refresh and try again.") are shown as sent.
 */

export type TaskAgentIntent = { eligible?: boolean | null; category?: string | null; reason?: string | null };

export type TaskAgentEvidence = { source: string; url: string; rating?: number | null; reviews?: number | null };
export type TaskAgentFeedback = { author: string; authorUrl?: string | null; photoUrl?: string | null; url: string; rating?: number | null; text: string; published: string };
export type TaskAgentAttribution = { provider: string; url?: string | null };

export type TaskAgentCandidate = {
  id: string;
  name: string;
  address: string;
  phone: string;
  reason: string;
  draft: string;
  evidence: TaskAgentEvidence[];
  website?: string | null;
  googlePlaceId?: string | null;
  feedback?: TaskAgentFeedback[] | null;
  attributions?: TaskAgentAttribution[] | null;
};

export type TaskAgentRun = {
  id: string;
  status: string;
  version: number;
  service: string;
  urgency: string;
  slots: { location: string; budget: string; constraints: string };
  steps: { id: string; title: string; status: string; detail: string }[];
  candidates: TaskAgentCandidate[];
  warnings: string[];
  question: { key: string; text: string } | null;
  error: string | null;
};

export type TaskAgentEnvelope = { run: TaskAgentRun | null; intent: TaskAgentIntent | null };

export type TaskAgentAction = 'prepare' | 'search' | 'answer' | 'cancel' | 'pause' | 'resume' | 'retry' | 'saveDraft';

export type TaskAgentUpdate = { action: TaskAgentAction; version: number; key?: string | null; answer?: string | null; candidateId?: string | null };

export const taskAgentApi = {
  /** `GET /api/tasks/:id/agent`. */
  load: (taskId: string, client: ApiClient = getApi()) => client.get<TaskAgentEnvelope>(`/api/tasks/${encodeURIComponent(taskId)}/agent`),

  /** `POST /api/tasks/:id/agent`; Swift always sends empty `budget` and `constraints`. */
  update: (taskId: string, input: TaskAgentUpdate, client: ApiClient = getApi()) =>
    client.post<TaskAgentEnvelope>(`/api/tasks/${encodeURIComponent(taskId)}/agent`, {
      action: input.action,
      version: input.version,
      key: input.key ?? null,
      answer: input.answer ?? null,
      budget: '',
      constraints: '',
      candidateId: input.candidateId ?? null,
    }),
};
