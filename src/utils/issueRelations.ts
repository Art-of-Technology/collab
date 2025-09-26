export type RelationTypeKey =
  | 'parent'
  | 'child'
  | 'blocks'
  | 'blocked_by'
  | 'relates_to'
  | 'duplicates'
  | 'duplicated_by';

export type IssueTypeKey =
  | 'TASK'
  | 'STORY'
  | 'EPIC'
  | 'BUG'
  | 'MILESTONE'
  | 'SUBTASK';

export interface RelationItem {
  id: string;
  issueKey?: string;
  title?: string;
  issueType: IssueTypeKey;
  relationType: RelationTypeKey;
}

export type RelationMap = {
  parent?: RelationItem;
  children: RelationItem[];
  blocks: RelationItem[];
  blocked_by: RelationItem[];
  relates_to: RelationItem[];
  duplicates: RelationItem[];
  duplicated_by: RelationItem[];
};

const DEFAULT_ISSUE_TYPE: IssueTypeKey = 'TASK';

const ISSUE_TYPE_ALIASES: Record<string, IssueTypeKey> = {
  ISSUE: 'TASK',
  DEFECT: 'BUG',
};

const PRISMA_RELATION_TYPE_MAP: Record<string, RelationTypeKey> = {
  PARENT: 'parent',
  CHILD: 'child',
  BLOCKS: 'blocks',
  BLOCKED_BY: 'blocked_by',
  RELATES_TO: 'relates_to',
  DUPLICATES: 'duplicates',
  DUPLICATED_BY: 'duplicated_by',
};

const TARGET_RELATION_INVERSION: Record<RelationTypeKey, RelationTypeKey> = {
  parent: 'child',
  child: 'parent',
  blocks: 'blocked_by',
  blocked_by: 'blocks',
  relates_to: 'relates_to',
  duplicates: 'duplicated_by',
  duplicated_by: 'duplicates',
};

export const RELATION_TYPE_LABELS: Record<RelationTypeKey, string> = {
  parent: 'Parent',
  child: 'Child',
  blocks: 'Blocks',
  blocked_by: 'Blocked by',
  relates_to: 'Related',
  duplicates: 'Duplicates',
  duplicated_by: 'Duplicated by',
};

export const createEmptyRelationMap = (): RelationMap => ({
  parent: undefined,
  children: [],
  blocks: [],
  blocked_by: [],
  relates_to: [],
  duplicates: [],
  duplicated_by: [],
});

const RELATION_PROPERTY_MAP: Record<RelationTypeKey, keyof RelationMap> = {
  parent: 'parent',
  child: 'children',
  blocks: 'blocks',
  blocked_by: 'blocked_by',
  relates_to: 'relates_to',
  duplicates: 'duplicates',
  duplicated_by: 'duplicated_by',
};

const resolveId = (value: unknown): string | undefined => {
  if (value == null) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return undefined;
};

export const mapToIssueTypeKey = (value: unknown): IssueTypeKey => {
  if (!value) {
    return DEFAULT_ISSUE_TYPE;
  }

  const normalized = String(value).trim().toUpperCase();
  if (!normalized) {
    return DEFAULT_ISSUE_TYPE;
  }

  if (normalized in ISSUE_TYPE_ALIASES) {
    return ISSUE_TYPE_ALIASES[normalized];
  }

  if (
    normalized === 'TASK' ||
    normalized === 'STORY' ||
    normalized === 'EPIC' ||
    normalized === 'BUG' ||
    normalized === 'MILESTONE' ||
    normalized === 'SUBTASK'
  ) {
    return normalized as IssueTypeKey;
  }

  return DEFAULT_ISSUE_TYPE;
};

const toRelationItem = (issue: any, relationType: RelationTypeKey): RelationItem | undefined => {
  if (!issue) return undefined;

  const id = resolveId(issue.id ?? issue.dbId);
  if (!id) return undefined;

  const issueKey = issue.issueKey ?? issue.key ?? issue.identifier;
  const title = issue.title ?? issue.name ?? issue.summary;
  const issueTypeSource = issue.issueType ?? issue.type ?? issue.itemType;

  return {
    id,
    issueKey: issueKey ? String(issueKey) : undefined,
    title: title ? String(title) : undefined,
    issueType: mapToIssueTypeKey(issueTypeSource),
    relationType,
  };
};

const pushRelation = (bucket: RelationItem[] | undefined, item: RelationItem | undefined) => {
  if (!bucket || !item) return;
  if (bucket.some(existing => existing.id === item.id)) {
    return;
  }
  bucket.push(item);
};

const applyRelation = (
  map: RelationMap,
  relationType: RelationTypeKey,
  item: RelationItem | undefined,
) => {
  if (!item) return;
  if (relationType === 'parent') {
    map.parent = item;
    return;
  }

  const relationKey = RELATION_PROPERTY_MAP[relationType];
  if (!relationKey || relationKey === 'parent') {
    return;
  }

  const bucket = map[relationKey] as RelationItem[] | undefined;
  pushRelation(bucket, item);
};

