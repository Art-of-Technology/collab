import 'server-only';
import { readFile } from 'node:fs/promises';
import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { boundedJson, type ForgeBinding } from './reader';
import { issueFingerprint, patchIssueContent, sourceIssue, type IssueChanges, type SourceIssue } from './issue-content';

const commentSchema = z.object({
  id: z.number().int().positive(), body: z.string(), updated_at: z.string(),
  user: z.object({ id: z.number().int().positive(), login: z.string() }),
});
export type ForgeComment = z.infer<typeof commentSchema> & { fingerprint: string; canEdit: boolean };
export type IssueSnapshot = { issue: SourceIssue; fingerprint: string; comments: ForgeComment[]; partialComments: boolean };
export type IssueWriteResult = { kind: 'saved'; number: number } | { kind: 'conflict' | 'uncertain' | 'denied' };
export type IssueCommand =
  | { action: 'edit'; number: number; expected: string; changes: IssueChanges }
  | { action: 'create'; title: string; description: string }
  | { action: 'comment'; number: number; body: string }
  | { action: 'edit-comment'; number: number; commentId: number; expected: string; body: string };
const fingerprintComment = (comment: z.infer<typeof commentSchema>) => createHash('sha256')
  .update(JSON.stringify([comment.id, comment.body, comment.updated_at, comment.user.id])).digest('hex');

async function connect(binding: ForgeBinding, write: boolean, request: typeof fetch) {
  const file = write ? binding.issues?.writeTokenFile : binding.readTokenFile;
  if (!file) throw new Error('Project writing is not configured');
  const token = (await readFile(file, 'utf8')).trim();
  if (!token || token.length > 4096 || /\s/.test(token)) throw new Error('Project credentials unavailable');
  if (write && (!binding.issues || !timingSafeEqual(createHash('sha256').update(token).digest(), Buffer.from(binding.issues.tokenSha256, 'hex')))) {
    throw new Error('Project writer identity changed');
  }
  const base = `${binding.origin}/api/v1/repos/${encodeURIComponent(binding.owner)}/${encodeURIComponent(binding.repository)}`;
  const signal = AbortSignal.timeout(15000);
  const call = (path: string, method = 'GET', body?: unknown) => request(base + path, {
    method, headers: { Authorization: `token ${token}`, Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), cache: 'no-store', redirect: 'error', signal,
  });
  const repository = await boundedJson(await call('')) as { id?: unknown };
  if (repository?.id !== binding.repositoryId) throw new Error('Project connection changed');
  return { call, issue: async (number: number) => sourceIssue.parse(await boundedJson(await call(`/issues/${number}`))) };
}

export async function readForgeIssue(binding: ForgeBinding, number: number, request: typeof fetch = fetch): Promise<IssueSnapshot> {
  const api = await connect(binding, false, request);
  const issue = await api.issue(number);
  if (issue.number !== number) throw new Error('Issue does not match');
  const comments: ForgeComment[] = [];
  for (let page = 1; page <= 20; page++) {
    const rows = z.array(commentSchema).max(50).parse(await boundedJson(await api.call(`/issues/${number}/comments?limit=50&page=${page}`)));
    for (const row of rows) comments.push({ ...row, fingerprint: fingerprintComment(row), canEdit: row.user.id === binding.issues?.principalId });
    if (rows.length < 50) return { issue, fingerprint: issueFingerprint(issue), comments, partialComments: false };
  }
  return { issue, fingerprint: issueFingerprint(issue), comments, partialComments: true };
}

export async function writeForgeIssue(binding: ForgeBinding, command: IssueCommand, request: typeof fetch = fetch): Promise<IssueWriteResult> {
  const api = await connect(binding, true, request);
  let path: string, method: string, payload: Record<string, unknown>;
  let number = 'number' in command ? command.number : 0;
  if (command.action === 'edit') {
    const current = await api.issue(command.number);
    if (current.number !== command.number || issueFingerprint(current) !== command.expected) return { kind: 'conflict' };
    payload = patchIssueContent(current, command.changes);
    if (!Object.keys(payload).length) return { kind: 'saved', number };
    path = `/issues/${number}`; method = 'PATCH';
  } else if (command.action === 'edit-comment') {
    // Fetch through the issue-specific collection before using the repository comment endpoint.
    const snapshot = await readForgeIssue(binding, number, request);
    const comment = snapshot.comments.find(item => item.id === command.commentId);
    if (!comment || !comment.canEdit) return { kind: 'denied' };
    if (comment.fingerprint !== command.expected) return { kind: 'conflict' };
    path = `/issues/comments/${command.commentId}`; method = 'PATCH'; payload = { body: command.body };
  } else if (command.action === 'comment') {
    if ((await api.issue(number)).number !== number) return { kind: 'denied' };
    path = `/issues/${number}/comments`; method = 'POST'; payload = { body: command.body };
  } else {
    path = '/issues'; method = 'POST'; payload = { title: command.title, body: command.description };
  }
  let receipt: unknown;
  try {
    const response = await api.call(path, method, payload);
    if ([409, 412, 422].includes(response.status)) return { kind: 'conflict' };
    if ([401, 403, 404].includes(response.status)) return { kind: 'denied' };
    receipt = await boundedJson(response);
  } catch {
    // Never retry a POST: a lost response can still mean a successful creation.
    if (method === 'POST') return { kind: 'uncertain' };
  }
  try {
    // Use a fresh read connection/time budget after an ambiguous write response.
    const read = await connect(binding, false, request);
    if (command.action === 'edit' || command.action === 'create') {
      if (command.action === 'create') number = sourceIssue.parse(receipt).number;
      const current = await read.issue(number);
      const matches = current.number === number && Object.entries(payload).every(([key, value]) => current[key as keyof SourceIssue] === value);
      return matches ? { kind: 'saved', number } : { kind: 'uncertain' };
    }
    const id = command.action === 'edit-comment' ? command.commentId : commentSchema.parse(receipt).id;
    const current = commentSchema.parse(await boundedJson(await read.call(`/issues/comments/${id}`)));
    return current.id === id && current.user.id === binding.issues?.principalId && current.body === command.body
      ? { kind: 'saved', number } : { kind: 'uncertain' };
  } catch { return { kind: 'uncertain' }; }
}
