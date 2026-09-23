import { z } from 'zod';

const id = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const timestamp = z.string().datetime();
const source = z.string().url().max(2048).refine(value => {
  const url = new URL(value);
  return url.protocol === 'https:' && !url.username && !url.password &&
    (url.hostname === 'slack.com' || url.hostname.endsWith('.slack.com'));
});
export const memoryDraftSchema = z.object({
  title: z.string().trim().min(1).max(200),
  type: z.enum(['Rules', 'Strategy', 'Decisions', 'Handoffs']),
  body: z.string().min(1).max(32000).refine(value => !value.includes('<!-- collab-') && !value.includes('<!-- /collab-'), 'Reserved document marker'),
  sources: z.array(source).max(20),
}).strict();
const revisionSchema = memoryDraftSchema.extend({
  id,
  revision: z.number().int().min(1).max(10000),
  ownerId: id,
  updatedBy: id,
  updatedAt: timestamp,
  state: z.enum(['Draft', 'Approved', 'Superseded']),
  approvedBy: id.nullable(),
  approvedAt: timestamp.nullable(),
}).strict();
const documentSchema = z.object({
  version: z.literal(1),
  projectId: id,
  revisions: z.array(revisionSchema).max(300),
}).strict().superRefine((document, ctx) => {
  const groups = new Map<string, z.infer<typeof revisionSchema>[]>();
  for (const revision of document.revisions) {
    const list = groups.get(revision.id) ?? [];
    list.push(revision); groups.set(revision.id, list);
    const approved = revision.state !== 'Draft';
    if (approved !== Boolean(revision.approvedBy && revision.approvedAt) ||
      (!approved && (revision.approvedBy !== null || revision.approvedAt !== null)))
      ctx.addIssue({ code: 'custom', message: 'Invalid approval provenance' });
  }
  for (const revisions of groups.values()) {
    if (revisions.length > 3 || new Set(revisions.map(item => item.ownerId)).size !== 1 ||
      new Set(revisions.map(item => item.revision)).size !== revisions.length ||
      revisions.filter(item => item.state === 'Approved').length > 1 ||
      revisions.filter(item => item.state === 'Draft').length > 1 ||
      revisions.filter(item => item.state === 'Superseded').length > 1)
      ctx.addIssue({ code: 'custom', message: 'Ambiguous revision history' });
    const draft = revisions.find(item => item.state === 'Draft');
    if (draft && revisions.some(item => item.revision > draft.revision))
      ctx.addIssue({ code: 'custom', message: 'Draft must be the newest revision' });
  }
});
export type ProjectMemory = z.infer<typeof documentSchema>;
export type MemoryRevision = z.infer<typeof revisionSchema>;
export type MemoryDraft = z.infer<typeof memoryDraftSchema>;

export function serializeMemory(value: ProjectMemory): string {
  const document = documentSchema.parse(value);
  const header = `<!-- collab-project: ${JSON.stringify({ version: 1, projectId: document.projectId })} -->\n`;
  const markdown = header + document.revisions.map(({ body, ...metadata }) =>
    `\n<!-- collab-memory: ${JSON.stringify(metadata)} -->\n${body}\n<!-- /collab-memory -->\n`).join('');
  if (new TextEncoder().encode(markdown).length > 512000) throw new Error('Project memory is too large');
  return markdown;
}

export function parseMemory(markdown: string, projectId: string): ProjectMemory {
  if (typeof markdown !== 'string' || new TextEncoder().encode(markdown).length > 512000) throw new Error('Invalid project memory');
  const header = /^<!-- collab-project: ([^\n]+) -->\n/.exec(markdown);
  if (!header) throw new Error('Missing project memory header');
  const metadata = JSON.parse(header[1]);
  if (metadata.projectId !== projectId) throw new Error('Project memory belongs to another project');
  let rest = markdown.slice(header[0].length);
  const revisions = [];
  while (rest) {
    const section = /^\n<!-- collab-memory: ([^\n]+) -->\n([\s\S]*?)\n<!-- \/collab-memory -->\n/.exec(rest);
    if (!section) throw new Error('Invalid project memory section');
    revisions.push({ ...JSON.parse(section[1]), body: section[2] });
    rest = rest.slice(section[0].length);
  }
  return documentSchema.parse({ ...metadata, revisions });
}

// The caller supplies a verified server identity and freshly checked project rights.
export function saveMemoryDraft(document: ProjectMemory, noteId: string, input: MemoryDraft,
  actor: { id: string; canManage: boolean }, now: string): ProjectMemory {
  const current = documentSchema.parse(document);
  id.parse(noteId); id.parse(actor.id); timestamp.parse(now);
  const draft = memoryDraftSchema.parse(input);
  const history = current.revisions.filter(item => item.id === noteId);
  const ownerId = history[0]?.ownerId ?? actor.id;
  if (ownerId !== actor.id && !actor.canManage) throw new Error('Cannot edit another owner’s memory');
  const existing = history.find(item => item.state === 'Draft');
  const revision: MemoryRevision = { ...draft, id: noteId, ownerId, updatedBy: actor.id, updatedAt: now,
    revision: existing?.revision ?? Math.max(0, ...history.map(item => item.revision)) + 1,
    state: 'Draft', approvedBy: null, approvedAt: null };
  return documentSchema.parse({ ...current,
    revisions: [...current.revisions.filter(item => item !== existing), revision] });
}

export function approveMemoryDraft(document: ProjectMemory, noteId: string, revision: number,
  actor: { id: string; canManage: boolean }, now: string): ProjectMemory {
  const current = documentSchema.parse(document);
  if (!actor.canManage) throw new Error('Project memory approval requires management rights');
  id.parse(actor.id); timestamp.parse(now);
  if (!current.revisions.some(item => item.id === noteId && item.revision === revision && item.state === 'Draft'))
    throw new Error('Draft revision changed; reload before approving');
  // ponytail: one shared file serializes project edits; split files if contention becomes material.
  // Git retains older history; only the last superseded revision stays in the current document.
  return documentSchema.parse({ ...current, revisions: current.revisions.filter(item => item.id !== noteId || item.state !== 'Superseded').map(item => {
    if (item.id !== noteId) return item;
    if (item.state === 'Approved') return { ...item, state: 'Superseded' };
    if (item.state === 'Draft') return { ...item, state: 'Approved', approvedBy: actor.id, approvedAt: now };
    return item;
  }) });
}

export function selectApprovedMemory(document: ProjectMemory, relevantIds: string[]): MemoryRevision[] {
  const current = documentSchema.parse(document);
  const relevant = new Set(relevantIds);
  return current.revisions.filter(item => item.state === 'Approved' && (item.type === 'Rules' || relevant.has(item.id)));
}
