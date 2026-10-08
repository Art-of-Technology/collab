import { Prisma } from '@prisma/client';
import type { AppAuthContext } from '@/lib/apps/auth-middleware';
import { prisma } from '@/lib/prisma';
import { issueReadAccessWhere, userHasWorkspaceAccess } from '@/lib/issue-finder';
import { noteAccessWhere } from '@/lib/secrets/access';
import { hasScope } from '@/lib/oauth-scopes';
import { stripHtmlToPlainText } from '@/lib/html-sanitizer';
import { documentKey, fuseSearchResults, responseBytes, SearchError, searchTypes, type SearchDocument, type SearchQuery, type SearchType } from './agent-search-query';
import { searchLexical } from './agent-search-lexical';
import { searchVectors } from './agent-search-vectors';

const MAX_SCOPE = 50000;
const PARENT_BATCH_SIZE = 5000;
const secretTypes = ['ENV_VARS', 'API_KEYS', 'CREDENTIALS'] as const;
const dateRange = (query: SearchQuery) => ({ ...(query.after && { gte: new Date(query.after) }), ...(query.before && { lte: new Date(query.before) }) });

export async function searchCorpus(context: AppAuthContext, query: SearchQuery) {
  if (!await userHasWorkspaceAccess(context.user.id, context.workspace.id)) throw new SearchError('workspace_access_denied', 'Active workspace access required', 403);
  const types: SearchType[] = query.type === 'all' ? [...searchTypes] : [query.type];
  for (const type of types) {
    const scope = type === 'note' ? 'context:read' : 'issues:read';
    if (!hasScope(scope, context.token.scopes)) throw new SearchError('insufficient_scope', `Search of ${type} requires ${scope}`, 403);
  }
  if (query.type === 'note' && (query.status || query.assigneeId)) throw new SearchError('invalid_filter', 'status and assigneeId apply to issues and their activity');
  if (query.projectId && !await prisma.project.findFirst({ where: { id: query.projectId, workspaceId: context.workspace.id }, select: { id: true } })) {
    throw new SearchError('project_not_found', 'Project not found or access denied', 404);
  }
  const parentWhere: Prisma.IssueWhereInput = { AND: [issueReadAccessWhere(context.user.id)], workspaceId: context.workspace.id,
    project: { workspaceId: context.workspace.id }, ...(query.projectId && { projectId: query.projectId }),
    ...(query.assigneeId && { assigneeId: query.assigneeId }),
    ...(query.status && { OR: [
      { projectStatus: { OR: [{ id: query.status }, { name: { equals: query.status, mode: 'insensitive' } }] } },
      { projectStatus: null, OR: [{ statusValue: query.status },
        { OR: [{ statusValue: null }, { statusValue: '' }], status: query.status }] },
    ] }) };
  const issueWhere: Prisma.IssueWhereInput = { AND: [parentWhere], updatedAt: dateRange(query) };
  const noteWhere: Prisma.NoteWhereInput = { AND: [
    { OR: [{ workspaceId: context.workspace.id }, { workspaceId: null, project: { workspaceId: context.workspace.id } }] },
    { OR: [{ projectId: null }, { project: { workspaceId: context.workspace.id } }] }],
    scope: { in: ['WORKSPACE', 'PROJECT', 'PUBLIC'] },
    type: { notIn: [...secretTypes] }, isEncrypted: false, updatedAt: dateRange(query), ...(query.projectId && { projectId: query.projectId }) };
  const [issues, notes, activityParents] = await Promise.all([
    types.includes('issue') ? prisma.issue.findMany({ where: issueWhere, select: { id: true, projectId: true, updatedAt: true }, take: MAX_SCOPE + 1, orderBy: { id: 'asc' } }) : [],
    types.includes('note') && !query.status && !query.assigneeId ? prisma.note.findMany({ where: { AND: [noteWhere, noteAccessWhere(context.user.id)] }, select: { id: true, projectId: true, updatedAt: true }, take: MAX_SCOPE + 1, orderBy: { id: 'asc' } }) : [],
    types.includes('activity') ? prisma.issue.findMany({ where: parentWhere, select: { id: true, projectId: true } }) : [],
  ]);
  if (issues.length > MAX_SCOPE || notes.length > MAX_SCOPE) throw new SearchError('scope_too_large', 'Narrow the search with a project filter', 422);
  const issueProjects = new Map(activityParents.map(i => [i.id, i.projectId]));
  const activityWhere: Prisma.IssueActivityWhereInput = { workspaceId: context.workspace.id, itemType: 'ISSUE',
    createdAt: dateRange(query) };
  const activities: Array<{ id: string; itemId: string; projectId: string | null; createdAt: Date }> = [];
  for (let offset = 0; offset < activityParents.length && activities.length <= MAX_SCOPE; offset += PARENT_BATCH_SIZE) {
    const projectIssues = new Map<string, string[]>();
    for (const parent of activityParents.slice(offset, offset + PARENT_BATCH_SIZE)) {
      const ids = projectIssues.get(parent.projectId) || [];
      ids.push(parent.id);
      projectIssues.set(parent.projectId, ids);
    }
    activities.push(...await prisma.issueActivity.findMany({ where: { AND: [activityWhere],
      OR: [...projectIssues].map(([projectId, ids]) => ({ itemId: { in: ids }, OR: [{ projectId }, { projectId: null }] })) },
      select: { id: true, itemId: true, projectId: true, createdAt: true }, take: MAX_SCOPE + 1 - activities.length, orderBy: { id: 'asc' } }));
  }
  const documents: SearchDocument[] = [
    ...issues.map(i => ({ ...i, type: 'issue' as const })),
    ...notes.map(n => ({ ...n, type: 'note' as const })),
    ...activities.map(a => ({ id: a.id, type: 'activity' as const, projectId: issueProjects.get(a.itemId)!, updatedAt: a.createdAt })),
  ];
  if (activities.length > MAX_SCOPE || documents.length > MAX_SCOPE) throw new SearchError('scope_too_large', 'Narrow the search with project, type or date filters', 422);
  return { documents, parentWhere, issueWhere, noteWhere, activityWhere };
}

