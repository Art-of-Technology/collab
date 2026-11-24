import { buildIssueRelations, type RelationItem } from '@/utils/issueRelations';

// A broad issue list sends each issue's own fields and every shared record once.
// The browser expands it into the rows the list route returns for one project.
export const ISSUE_LIST_DATE_FIELDS = [
  'dueDate', 'startDate', 'createdAt', 'updatedAt', 'deletedAt',
  'baselineStartDate', 'baselineDueDate', 'finishedAt', 'firstStartedAt', 'lastProgressAt',
] as const;

// The fields of each issue a broad list sends, in the order of its rows.
// Every listed issue is in the workspace the list was asked for, so workspaceId is sent once.
export const ISSUE_LIST_FIELDS = [
  'id', 'title', 'type', 'statusId', 'statusValue', 'priority', 'storyPoints',
  'parentId', 'milestoneId', 'assigneeId', 'reporterId', 'projectId',
  ...ISSUE_LIST_DATE_FIELDS,
  'deletedById', 'daysInProgress', 'issueKey', 'position', 'progress', 'color', 'postId', 'status',
  'timeEstimateMinutes', 'timeSpentMinutes', 'agentRequestRole', 'labels', '_count',
] as const;

// The fields of each parent, child and related issue that is not listed itself, in the order of its rows.
// A listed issue is sent once, as a listed row; the browser reads these records from it.
export const ISSUE_LIST_HIERARCHY_FIELDS = ['id', 'parentId', 'issueKey', 'title', 'type', 'status', 'projectStatus'] as const;
export const ISSUE_LIST_RELATED_FIELDS = ['id', 'issueKey', 'title', 'type'] as const;
// Each relation between two issues the user can read.
export const ISSUE_LIST_EDGE_FIELDS = ['id', 'relationType', 'sourceIssueId', 'targetIssueId'] as const;

type Row = { id: string };
type RelatedIssue = Row & { issueKey: string | null; title: string; type: string };
type SnapshotIssue = Row & {
  projectId: string;
  statusId: string | null;
  parentId: string | null;
  assigneeId: string | null;
  reporterId: string | null;
  _count: { comments: number; children?: number };
  [field: string]: unknown;
};
type HierarchyIssue = RelatedIssue & { parentId: string | null; [field: string]: unknown };
type Edge = Row & { relationType: string; sourceIssueId: string; targetIssueId: string };
type Status = Row & { name: string; displayName: string | null; color: string | null };

// The snapshot as it was sent before rows were sent as arrays, with field names on every row.
// A browser tab that loaded before that change does not ask for arrays and reads only this.
export type PreviousIssueListSnapshot = {
  issues: SnapshotIssue[]; // newest first; dates are milliseconds since the epoch
  projects: Row[];
  people: Row[];
  statuses: Row[];
  hierarchy: HierarchyIssue[];
  edges: (Row & { relationType: string; sourceIssue: RelatedIssue; targetIssue: RelatedIssue })[];
};

// Sent when the request asks for `rows=arrays`.
export type IssueListSnapshot = {
  workspaceId: string;
  // The names of the values in each kind of row that is sent as an array.
  fields: { issues: string[]; hierarchy: string[]; edges: string[]; related: string[] };
  issues: unknown[][]; // newest first; dates are milliseconds since the epoch
  projects: Row[];
  people: Row[];
  statuses: Row[];
  hierarchy: unknown[][];
  edges: unknown[][];
  related: unknown[][];
};

function group<T>(rows: Map<string, T[]>, key: string, value: T) {
  const list = rows.get(key);
  if (list) list.push(value);
  else rows.set(key, [value]);
}

// JSON leaves out undefined fields, so rows read from JSON never had them.
function withoutUndefined(item: RelationItem) {
  for (const key of Object.keys(item) as (keyof RelationItem)[]) if (item[key] === undefined) delete item[key];
}

function relationsOf(issue: Parameters<typeof buildIssueRelations>[0]) {
  const relations = buildIssueRelations(issue);
  if (relations.parent) withoutUndefined(relations.parent);
  else delete relations.parent;
  for (const key of ['children', 'blocks', 'blocked_by', 'relates_to', 'duplicates', 'duplicated_by'] as const) {
    for (const item of relations[key]) withoutUndefined(item);
  }
  return relations;
}

function records<T>(names: string[], rows: unknown[][]) {
  return rows.map(row => {
    const record: Record<string, unknown> = {};
    for (let index = 0; index < names.length; index++) record[names[index]] = row[index];
    return record as T;
  });
}

