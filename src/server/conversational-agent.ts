import { createHash } from 'node:crypto';
import { prisma } from './db';
import { runAssistantTurn, type AssistantTurn } from './assistant';
import { scheduleDefaultReminders } from './reminders';
import { pushTaskToExternal } from './calendar-sync';
import { parseIntent } from '@/lib/intent';

const ACTION_TYPES = ['CREATE_TASK', 'UPDATE_TASK', 'COMPLETE_TASK', 'DELETE_TASK', 'RESCHEDULE_TASK', 'SET_REMINDER', 'NOOP'] as const;
type ActionType = typeof ACTION_TYPES[number];
type AgentAction = {
  type: ActionType;
  task_ids: string[];
  title: string | null;
  notes: string | null;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL' | null;
  status: string | null;
  start_at: string | null;
  due_at: string | null;
  reminder_at: string | null;
  duration_min: number | null;
  energy_level: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  depends_on_ids: string[];
  project_id: string | null;
  rationale: string;
};
type MemoryUpdate = { key: string; value: string; kind: 'preference' | 'correction' | 'person'; confidence: number };
type AgentPlan = {
  interpretation: string;
  response: string;
  needs_clarification: boolean;
  clarification_question: string | null;
  actions: AgentAction[];
  memory_updates: MemoryUpdate[];
};
type StoredAgentPlan = { agentVersion: 1; plan: AgentPlan; taskVersions: Record<string, string> };

function normalizePlan(plan: AgentPlan): AgentPlan {
  return { ...plan, actions: plan.actions.map((action) => ({ ...action, depends_on_ids: action.depends_on_ids ?? [], energy_level: action.energy_level ?? null })) };
}

const nullableString = { type: ['string', 'null'] };
const schema = {
  type: 'object', additionalProperties: false,
  required: ['interpretation', 'response', 'needs_clarification', 'clarification_question', 'actions', 'memory_updates'],
  properties: {
    interpretation: { type: 'string' }, response: { type: 'string' }, needs_clarification: { type: 'boolean' }, clarification_question: nullableString,
    actions: { type: 'array', maxItems: 25, items: {
      type: 'object', additionalProperties: false,
      required: ['type', 'task_ids', 'title', 'notes', 'priority', 'status', 'start_at', 'due_at', 'reminder_at', 'duration_min', 'energy_level', 'depends_on_ids', 'project_id', 'rationale'],
      properties: {
        type: { type: 'string', enum: ACTION_TYPES }, task_ids: { type: 'array', maxItems: 100, items: { type: 'string' } },
        title: nullableString, notes: nullableString, priority: { enum: ['LOW', 'NORMAL', 'HIGH', 'CRITICAL', null] }, status: nullableString,
        start_at: nullableString, due_at: nullableString, reminder_at: nullableString,
        duration_min: { type: ['integer', 'null'], minimum: 5, maximum: 1440 }, project_id: nullableString, rationale: { type: 'string' },
        energy_level: { enum: ['LOW', 'MEDIUM', 'HIGH', null] }, depends_on_ids: { type: 'array', maxItems: 25, items: { type: 'string' } },
      },
    } },
    memory_updates: { type: 'array', maxItems: 10, items: {
      type: 'object', additionalProperties: false, required: ['key', 'value', 'kind', 'confidence'],
      properties: { key: { type: 'string', maxLength: 80 }, value: { type: 'string', maxLength: 500 }, kind: { type: 'string', enum: ['preference', 'correction', 'person'] }, confidence: { type: 'number', minimum: 0, maximum: 1 } },
    } },
  },
};

function outputText(payload: { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> }) {
  if (payload.output_text) return payload.output_text;
  return payload.output?.flatMap((item) => item.content || []).find((item) => item.type === 'output_text')?.text || '';
}