export type SearchCorpus = Awaited<ReturnType<typeof searchCorpus>>;
export type SearchResult = {
  id: string; type: SearchType; title: string; excerpt: string; url: string; projectId: string | null;
  updatedAt: string; issueKey?: string | null; status?: string | null; assignee?: { id: string; name: string | null } | null;
  issueId?: string; matchType: string; score: number;
};

async function hydrate(context: AppAuthContext, corpus: SearchCorpus, selected: Array<{ id: string; type: SearchType }>) {
  const ids = (type: SearchType) => selected.filter(d => d.type === type).map(d => d.id);
  const [issues, notes, activities] = await Promise.all([
    ids('issue').length ? prisma.issue.findMany({ where: { AND: [corpus.issueWhere], id: { in: ids('issue') } },
      select: { id: true, title: true, description: true, issueKey: true, status: true, statusValue: true, projectId: true, updatedAt: true,
        projectStatus: { select: { name: true } }, assignee: { select: { id: true, name: true } } } }) : [],
    ids('note').length ? prisma.note.findMany({ where: { AND: [corpus.noteWhere, noteAccessWhere(context.user.id)], id: { in: ids('note') } },
      select: { id: true, title: true, content: true, projectId: true, updatedAt: true } }) : [],
    ids('activity').length ? prisma.issueActivity.findMany({ where: { AND: [corpus.activityWhere], id: { in: ids('activity') } },
      select: { id: true, action: true, itemId: true, projectId: true, fieldName: true, details: true, oldValue: true, newValue: true, createdAt: true } }) : [],
  ]);
  // Activities have no Issue FK; recheck the current parent before returning historical content.
  const parents = activities.length ? await prisma.issue.findMany({ where: { AND: [corpus.parentWhere],
    id: { in: activities.map(a => a.itemId) } }, select: { id: true, projectId: true } }) : [];
  const parentProjects = new Map(parents.map(i => [i.id, i.projectId]));
  const path = `/${encodeURIComponent(context.workspace.slug || context.workspace.id)}`;
  const excerpt = (text: string | null) => stripHtmlToPlainText(text || '').slice(0, 1200);
  const results: Array<Omit<SearchResult, 'matchType' | 'score'>> = [
    ...issues.map(i => ({ id: i.id, type: 'issue' as const, title: i.title, excerpt: excerpt(i.description), issueKey: i.issueKey,
      status: i.projectStatus?.name ?? (i.statusValue || i.status), assignee: i.assignee, projectId: i.projectId,
      updatedAt: i.updatedAt.toISOString(), url: `${path}/issues/${encodeURIComponent(i.issueKey || i.id)}` })),
    ...notes.map(n => ({ id: n.id, type: 'note' as const, title: n.title, excerpt: excerpt(n.content), projectId: n.projectId,
      updatedAt: n.updatedAt.toISOString(), url: `${path}/notes/${encodeURIComponent(n.id)}` })),
    ...activities.filter(a => parentProjects.has(a.itemId) && (!a.projectId || parentProjects.get(a.itemId) === a.projectId)).map(a => ({
      id: a.id, type: 'activity' as const, issueId: a.itemId, title: `${a.action}${a.fieldName ? `: ${a.fieldName}` : ''}`,
      excerpt: excerpt([a.details, a.oldValue, a.newValue].filter(Boolean).join('\n')), projectId: parentProjects.get(a.itemId)!,
      updatedAt: a.createdAt.toISOString(), url: `${path}/issues/${encodeURIComponent(a.itemId)}` })),
  ];
  return new Map(results.map(r => [documentKey(r), r]));
}

