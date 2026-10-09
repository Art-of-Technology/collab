import { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { AppAuthContext } from '@/lib/apps/auth-middleware';
import { prisma } from '@/lib/prisma';
import { issueReadAccessWhere, userHasWorkspaceAccess } from '@/lib/issue-finder';
import { noteAccessWhere } from '@/lib/secrets/access';
import { hasScope } from '@/lib/oauth-scopes';
import { stripHtmlToPlainText } from '@/lib/html-sanitizer';
import { responseBytes, SearchError } from './agent-search-query';

const MAX_SCOPE = 50000;

export const contextOptionsSchema = z.object({
  projectId: z.string().trim().min(1).max(128),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  offset: z.coerce.number().int().min(0).max(MAX_SCOPE).default(0),
  maxTokens: z.coerce.number().int().min(2048).max(64000).default(8000),
  since: z.string().datetime({ offset: true }).optional(),
});
type Options = z.infer<typeof contextOptionsSchema>;
const issueSelect = {
  id: true, issueKey: true, title: true, projectId: true, parentId: true, priority: true,
  status: true, statusValue: true, updatedAt: true, dueDate: true,
  projectStatus: { select: { id: true, name: true, isFinal: true } },
  assignee: { select: { id: true, name: true } },
} satisfies Prisma.IssueSelect;
type Issue = Prisma.IssueGetPayload<{ select: typeof issueSelect }>;

// Keep ID predicates below Prisma's 32,767-bind limit, including compound filters.
async function readIds<T>(ids: string[], read: (batch: string[]) => Promise<T[]>): Promise<T[]> {
  const results: T[] = [];
  const unique = [...new Set(ids)];
  for (let start = 0; start < unique.length; start += 10000) results.push(...await read(unique.slice(start, start + 10000)));
  return results;
}

export async function getProjectContext(context: AppAuthContext, options: Options) {
  const started = new Date();
  for (const scope of ['issues:read', 'context:read']) {
    if (!hasScope(scope, context.token.scopes)) throw new SearchError('insufficient_scope', `Project context requires ${scope}`, 403);
  }
  const activeWorkspace = () => userHasWorkspaceAccess(context.user.id, context.workspace.id);
  if (!await activeWorkspace()) throw new SearchError('workspace_access_denied', 'Active workspace access required', 403);
  const project = await prisma.project.findFirst({ where: { id: options.projectId, workspaceId: context.workspace.id },
    select: { id: true, name: true, slug: true, description: true, isArchived: true, updatedAt: true } });
  if (!project) throw new SearchError('project_not_found', 'Project not found or access denied', 404);
  const allowed: Prisma.IssueWhereInput = { AND: [issueReadAccessWhere(context.user.id)],
    workspaceId: context.workspace.id, project: { workspaceId: context.workspace.id } };
  const issues = await prisma.issue.findMany({ where: { AND: [allowed], projectId: project.id }, select: issueSelect,
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], take: MAX_SCOPE + 1 });
  if (issues.length > MAX_SCOPE) throw new SearchError('scope_too_large', 'Project context supports up to 50,000 visible issues', 422);
  const since = options.since ? new Date(options.since) : new Date(started.getTime() - 7 * 86400000);
  const parentIds = [...new Set(issues.flatMap(i => i.parentId ? [i.parentId] : []))];
  const [relations, parents, activityCandidates, children] = await Promise.all([
    prisma.issueRelation.findMany({ where: {
      relationType: { in: ['BLOCKS', 'BLOCKED_BY', 'PARENT'] }, sourceIssue: allowed, targetIssue: allowed,
      OR: [{ sourceIssue: { projectId: project.id } }, { targetIssue: { projectId: project.id } }],
    }, select: { id: true, relationType: true, updatedAt: true, sourceIssue: { select: issueSelect }, targetIssue: { select: issueSelect } },
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], take: MAX_SCOPE + 1 }),
    readIds(parentIds, ids => prisma.issue.findMany({ where: { AND: [allowed], id: { in: ids } }, select: issueSelect })),
    readIds(issues.map(i => i.id), ids => prisma.issueActivity.findMany({ where: { workspaceId: context.workspace.id, itemType: 'ISSUE',
      itemId: { in: ids }, OR: [{ projectId: project.id }, { projectId: null }], createdAt: { gte: since } },
      select: { id: true, itemId: true, createdAt: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: MAX_SCOPE + 1 })),
    readIds(issues.map(i => i.id), ids => prisma.issue.findMany({ where: { AND: [allowed], projectId: { not: project.id },
      parentId: { in: ids } }, select: issueSelect, take: MAX_SCOPE + 1, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }] })),
  ]);
  if (activityCandidates.length > MAX_SCOPE) throw new SearchError('scope_too_large', 'Project context supports up to 50,000 activity records', 422);
  activityCandidates.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id));
  children.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime() || a.id.localeCompare(b.id));
  if (relations.length > MAX_SCOPE || children.length > MAX_SCOPE) throw new SearchError('scope_too_large', 'Project context supports up to 50,000 visible dependency and parent relations', 422);
  const issueMap = new Map(issues.map(i => [i.id, i]));
  const path = `/${encodeURIComponent(context.workspace.slug || context.workspace.id)}`;
  const plain = (value: string | null, limit: number) => stripHtmlToPlainText(value || '').slice(0, limit);
  const card = (issue: Issue) => ({ id: issue.id, type: 'issue' as const, issueKey: issue.issueKey, title: plain(issue.title, 300),
    projectId: issue.projectId, status: plain(issue.projectStatus?.name || issue.statusValue || issue.status, 128) || null,
    completed: issue.projectStatus?.isFinal ?? null, assignee: issue.assignee ? { id: issue.assignee.id, name: plain(issue.assignee.name, 120) } : null,
    updatedAt: issue.updatedAt.toISOString(), url: `${path}/issues/${encodeURIComponent(issue.issueKey || issue.id)}` });
  const dependencies = relations.filter(r => r.relationType === 'BLOCKS' || r.relationType === 'BLOCKED_BY').map(r => ({ id: r.id, type: 'BLOCKS' as const,
    source: card(r.relationType === 'BLOCKED_BY' ? r.targetIssue : r.sourceIssue),
    target: card(r.relationType === 'BLOCKED_BY' ? r.sourceIssue : r.targetIssue), updatedAt: r.updatedAt.toISOString() }));
  const blockers = dependencies.filter(r => r.source.completed !== true && r.target.completed !== true);
  const parentMap = new Map(parents.map(i => [i.id, i]));
  const hierarchy = new Map<string, { id: string; type: 'PARENT'; source: ReturnType<typeof card>; target: ReturnType<typeof card>; updatedAt: string }>();
  for (const issue of issues) {
    const parent = issue.parentId && parentMap.get(issue.parentId);
    if (parent) hierarchy.set(`${issue.id}:${parent.id}`, { id: `parent:${issue.id}`, type: 'PARENT', source: card(issue), target: card(parent), updatedAt: issue.updatedAt.toISOString() });
  }
  for (const child of children) {
    const parent = child.parentId && issueMap.get(child.parentId);
    if (parent) hierarchy.set(`${child.id}:${parent.id}`, { id: `parent:${child.id}`, type: 'PARENT', source: card(child), target: card(parent), updatedAt: child.updatedAt.toISOString() });
  }
  for (const relation of relations.filter(r => r.relationType === 'PARENT')) hierarchy.set(`${relation.sourceIssue.id}:${relation.targetIssue.id}`, {
    id: relation.id, type: 'PARENT', source: card(relation.sourceIssue), target: card(relation.targetIssue), updatedAt: relation.updatedAt.toISOString(),
  });
  const byStatus = new Map<string, { statusId: string | null; name: string | null; completed: boolean | null; count: number }>();
  const owners = new Map<string, { id: string; name: string | null; issueCount: number; completed: number; unknownCompletion: number }>();
  for (const issue of issues) {
    const name = plain(issue.projectStatus?.name || issue.statusValue || issue.status, 128) || null;
    const statusKey = issue.projectStatus?.id || `legacy:${name || ''}`;
    const status = byStatus.get(statusKey) || { statusId: issue.projectStatus?.id || null, name, completed: issue.projectStatus?.isFinal ?? null, count: 0 };
    status.count++; byStatus.set(statusKey, status);
    if (issue.assignee) {
      const owner = owners.get(issue.assignee.id) || { id: issue.assignee.id, name: plain(issue.assignee.name, 120), issueCount: 0, completed: 0, unknownCompletion: 0 };
      owner.issueCount++; owner.completed += Number(issue.projectStatus?.isFinal === true);
      owner.unknownCompletion += Number(!issue.projectStatus); owners.set(owner.id, owner);
    }
  }
  const noteWhere = (): Prisma.NoteWhereInput => ({ AND: [noteAccessWhere(context.user.id),
    { OR: [{ workspaceId: context.workspace.id }, { workspaceId: null, project: { workspaceId: context.workspace.id } }] },
    { OR: [{ projectId: project.id }, { projectId: null }] }],
    scope: { in: ['WORKSPACE', 'PROJECT', 'PUBLIC'] }, type: { notIn: ['ENV_VARS', 'API_KEYS', 'CREDENTIALS'] }, isEncrypted: false,
  });
  const notes = await prisma.note.findMany({ where: noteWhere(), select: { id: true },
  orderBy: [{ isAiContext: 'desc' }, { aiContextPriority: 'desc' }, { isPinned: 'desc' }, { updatedAt: 'desc' }, { id: 'asc' }], take: MAX_SCOPE + 1 });
  if (notes.length > MAX_SCOPE) throw new SearchError('scope_too_large', 'Project context supports up to 50,000 visible Notes', 422);
  // Activity has no Issue FK; verify its parent still exists and is readable before returning history.
  const currentParents = await readIds(activityCandidates.map(a => a.itemId), ids => prisma.issue.findMany({ where: { AND: [allowed], projectId: project.id,
    id: { in: ids } }, select: { id: true } }));
  const currentParentIds = new Set(currentParents.map(i => i.id));
  const changes = [
    ...issues.filter(i => i.updatedAt >= since).map(i => ({ id: i.id, type: 'issue' as const, updatedAt: i.updatedAt.toISOString() })),
    ...activityCandidates.filter(a => currentParentIds.has(a.itemId)).map(a => ({ id: a.id, type: 'activity' as const,
      updatedAt: a.createdAt.toISOString() })),
  ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || `${a.type}:${a.id}`.localeCompare(`${b.type}:${b.id}`));
  const page = <T,>(items: T[]) => {
    if (items.length > MAX_SCOPE) throw new SearchError('scope_too_large', 'Project context supports up to 50,000 records per section', 422);
    return { items: items.slice(options.offset, options.offset + options.limit),
      pagination: { offset: options.offset, nextOffset: items.length > options.offset + options.limit ? options.offset + options.limit : null,
        hasMore: items.length > options.offset + options.limit, total: items.length } };
  };
  const notePage = page(notes), changePage = page(changes);
  const [notePayloads, activityPayloads] = await Promise.all([
    prisma.note.findMany({ where: { AND: [noteWhere()], id: { in: notePage.items.map(n => n.id) } },
      select: { id: true, title: true, content: true, type: true, projectId: true, updatedAt: true, isAiContext: true, isPinned: true, authorId: true, expiresAt: true } }),
    prisma.issueActivity.findMany({ where: { workspaceId: context.workspace.id, itemType: 'ISSUE',
      id: { in: changePage.items.filter(c => c.type === 'activity').map(c => c.id) },
      OR: [{ projectId: project.id }, { projectId: null }], createdAt: { gte: since } },
      select: { id: true, itemId: true, action: true, fieldName: true, details: true, createdAt: true } }),
  ]);
  const pageIssues = await readIds([
    ...changePage.items.filter(c => c.type === 'issue').map(c => c.id), ...activityPayloads.map(a => a.itemId),
  ], ids => prisma.issue.findMany({ where: { AND: [allowed], projectId: project.id, id: { in: ids } }, select: issueSelect }));
  const pageIssueMap = new Map(pageIssues.map(i => [i.id, i]));
  const activityMap = new Map(activityPayloads.map(a => [a.id, a]));
  if (!await activeWorkspace()) throw new SearchError('workspace_access_denied', 'Workspace access was revoked', 403);
  const noteMap = new Map(notePayloads.filter(n => n.authorId === context.user.id || !n.expiresAt || n.expiresAt.getTime() >= Date.now()).map(n => [n.id, n]));
  const response = {
    project: { ...project, name: plain(project.name, 300), description: plain(project.description, 600), updatedAt: project.updatedAt.toISOString(),
      url: `${path}/projects/${encodeURIComponent(project.slug)}` },
    summary: { totalIssues: issues.length, completedIssues: issues.filter(i => i.projectStatus?.isFinal === true).length,
      openIssues: issues.filter(i => i.projectStatus?.isFinal === false).length,
      unknownCompletion: issues.filter(i => !i.projectStatus).length, unassignedIssues: issues.filter(i => !i.assignee).length,
      overdueIssues: issues.filter(i => i.dueDate && i.dueDate < started && i.projectStatus?.isFinal !== true).length },
    statuses: page([...byStatus.values()].sort((a, b) => b.count - a.count || (a.name || '').localeCompare(b.name || ''))),
    owners: page([...owners.values()].sort((a, b) => b.issueCount - a.issueCount || a.id.localeCompare(b.id))),
    blockers: page(blockers), dependencies: page(dependencies), parents: page([...hierarchy.values()]),
    recentChanges: { ...changePage, items: changePage.items.map(c => {
      if (c.type === 'issue') {
        const issue = pageIssueMap.get(c.id);
        return issue ? { ...card(issue), action: 'ISSUE_UPDATED', excerpt: '' } : null;
      }
      const activity = activityMap.get(c.id);
      const parent = activity && pageIssueMap.get(activity.itemId);
      return activity && parent ? { id: activity.id, type: 'activity' as const, issueId: parent.id,
        title: plain(parent.title, 300), action: activity.action,
        excerpt: plain([activity.fieldName, activity.details].filter(Boolean).join(': '), 600), projectId: project.id,
        updatedAt: activity.createdAt.toISOString(), url: `${path}/issues/${encodeURIComponent(parent.id)}` } : null;
    }).filter(item => item !== null) },
    notes: { ...notePage, items: notePage.items.map(candidate => {
      const n = noteMap.get(candidate.id);
      return n ? { id: n.id, type: 'note' as const, noteType: n.type, title: plain(n.title, 300), excerpt: plain(n.content, 600),
        projectId: n.projectId, isAiContext: n.isAiContext, isPinned: n.isPinned, updatedAt: n.updatedAt.toISOString(), url: `${path}/notes/${encodeURIComponent(n.id)}`,
      } : null;
    }).filter(item => item !== null) },
    metadata: { generatedAt: new Date().toISOString(), snapshotStartedAt: started.toISOString(), since: since.toISOString(),
      freshness: 'canonical_database', dependencyDepth: 1, legacyCompletion: 'unknown',
      budget: { maxTokens: options.maxTokens, tokenUpperBound: 0, estimator: 'utf8_bytes', truncated: false, truncatedSections: [] as string[] } },
  };
  const sections = ['recentChanges', 'notes', 'owners', 'statuses', 'dependencies', 'parents', 'blockers'] as const;
  response.metadata.budget.tokenUpperBound = responseBytes(response) + 8;
  while (response.metadata.budget.tokenUpperBound > options.maxTokens) {
    const name = sections.find(section => response[section].items.length > 1);
    if (!name) throw new SearchError('budget_too_small', 'Increase maxTokens to include the summary and one item from each available section', 422);
    const section = response[name];
    const nextIndex = name === 'notes' ? notePage.items.findIndex(n => n.id === response.notes.items.at(-1)!.id)
      : name === 'recentChanges' ? changePage.items.findIndex(c => c.id === response.recentChanges.items.at(-1)!.id && c.type === response.recentChanges.items.at(-1)!.type)
        : section.items.length - 1;
    section.items.pop();
    section.pagination.hasMore = true; section.pagination.nextOffset = options.offset + nextIndex;
    response.metadata.budget.truncated = true;
    if (!response.metadata.budget.truncatedSections.includes(name)) response.metadata.budget.truncatedSections.push(name);
    response.metadata.budget.tokenUpperBound = responseBytes(response) + 8;
  }
  return response;
}