async function contextFor(userId: string) {
  const [user, tasks, projects, memories, transcripts, priorActions] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { preference: true } }),
    prisma.task.findMany({ where: { userId, deletedAt: null }, select: { id: true, title: true, notes: true, status: true, priority: true, startAt: true, dueAt: true, durationMin: true, energyLevel: true, waitingOn: true, projectId: true, dependencies: { select: { dependsOnId: true } } }, orderBy: { updatedAt: 'desc' }, take: 100 }),
    prisma.project.findMany({ where: { userId, deletedAt: null }, select: { id: true, name: true } }),
    prisma.userMemory.findMany({ where: { userId }, select: { key: true, value: true, kind: true }, orderBy: { updatedAt: 'desc' }, take: 50 }),
    prisma.voiceTranscript.findMany({ where: { session: { userId } }, select: { text: true, corrected: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 8 }),
    prisma.assistantAction.findMany({ where: { userId }, select: { intent: true, payloadJson: true, confirmation: true, executed: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 8 }),
  ]);
  return { user, tasks, projects, memories, recentTurns: transcripts.reverse(), recentAssistantTurns: priorActions.reverse().map((item) => ({ ...item, payload: JSON.parse(item.payloadJson) })), now: new Date().toISOString() };
}

async function extractPlan(userId: string, transcript: string): Promise<AgentPlan> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_NOT_CONFIGURED');
  const context = await contextFor(userId);
  const instructions = `You are Harbour's task-planning interpreter. Convert the user's request into a safe structured plan using only the supplied user data.
Resolve dates relative to context.now and context.user.timeZone and return UTC ISO-8601 timestamps. Resolve people, projects, and references such as "that task" from recentTurns, recentAssistantTurns, memories, and exact task IDs. Treat a reply to the last clarification as a continuation, and treat corrections such as “not Tuesday, Wednesday” as replacing the relevant part of the most recent unexecuted proposal. Never invent an ID. Handle every requested operation in actions, not just the first. Capture task energy as LOW, MEDIUM, or HIGH and dependencies in depends_on_ids when expressed. If an essential target, destination, date, or meaning is genuinely ambiguous, set needs_clarification and ask one concise question; do not emit actions that depend on the missing fact. For read-only questions, answer only from context and use a NOOP action. Explain your interpretation briefly. Record memory_updates only for explicit corrections or durable preferences stated by the user. Do not store secrets, health information, financial account data, or authentication data. Material writes will be validated and confirmed by the application.`;
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-5.4-mini', instructions,
      input: `USER REQUEST:\n${transcript}\n\nCURRENT USER CONTEXT:\n${JSON.stringify(context)}`,
      text: { format: { type: 'json_schema', name: 'harbour_agent_plan', strict: true, schema } },
      reasoning: { effort: 'low' }, max_output_tokens: 3000, store: false,
      safety_identifier: `harbour_${createHash('sha256').update(userId).digest('hex').slice(0, 24)}`,
    }),
  });
  const payload = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }>; error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message || `OpenAI request failed (${response.status})`);
  const text = outputText(payload);
  if (!text) throw new Error('OpenAI returned no structured plan');
  return normalizePlan(JSON.parse(text) as AgentPlan);
}

function validDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