export async function searchProjectContent(context: AppAuthContext, query: SearchQuery) {
  const started = Date.now(), corpus = await searchCorpus(context, query);
  const useVectors = query.mode === 'hybrid' || query.mode === 'semantic';
  const [lexical, semantic] = await Promise.all([
    searchLexical(query, corpus.documents),
    useVectors ? searchVectors(query.query, corpus.documents) : null,
  ]);
  if (query.mode === 'semantic' && semantic?.coverage.status === 'unavailable') throw new SearchError('semantic_unavailable', `Semantic search unavailable: ${semantic.coverage.reason}. Use keyword or hybrid mode.`, 503);
  const fallback = useVectors && semantic?.coverage.status === 'unavailable';
  const ranked = semantic?.results.length ? fuseSearchResults(query.mode === 'semantic' ? lexical.filter(r => r.exactIdentifier) : lexical, semantic.results) : lexical;
  const selected = ranked.slice(query.offset, query.offset + query.limit);
  const hydrated = await hydrate(context, corpus, selected);
  const indexedDates = new Map(corpus.documents.map(d => [documentKey(d), d.updatedAt.toISOString()]));
  const positions = new Map(selected.map((d, i) => [documentKey(d), query.offset + i + 1]));
  const results = selected.flatMap(r => {
    const current = hydrated.get(documentKey(r));
    if (!current || (['semantic', 'hybrid'].includes(r.matchType) && current.updatedAt !== indexedDates.get(documentKey(r)))) return [];
    return [{ ...current, title: current.title.slice(0, 300), matchType: r.matchType, score: r.score }];
  });
  if (!await userHasWorkspaceAccess(context.user.id, context.workspace.id)) throw new SearchError('workspace_access_denied', 'Workspace access was revoked', 403);
  const next = query.offset + selected.length;
  const response = { query: query.query, requestedMode: query.mode, mode: fallback ? 'keyword' : query.mode, results,
    pagination: { offset: query.offset, nextOffset: next < ranked.length ? next : null, hasMore: next < ranked.length },
    metadata: { generatedAt: new Date().toISOString(), elapsedMs: Date.now() - started,
      searchedTypes: query.type === 'all' ? searchTypes.filter(t => t !== 'note' || (!query.status && !query.assigneeId)) : [query.type],
      vectorCoverage: semantic?.coverage || null, fallback: fallback ? { from: query.mode, to: 'keyword', reason: semantic!.coverage.reason } : null,
      budget: { maxTokens: query.maxTokens, tokenUpperBound: 0, estimator: 'utf8_bytes', truncated: false } } };
  response.metadata.budget.tokenUpperBound = responseBytes(response) + 8;
  while (response.metadata.budget.tokenUpperBound > query.maxTokens && response.results.length) {
    const last = response.results.pop()!;
    response.pagination.nextOffset = positions.get(documentKey(last))! - 1;
    response.pagination.hasMore = true;
    response.metadata.budget.truncated = true;
    response.metadata.budget.tokenUpperBound = responseBytes(response) + 8;
  }
  if (response.metadata.budget.tokenUpperBound > query.maxTokens || (results.length === 0 && hydrated.size > 0 && response.metadata.budget.truncated)) {
    throw new SearchError('budget_too_small', 'Increase maxTokens to include at least one search result', 422);
  }
  return response;
}