export const buildIssueRelations = (issue: any): RelationMap => {
  const relations = createEmptyRelationMap();
  if (!issue) {
    return relations;
  }

  const sourceRelations = Array.isArray(issue.sourceRelations) ? issue.sourceRelations : [];
  sourceRelations.forEach((relation: any) => {
    const relationType = PRISMA_RELATION_TYPE_MAP[String(relation?.relationType ?? '').toUpperCase()];
    if (!relationType) return;

    const relatedIssue = relation?.targetIssue ?? relation?.target;
    const item = toRelationItem(relatedIssue, relationType);
    applyRelation(relations, relationType, item);
  });

  const targetRelations = Array.isArray(issue.targetRelations) ? issue.targetRelations : [];
  targetRelations.forEach((relation: any) => {
    const rawType = PRISMA_RELATION_TYPE_MAP[String(relation?.relationType ?? '').toUpperCase()];
    if (!rawType) return;

    const relationType = TARGET_RELATION_INVERSION[rawType];
    const relatedIssue = relation?.sourceIssue ?? relation?.source;
    const item = toRelationItem(relatedIssue, relationType);
    applyRelation(relations, relationType, item);
  });

  if (issue.parent) {
    applyRelation(relations, 'parent', toRelationItem(issue.parent, 'parent'));
  }

  if (Array.isArray(issue.children)) {
    issue.children.forEach((child: any) => {
      applyRelation(relations, 'child', toRelationItem(child, 'child'));
    });
  }

  return relations;
};

const RELATION_GROUP_MAP: Record<string, RelationTypeKey> = {
  parent: 'parent',
  children: 'child',
  blocks: 'blocks',
  blocked_by: 'blocked_by',
  relates_to: 'relates_to',
  duplicates: 'duplicates',
  duplicated_by: 'duplicated_by',
};

const RELATION_TYPE_SET = new Set<RelationTypeKey>(Object.values(RELATION_GROUP_MAP));

export const isRelationTypeKey = (value?: string): value is RelationTypeKey => {
  return value ? RELATION_TYPE_SET.has(value as RelationTypeKey) : false;
};

export type NormalizedRelation = RelationItem;

const normalizeRelationEntry = (entry: any, fallbackType?: RelationTypeKey): RelationItem | undefined => {
  if (!entry) return undefined;

  const relationTypeValue = typeof entry?.relationType === 'string'
    ? entry.relationType.toLowerCase()
    : undefined;
  const relationType = isRelationTypeKey(relationTypeValue)
    ? relationTypeValue
    : fallbackType ?? 'relates_to';

  const relatedIssue = entry?.targetIssue
    ?? entry?.sourceIssue
    ?? entry?.issue
    ?? entry?.relatedIssue
    ?? entry?.item
    ?? entry?.target
    ?? entry;

  const item = toRelationItem(relatedIssue, relationType);

  if (!item) return undefined;

  if (relationTypeValue && isRelationTypeKey(relationTypeValue) && relationTypeValue !== item.relationType) {
    item.relationType = relationTypeValue;
  }

  const explicitId = resolveId(entry?.dbId ?? entry?.id);
  if (explicitId) {
    item.id = `${item.relationType}-${explicitId}`;
  }

  return item;
};

export const normalizeIssueRelations = (issue: any): NormalizedRelation[] => {
  if (!issue) return [];

  const rawRelations = issue.relations ?? issue.issueRelations ?? null;
  const normalized: NormalizedRelation[] = [];
  const seen = new Set<string>();

  const pushNormalized = (entry: any, fallbackType?: RelationTypeKey) => {
    const item = normalizeRelationEntry(entry, fallbackType);
    if (!item) return;

    const uniqueId = `${item.relationType}-${item.id}`;
    if (seen.has(uniqueId)) return;
    seen.add(uniqueId);

    normalized.push({
      ...item,
      id: uniqueId,
    });
  };

  if (Array.isArray(rawRelations)) {
    rawRelations.forEach((entry: any) => pushNormalized(entry));
  } else if (rawRelations && typeof rawRelations === 'object') {
    Object.entries(RELATION_GROUP_MAP).forEach(([groupKey, relationType]) => {
      const groupValue = (rawRelations as Record<string, any>)[groupKey];
      if (!groupValue) return;

      if (Array.isArray(groupValue)) {
        groupValue.forEach((entry: any) => pushNormalized(entry, relationType));
      } else {
        pushNormalized(groupValue, relationType);
      }
    });
  }

  if (issue.parent) {
    pushNormalized(issue.parent, 'parent');
  }

  if (Array.isArray(issue.children)) {
    issue.children.forEach((child: any) => pushNormalized(child, 'child'));
  }

  return normalized;
};

export const countRelations = (relations: RelationMap): number => {
  if (!relations) return 0;

  return (
    (relations.parent ? 1 : 0) +
    relations.children.length +
    relations.blocks.length +
    relations.blocked_by.length +
    relations.relates_to.length +
    relations.duplicates.length +
    relations.duplicated_by.length
  );
};

export const countRelationsOfType = (relations: RelationMap, relationType: RelationTypeKey): number => {
  if (!relations) return 0;

  const relationKey = RELATION_PROPERTY_MAP[relationType];
  if (relationKey === 'parent') {
    return relations.parent ? 1 : 0;
  }

  const bucket = relations[relationKey] as RelationItem[] | undefined;
  return Array.isArray(bucket) ? bucket.length : 0;
};