async function validatePlan(userId: string, plan: AgentPlan) {
  if (!Array.isArray(plan.actions) || plan.actions.length > 25) throw new Error('Invalid action plan');
  const referenced = [...new Set(plan.actions.flatMap((action) => [...(action.task_ids || []), ...(action.depends_on_ids || [])]))];
  const owned = referenced.length ? await prisma.task.findMany({ where: { userId, id: { in: referenced }, deletedAt: null }, select: { id: true } }) : [];
  const ownedIds = new Set(owned.map((task) => task.id));
  const unknown = referenced.filter((id) => !ownedIds.has(id));
  if (unknown.length) return `I could not safely resolve ${unknown.length === 1 ? 'that task' : 'some of those tasks'}. Which task did you mean?`;
  const projectIds = [...new Set(plan.actions.map((action) => action.project_id).filter((id): id is string => Boolean(id)))];
  if (projectIds.length) {
    const count = await prisma.project.count({ where: { userId, id: { in: projectIds }, deletedAt: null } });
    if (count !== projectIds.length) return 'I could not safely resolve that project. Which project did you mean?';
  }
  const edges = await prisma.taskDependency.findMany({ where: { task: { userId, deletedAt: null } }, select: { taskId: true, dependsOnId: true } });
  const graph = new Map<string, string[]>();
  for (const edge of edges) graph.set(edge.taskId, [...(graph.get(edge.taskId) ?? []), edge.dependsOnId]);
  const reaches = (from: string, target: string, seen = new Set<string>()): boolean => {
    if (from === target) return true;
    if (seen.has(from)) return false;
    seen.add(from);
    return (graph.get(from) ?? []).some((next) => reaches(next, target, seen));
  };
  for (const action of plan.actions) {
    if (!ACTION_TYPES.includes(action.type)) throw new Error('Unsupported action type');
    if (action.type === 'CREATE_TASK' && !action.title?.trim()) return 'What should I call the new task?';
    if (action.title && action.title.length > 200) return 'Please shorten that task title to 200 characters or fewer.';
    if (action.notes && action.notes.length > 5000) return 'Please shorten those task notes.';
    if (action.status && !['INBOX', 'PLANNED', 'IN_PROGRESS', 'WAITING'].includes(action.status)) return `I cannot safely set a task to “${action.status}” through a general update.`;
    if (['UPDATE_TASK', 'COMPLETE_TASK', 'DELETE_TASK', 'RESCHEDULE_TASK', 'SET_REMINDER'].includes(action.type) && !action.task_ids.length) return 'Which task should I change?';
    if (action.type === 'RESCHEDULE_TASK' && !validDate(action.start_at)) return 'When should I move that task?';
    if (action.type === 'SET_REMINDER' && !validDate(action.reminder_at)) return 'When should I remind you?';
    if (action.task_ids.some((id) => action.depends_on_ids.includes(id))) return 'A task cannot depend on itself.';
    if (action.task_ids.some((taskId) => action.depends_on_ids.some((dependencyId) => reaches(dependencyId, taskId)))) return 'That dependency would create a cycle. Please choose a different order.';
    for (const value of [action.start_at, action.due_at, action.reminder_at]) if (value && !validDate(value)) return `I need a clearer date than “${value}”.`;
  }
  return null;
}

async function saveMemories(userId: string, updates: MemoryUpdate[], taskIds: string[]) {
  const safe = updates.filter((item) => /^[a-z][a-z0-9_.:-]{1,79}$/i.test(item.key) && item.value.length <= 500 && !/(password|secret|token|account|health)/i.test(item.key));
  if (taskIds.length) safe.push({ key: 'context:last_task_ids', value: JSON.stringify(taskIds.slice(0, 10)), kind: 'correction', confidence: 1 });
  for (const item of safe) await prisma.userMemory.upsert({
    where: { userId_key: { userId, key: item.key } },
    update: { value: item.value, kind: item.kind, confidence: item.confidence, source: 'conversation' },
    create: { userId, key: item.key, value: item.value, kind: item.kind, confidence: item.confidence, source: 'conversation' },
  });
}

function describeAction(action: AgentAction) {
  if (action.type === 'CREATE_TASK') return `Create “${action.title}”${action.start_at ? ` for ${new Date(action.start_at).toLocaleString()}` : ''}`;
  if (action.type === 'NOOP') return action.rationale;
  const count = action.task_ids.length;
  const verb = action.type === 'COMPLETE_TASK' ? 'Complete' : action.type === 'DELETE_TASK' ? 'Cancel' : action.type === 'RESCHEDULE_TASK' ? 'Move' : action.type === 'SET_REMINDER' ? 'Remind' : 'Update';
  return `${verb} ${count} task${count === 1 ? '' : 's'}${action.start_at ? ` to ${new Date(action.start_at).toLocaleString()}` : ''}`;
}