type PromptResponse = {
  systemPrompts: Array<{ title: string; content: string; type: string }>;
  mergedContext: string;
  workspace: { name: string };
  project: { name: string; description: string | null } | null;
  knowledge?: Array<{ title: string; excerpt: string }>;
  metadata: { promptCount: number };
};

// Opt-in bounding keeps old prompt-only callers' format and behavior unchanged.
export function boundPromptContext<T extends PromptResponse>(response: T, maxTokens: number) {
  const originalPromptCount = response.systemPrompts.length, originalKnowledgeCount = response.knowledge?.length || 0;
  const result = { ...response,
    systemPrompts: response.systemPrompts.map(p => ({ ...p, title: p.title.slice(0, 300), content: p.content.slice(0, 1200) })),
    workspace: { ...response.workspace, name: response.workspace.name.slice(0, 300) },
    project: response.project ? { ...response.project, name: response.project.name.slice(0, 300), description: response.project.description?.slice(0, 600) || null } : null,
    ...(response.knowledge && { knowledge: response.knowledge.map(n => ({ ...n, title: n.title.slice(0, 300), excerpt: n.excerpt.slice(0, 500) })) }),
    metadata: { ...response.metadata, originalPromptCount, originalKnowledgeCount,
      budget: { maxTokens, tokenUpperBound: 0, estimator: 'utf8_bytes', truncated:
        response.systemPrompts.some(p => p.content.length > 1200 || p.title.length > 300) || response.workspace.name.length > 300 ||
        !!(response.project && (response.project.name.length > 300 || (response.project.description?.length || 0) > 600)) ||
        !!response.knowledge?.some(n => n.title.length > 300 || n.excerpt.length > 500) } },
  };
  const update = () => {
    result.metadata.promptCount = result.systemPrompts.length;
    result.mergedContext = result.systemPrompts.map(p => `# ${p.type}\n\n## ${p.title}\n\n${p.content}`).join('\n\n---\n\n');
    result.metadata.budget.tokenUpperBound = responseBytes(result) + 8;
  };
  update();
  while (result.metadata.budget.tokenUpperBound > maxTokens) {
    if (result.knowledge?.length) result.knowledge.pop();
    else if (result.systemPrompts.length > 1) result.systemPrompts.pop();
    else throw new SearchError('budget_too_small', 'Increase maxTokens to include at least one context prompt', 422);
    result.metadata.budget.truncated = true; update();
  }
  return result;
}
