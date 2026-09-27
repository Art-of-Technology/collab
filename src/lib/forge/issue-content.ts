import { createHash } from 'node:crypto';
import { z } from 'zod';
import { taskDate, taskPriorities, taskStatuses } from './tasks';

const date = z.string().refine(value => value === '' || taskDate(value) === value, 'Use a valid date');
export const issueDescription = z.string().max(500000).refine(value => !/^```channel-task/m.test(value), 'Use the task fields to edit task details');
export const issueChanges = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: issueDescription.optional(),
  status: z.enum(taskStatuses).optional(),
  priority: z.enum(taskPriorities).optional(),
  owner: z.string().max(200).optional(),
  dueDate: date.optional(),
  followUpDate: date.optional(),
  nextAction: z.string().max(32000).optional(),
}).strict().refine(value => Object.keys(value).length > 0);
export type IssueChanges = z.infer<typeof issueChanges>;
export const sourceIssue = z.object({
  number: z.number().int().positive(), title: z.string(), body: z.string().nullable(),
  state: z.enum(['open', 'closed']), updated_at: z.string(), pull_request: z.unknown().optional(),
}).refine(issue => !issue.pull_request);
export type SourceIssue = z.infer<typeof sourceIssue>;

export function issueFingerprint(issue: SourceIssue) {
  return createHash('sha256').update(JSON.stringify([issue.number, issue.title, issue.body, issue.state, issue.updated_at])).digest('hex');
}

export function splitIssueBody(body: string) {
  const openings = [...body.matchAll(/^```channel-task[^\r\n]*(?:\r?\n|$)/gm)];
  const blocks = [...body.matchAll(/^```channel-task[ \t]*\r?\n([\s\S]*?)^```[ \t]*\r?$/gm)];
  if (!openings.length) return { before: body, after: '', block: '', metadata: {} as Record<string, unknown> };
  if (openings.length !== 1 || blocks.length !== 1) throw new Error('Review the task detail blocks in the source issue before editing.');
  const block = blocks[0];
  const value: unknown = JSON.parse(block[1], (_key, item) => {
    if (typeof item === 'number' && !Number.isFinite(item)) throw new Error('Invalid task details');
    return item;
  });
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid task details');
  return { before: body.slice(0, block.index), after: body.slice(block.index! + block[0].length), block: block[0], metadata: value as Record<string, unknown> };
}

export function patchIssueContent(issue: SourceIssue, changes: IssueChanges) {
  const { before, after, block, metadata } = splitIssueBody(issue.body ?? '');
  const { title, description, ...details } = changes;
  if (description !== undefined) issueDescription.parse(description);
  if (details.status === 'done') delete details.status; // Closed state is authoritative.
  for (const key of Object.keys(details) as (keyof typeof details)[]) {
    if (details[key] === metadata[key]) delete details[key];
  }
  const patch: { title?: string; body?: string; state?: 'open' | 'closed' } = {};
  if (title !== undefined) patch.title = title;
  if (changes.status !== undefined) patch.state = changes.status === 'done' ? 'closed' : 'open';
  if (Object.keys(details).length || description !== undefined) {
    const nextBlock = Object.keys(details).length
      ? '```channel-task\n' + JSON.stringify({ ...metadata, ...details }, null, 2) + '\n```'
      : block;
    if (description !== undefined) patch.body = description + (nextBlock ? '\n\n' + nextBlock : '');
    else patch.body = block ? before + nextBlock + after : before + (before ? '\n\n' : '') + nextBlock;
    if (Buffer.byteLength(patch.body, 'utf8') > 1024 * 1024) throw new Error('Issue body is too large');
  }
  return patch;
}

export function readyIssueContent(issue: SourceIssue, ready: { attemptId: string; deploymentKey: string; configuredModel: string }) {
  const { before, after, block, metadata } = splitIssueBody(issue.body ?? '');
  const previous = metadata.execution && typeof metadata.execution === 'object' && !Array.isArray(metadata.execution) ? metadata.execution : {};
  const next = '```channel-task\n' + JSON.stringify({ ...metadata, execution: { ...previous, status: 'ready', ...ready } }, null, 2) + '\n```';
  const body = block ? before + next + after : before + (before ? '\n\n' : '') + next;
  if (Buffer.byteLength(body, 'utf8') > 1024 * 1024) throw new Error('Issue body is too large');
  return { body };
}