async function executePlan(userId: string, plan: AgentPlan) {
  const affected = new Set<string>();
  const preference = await prisma.userPreference.findUnique({ where: { userId } });
  await prisma.$transaction(async (tx) => {
    for (const action of plan.actions) {
      if (action.type === 'NOOP') continue;
      if (action.type === 'CREATE_TASK') {
        const created = await tx.task.create({ data: { userId, title: action.title!.trim(), notes: action.notes || '', priority: action.priority || 'NORMAL', status: action.status || 'PLANNED', startAt: validDate(action.start_at), dueAt: validDate(action.due_at), durationMin: action.duration_min || 30, energyLevel: action.energy_level || 'MEDIUM', projectId: action.project_id, dependencies: { create: action.depends_on_ids.map((dependsOnId) => ({ dependsOnId })) } } });
        affected.add(created.id);
        if (action.reminder_at) {
          const fireAt = validDate(action.reminder_at)!;
          await tx.reminder.create({ data: { userId, taskId: created.id, fireAt, offsetLabel: 'custom reminder', idempotencyKey: `agent:${created.id}:${fireAt.toISOString()}` } });
        }
        continue;
      }
      for (const taskId of action.task_ids) {
        affected.add(taskId);
        if (action.type === 'COMPLETE_TASK') await tx.task.update({ where: { id: taskId }, data: { status: 'COMPLETED', completedAt: new Date() } });
        if (action.type === 'DELETE_TASK') await tx.task.update({ where: { id: taskId }, data: { status: 'CANCELLED', deletedAt: new Date() } });
        if (action.type === 'RESCHEDULE_TASK') {
          const existing = await tx.task.findUniqueOrThrow({ where: { id: taskId } });
          const nextStart = validDate(action.start_at);
          const postponed = Boolean(preference?.personalizationEnabled && existing.startAt && nextStart && nextStart > existing.startAt);
          await tx.task.update({ where: { id: taskId }, data: { startAt: nextStart, durationMin: action.duration_min || undefined, postponeCount: postponed ? { increment: 1 } : undefined, lastRescheduledAt: postponed ? new Date() : undefined } });
        }
        if (action.type === 'UPDATE_TASK') await tx.task.update({ where: { id: taskId }, data: { title: action.title || undefined, notes: action.notes ?? undefined, priority: action.priority || undefined, status: action.status || undefined, startAt: action.start_at ? validDate(action.start_at) : undefined, dueAt: action.due_at ? validDate(action.due_at) : undefined, durationMin: action.duration_min || undefined, energyLevel: action.energy_level || undefined, projectId: action.project_id || undefined, dependencies: action.depends_on_ids.length ? { deleteMany: {}, create: action.depends_on_ids.map((dependsOnId) => ({ dependsOnId })) } : undefined } });
        if (action.type === 'SET_REMINDER') {
          const fireAt = validDate(action.reminder_at)!;
          await tx.reminder.upsert({ where: { idempotencyKey: `agent:${taskId}:${fireAt.toISOString()}` }, update: { fireAt, status: 'SCHEDULED' }, create: { userId, taskId, fireAt, offsetLabel: 'custom reminder', idempotencyKey: `agent:${taskId}:${fireAt.toISOString()}` } });
        }
        await tx.activityLog.create({ data: { userId, taskId, kind: `AGENT_${action.type}`, summary: action.rationale.slice(0, 300) } });
      }
    }
  });
  const taskIds = [...affected];
  await Promise.allSettled(taskIds.map(async (taskId) => {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (task?.startAt) await scheduleDefaultReminders(userId, task.id, task.startAt, task.critical);
    await pushTaskToExternal(userId, taskId);
  }));
  return taskIds;
}

function turn(plan: AgentPlan, confirmation?: { prompt: string; actionId: string } | null): AssistantTurn {
  const lines = plan.actions.filter((action) => action.type !== 'NOOP').map(describeAction).filter(Boolean);
  const spoken = plan.needs_clarification ? plan.clarification_question || plan.response : plan.response || plan.interpretation;
  return {
    transcript: '', intent: { intent: 'UNKNOWN', confidence: 1, confirmationRequired: Boolean(confirmation), raw: '' }, spoken,
    visual: { summary: plan.interpretation, appointments: [], tasks: lines, overdue: [], next: plan.needs_clarification ? spoken : confirmation ? 'Review the proposed changes and confirm to apply them.' : plan.response, rangeLabel: plan.needs_clarification ? 'Clarification needed' : confirmation ? 'Proposed changes' : 'Assistant' },
    confirmation,
  };
}