// Rebuilds the previous snapshot from the one sent as arrays.
export function previousIssueListSnapshot(snapshot: IssueListSnapshot): PreviousIssueListSnapshot {
  const { workspaceId } = snapshot;
  const statuses = new Map((snapshot.statuses as Status[]).map(row => [row.id, row]));
  const issues = records<SnapshotIssue>(snapshot.fields.issues, snapshot.issues);
  const hierarchy: HierarchyIssue[] = [];
  const related = new Map<string, RelatedIssue>();
  // A listed issue is the parent, child or related issue of others as it is listed.
  for (const issue of issues) {
    issue.workspaceId = workspaceId;
    const { id, issueKey, title, type } = issue as SnapshotIssue & RelatedIssue;
    const status = issue.statusId === null ? undefined : statuses.get(issue.statusId);
    const projectStatus = status ? { id: status.id, name: status.name, displayName: status.displayName, color: status.color } : null;
    hierarchy.push({ id, parentId: issue.parentId, issueKey, title, type, status: issue.status, projectStatus });
    related.set(id, { id, issueKey, title, type });
  }
  hierarchy.push(...records<HierarchyIssue>(snapshot.fields.hierarchy, snapshot.hierarchy));
  for (const issue of records<RelatedIssue>(snapshot.fields.related, snapshot.related)) related.set(issue.id, issue);
  const edges: PreviousIssueListSnapshot['edges'] = [];
  for (const { id, relationType, sourceIssueId, targetIssueId } of records<Edge>(snapshot.fields.edges, snapshot.edges)) {
    const sourceIssue = related.get(sourceIssueId);
    const targetIssue = related.get(targetIssueId);
    if (sourceIssue && targetIssue) edges.push({ id, relationType, sourceIssue, targetIssue });
  }
  const { projects, people } = snapshot;
  return { issues, projects, people, statuses: snapshot.statuses, hierarchy, edges };
}

// Expands either snapshot into the rows the one-project list returns.
export function expandIssueListSnapshot(sent: IssueListSnapshot | PreviousIssueListSnapshot) {
  const snapshot = 'fields' in sent ? previousIssueListSnapshot(sent) : sent;
  const projects = new Map(snapshot.projects.map(row => [row.id, row]));
  const people = new Map(snapshot.people.map(row => [row.id, row]));
  const statuses = new Map(snapshot.statuses.map(row => [row.id, row]));
  const hierarchy = new Map<string, Omit<HierarchyIssue, 'parentId'>>();
  const children = new Map<string, Omit<HierarchyIssue, 'parentId'>[]>();
  const sourceRelations = new Map<string, unknown[]>();
  const targetRelations = new Map<string, unknown[]>();
  const none: never[] = [];

  for (const { parentId, ...issue } of snapshot.hierarchy) {
    hierarchy.set(issue.id, issue);
    if (parentId !== null) group(children, parentId, issue);
  }
  for (const { id, relationType, sourceIssue, targetIssue } of snapshot.edges) {
    group(sourceRelations, sourceIssue.id, { id, relationType, targetIssue });
    group(targetRelations, targetIssue.id, { id, relationType, sourceIssue });
  }

  for (const issue of snapshot.issues) {
    const parent = issue.parentId === null ? null : hierarchy.get(issue.parentId) ?? null;
    const issueChildren = children.get(issue.id) ?? [];
    for (const key of ISSUE_LIST_DATE_FIELDS) {
      const value = issue[key];
      // The same text a Date has in JSON.
      if (typeof value === 'number') issue[key] = new Date(value).toISOString();
    }
    issue.project = projects.get(issue.projectId);
    issue.assignee = issue.assigneeId === null ? null : people.get(issue.assigneeId) ?? null;
    issue.reporter = issue.reporterId === null ? null : people.get(issue.reporterId) ?? null;
    issue.projectStatus = issue.statusId === null ? null : statuses.get(issue.statusId) ?? null;
    issue.parent = parent;
    issue.children = issueChildren;
    issue._count.children = issueChildren.length;
    issue.issueRelations = relationsOf({
      parent,
      children: issueChildren,
      sourceRelations: sourceRelations.get(issue.id) ?? none,
      targetRelations: targetRelations.get(issue.id) ?? none,
    });
  }
  return snapshot.issues;
}

// Read a GET /api/issues body: broad lists arrive as a snapshot, the others as rows.
// A snapshot has no descriptions; read them with `descriptions=1` and withDescriptions.
export function readIssueList<T>(
  body: { issues: T[] } | { snapshot: IssueListSnapshot | PreviousIssueListSnapshot },
): { issues: T[] | SnapshotIssue[]; withoutDescriptions?: true } {
  return 'snapshot' in body
    ? { issues: expandIssueListSnapshot(body.snapshot), withoutDescriptions: true as const }
    : body;
}

export type IssueDescriptions = Record<string, string | null>;

// Adds each listed description to the rows that arrived without one.
export function withDescriptions<T extends { id: string }>(issues: T[], descriptions?: IssueDescriptions) {
  if (!descriptions) return issues;
  return issues.map(issue => 'description' in issue || !Object.hasOwn(descriptions, issue.id)
    ? issue
    : { ...issue, description: descriptions[issue.id] });
}
