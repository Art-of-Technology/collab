import { buildIssueRelations, type RelationItem } from '@/utils/issueRelations';

// A broad issue list sends each issue's own fields and every shared record once.
// The browser expands it into the rows the list route returns for one project.
export const ISSUE_LIST_DATE_FIELDS = [
  'dueDate', 'startDate', 'createdAt', 'updatedAt', 'deletedAt',
  'baselineStartDate', 'baselineDueDate', 'finishedAt', 'firstStartedAt', 'lastProgressAt',
] as const;

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

export type IssueListSnapshot = {
  issues: SnapshotIssue[]; // newest first; dates are milliseconds since the epoch
  projects: Row[];
  people: Row[];
  statuses: Row[];
  hierarchy: HierarchyIssue[];
  edges: (Row & { relationType: string; sourceIssue: RelatedIssue; targetIssue: RelatedIssue })[];
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

// Expands the snapshot in place into the rows the one-project list returns.
export function expandIssueListSnapshot(snapshot: IssueListSnapshot) {
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
  body: { issues: T[] } | { snapshot: IssueListSnapshot },
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