export async function runConversationalAgent(userId: string, transcript: string, confirmActionId?: string): Promise<AssistantTurn> {
  const deterministic = parseIntent(transcript);
  if (!confirmActionId && ['BRIEF_ME', 'LIST_THIS_WEEK', 'LIST_DEADLINES'].includes(deterministic.intent)) return runAssistantTurn(userId, transcript);
  if (!process.env.OPENAI_API_KEY) return runAssistantTurn(userId, transcript, confirmActionId);
  if (confirmActionId) {
    const pending = await prisma.assistantAction.findFirst({ where: { id: confirmActionId, userId, intent: 'AGENT_PLAN', executed: false } });
    if (!pending) throw new Error('NOT_FOUND');
    const stored = JSON.parse(pending.payloadJson) as StoredAgentPlan;
    if (stored.agentVersion !== 1) throw new Error('STALE_AGENT_PLAN');
    const plan = normalizePlan(stored.plan);
    const clarification = await validatePlan(userId, plan);
    if (clarification) throw new Error('STALE_AGENT_PLAN');
    const versionIds = Object.keys(stored.taskVersions);
    const current = versionIds.length ? await prisma.task.findMany({ where: { userId, id: { in: versionIds }, deletedAt: null }, select: { id: true, updatedAt: true } }) : [];
    if (current.length !== versionIds.length || current.some((task) => task.updatedAt.toISOString() !== stored.taskVersions[task.id])) throw new Error('STALE_AGENT_PLAN');
    const taskIds = await executePlan(userId, plan);
    await prisma.assistantAction.update({ where: { id: pending.id }, data: { executed: true, confirmation: 'CONFIRMED', resultJson: JSON.stringify({ taskIds }) } });
    await saveMemories(userId, plan.memory_updates, taskIds);
    return { ...turn({ ...plan, response: `Done. ${plan.interpretation}` }, null), transcript };
  }

  const plan = await extractPlan(userId, transcript);
  const session = await prisma.voiceSession.create({ data: { userId, status: 'processed', transcripts: { create: { text: transcript, confidence: 1 } } } });
  const clarification = await validatePlan(userId, plan);
  if (clarification) { plan.needs_clarification = true; plan.clarification_question = clarification; plan.actions = []; plan.response = clarification; }
  const referenced = [...new Set(plan.actions.flatMap((action) => [...action.task_ids, ...action.depends_on_ids]))];
  await saveMemories(userId, plan.memory_updates, referenced);
  const material = plan.actions.some((action) => action.type !== 'NOOP');
  if (plan.needs_clarification || !material) {
    await prisma.assistantAction.create({ data: { userId, sessionId: session.id, intent: plan.needs_clarification ? 'AGENT_CLARIFICATION' : 'AGENT_READ', payloadJson: JSON.stringify(plan), confirmation: 'NONE', executed: true, resultJson: JSON.stringify({ response: plan.response }) } });
    return { ...turn(plan, null), transcript };
  }
  const versions = referenced.length ? await prisma.task.findMany({ where: { userId, id: { in: referenced } }, select: { id: true, updatedAt: true } }) : [];
  const stored: StoredAgentPlan = { agentVersion: 1, plan, taskVersions: Object.fromEntries(versions.map((task) => [task.id, task.updatedAt.toISOString()])) };
  await prisma.assistantAction.updateMany({ where: { userId, intent: 'AGENT_PLAN', executed: false }, data: { executed: true, confirmation: 'SUPERSEDED', resultJson: JSON.stringify({ reason: 'Replaced by a newer conversational proposal' }) } });
  const action = await prisma.assistantAction.create({ data: { userId, sessionId: session.id, intent: 'AGENT_PLAN', payloadJson: JSON.stringify(stored), confirmation: 'REQUIRED' } });
  return { ...turn(plan, { prompt: plan.interpretation, actionId: action.id }), transcript };
}
