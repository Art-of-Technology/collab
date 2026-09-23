// Keep the existing dashboard's channel-task contract when projecting Forge issues.
export const taskStatuses = ['backlog', 'in-progress', 'waiting', 'blocked', 'done'] as const;
export const taskPriorities = ['critical', 'high', 'normal', 'low'] as const;
export type TaskStatus = typeof taskStatuses[number];
export type TaskPriority = typeof taskPriorities[number];

export interface ForgeTask {
  number: number;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  owner: string;
  dueDate: string;
  followUpDate: string;
  nextAction: string;
  sourceUrl: string;
  updatedAt: string;
  comments: number;
  warning: string;
}

const text = (value: unknown): string => typeof value === 'string' ? value : '';
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function taskDate(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(+date) && date.toISOString().slice(0, 10) === value ? value : '';
}

export function projectForgeTask(value: unknown): ForgeTask | null {
  const issue = record(value);
  if (!Number.isSafeInteger(issue.number) || Number(issue.number) <= 0 || issue.pull_request) return null;
  if (typeof issue.title !== 'string' || !['open', 'closed'].includes(String(issue.state))) return null;
  const body = text(issue.body);
  const blocks = [...body.matchAll(/^```channel-task\r?\n([\s\S]*?)^```\s*$/gm)];
  let metadata: Record<string, unknown> = {};
  let warning = '';
  if (blocks.length === 1) {
    try {
      const parsed: unknown = JSON.parse(blocks[0][1]);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid task details');
      metadata = record(parsed);
    } catch {
      warning = 'Task details need review';
    }
  } else if (blocks.length > 1) warning = 'Multiple task detail blocks; review the source issue';
  const closed = issue.state === 'closed';
  const status: TaskStatus = closed ? 'done' : taskStatuses.includes(metadata.status as TaskStatus) && metadata.status !== 'done'
    ? metadata.status as TaskStatus : 'backlog';
  if (!closed && metadata.status === 'done') warning = 'Marked done in details, but the issue is still open';
  if (metadata.status && !taskStatuses.includes(metadata.status as TaskStatus)) warning = 'Unrecognized task status';
  if ((metadata.dueDate && !taskDate(metadata.dueDate)) || (metadata.followUpDate && !taskDate(metadata.followUpDate))) {
    warning = 'Invalid date; review the source issue';
  }
  let sourceUrl = '';
  try {
    const url = new URL(String(metadata.sourceUrl));
    if (url.protocol === 'https:' && /(^|\.)slack\.com$/.test(url.hostname) && !url.username && !url.password) sourceUrl = url.href;
  } catch { /* Missing discussion links are valid. */ }
  return {
    number: Number(issue.number), title: text(issue.title),
    description: body.replace(/^```channel-task\r?\n[\s\S]*?^```\s*$/gm, '').trim(),
    status, priority: taskPriorities.includes(metadata.priority as TaskPriority) ? metadata.priority as TaskPriority : 'normal',
    owner: text(metadata.owner) || text(record(issue.assignee).login),
    dueDate: taskDate(metadata.dueDate), followUpDate: taskDate(metadata.followUpDate),
    nextAction: text(metadata.nextAction), sourceUrl, updatedAt: text(issue.updated_at),
    comments: Number.isSafeInteger(issue.comments) && Number(issue.comments) >= 0 ? Number(issue.comments) : 0,
    warning,
  };
}

export function needsAttention(task: ForgeTask, today: string): boolean {
  return task.status !== 'done' && (task.priority === 'critical' || task.status === 'blocked' ||
    Boolean(task.dueDate && task.dueDate < today) || Boolean(task.followUpDate && task.followUpDate <= today));
}
