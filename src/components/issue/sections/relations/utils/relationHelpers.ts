import type { RelationItem, IssueRelations, IssueRelationType } from "../types/relation";

/**
 * Organize relations from API response into structured format
 */
export function organizeRelationsData(relations: any[]): IssueRelations {
  const organized: IssueRelations = {
    parent: undefined,
    children: [],
    blocks: [],
    blocked_by: [],
    relates_to: [],
    duplicates: [],
    duplicated_by: []
  };

  relations.forEach(relation => {
    const relationType = relation.relationType as IssueRelationType;
    const item: RelationItem = {
      id: relation.relatedItem.id,
      title: relation.relatedItem.title,
      issueKey: relation.relatedItem.issueKey,
      status: relation.relatedItem.status,
      priority: relation.relatedItem.priority,
      type: relation.relatedItem.type || 'issue',
      assignee: relation.relatedItem.assignee,
      project: relation.relatedItem.project,
      createdAt: relation.relatedItem.createdAt,
      updatedAt: relation.relatedItem.updatedAt,
      dueDate: relation.relatedItem.dueDate,
      _count: relation.relatedItem._count
    };

    if (relationType === 'parent') {
      organized.parent = item;
    } else {
      organized[relationType].push(item);
    }
  });

  return organized;
}

/**
 * Check if relations data has any relations
 */
export function hasAnyRelations(relations: IssueRelations): boolean {
  return !!(
    relations.parent ||
    relations.children.length > 0 ||
    relations.blocks.length > 0 ||
    relations.blocked_by.length > 0 ||
    relations.relates_to.length > 0 ||
    relations.duplicates.length > 0 ||
    relations.duplicated_by.length > 0
  );
}

/**
 * Get total count of all relations
 */
export function getTotalRelationsCount(relations: IssueRelations): number {
  return (
    (relations.parent ? 1 : 0) +
    relations.children.length +
    relations.blocks.length +
    relations.blocked_by.length +
    relations.relates_to.length +
    relations.duplicates.length +
    relations.duplicated_by.length
  );
}

/**
 * Get badge styling for item types
 */
export function getItemTypeBadgeStyle(type: string) {
  switch (type) {
    case 'issue':
      return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    case 'epic':
      return "bg-purple-500/20 text-purple-400 border-purple-500/30";
    case 'story':
      return "bg-green-500/20 text-green-400 border-green-500/30";
    case 'task':
      return "bg-orange-500/20 text-orange-400 border-orange-500/30";
    case 'milestone':
      return "bg-indigo-500/20 text-indigo-400 border-indigo-500/30";
    default:
      return "bg-gray-500/20 text-gray-400 border-gray-500/30";
  }
}

/**
 * Get status badge styling
 */
export function getStatusBadgeStyle(status?: string): string {
  if (!status) return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  
  const statusColors: Record<string, string> = {
    'DONE': 'bg-green-500/20 text-green-400 border-green-500/30',
    'COMPLETED': 'bg-green-500/20 text-green-400 border-green-500/30',
    'IN_PROGRESS': 'bg-blue-500/20 text-blue-400 border-blue-500/30', 
    'IN PROGRESS': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    'TODO': 'bg-gray-500/20 text-gray-400 border-gray-500/30',
    'BACKLOG': 'bg-gray-500/20 text-gray-400 border-gray-500/30',
    'BLOCKED': 'bg-red-500/20 text-red-400 border-red-500/30',
    'REVIEW': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    'TESTING': 'bg-purple-500/20 text-purple-400 border-purple-500/30'
  };
  
  return statusColors[status.toUpperCase()] || 'bg-gray-500/20 text-gray-400 border-gray-500/30';
}

/**
 * Get priority badge styling
 */
export function getPriorityBadgeStyle(priority?: string): string {
  if (!priority) return '';
  
  const priorityColors: Record<string, string> = {
    'URGENT': 'bg-red-500/20 text-red-400 border-red-500/30',
    'HIGH': 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    'MEDIUM': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    'LOW': 'bg-green-500/20 text-green-400 border-green-500/30'
  };
  
  return priorityColors[priority.toUpperCase()] || 'bg-gray-500/20 text-gray-400 border-gray-500/30';
}

/**
 * Format relation type for display
 */
export function formatRelationTypeLabel(type: IssueRelationType): string {
  const labels: Record<IssueRelationType, string> = {
    parent: 'Parent',
    child: 'Sub-issues',
    blocks: 'Blocks',
    blocked_by: 'Blocked by',
    relates_to: 'Related',
    duplicates: 'Duplicates',
    duplicated_by: 'Duplicated by'
  };
  
  return labels[type] || type;
}
