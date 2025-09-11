// Relation types supported in the issue system
export type IssueRelationType = 
  | 'parent'
  | 'child' 
  | 'blocks'
  | 'blocked_by'
  | 'relates_to'
  | 'duplicates'
  | 'duplicated_by';

// Item types that can be related  
export type RelatedItemType = 'issue' | 'epic' | 'story' | 'milestone' | 'task' | 'defect';

// Core relation item structure
export interface RelationItem {
  id: string;
  dbId: string;
  title: string;
  issueKey?: string;
  status?: string;
  priority?: string;
  type: RelatedItemType;
  assignee?: {
    id: string;
    name: string | null;
    image: string | null;
  };
  project?: {
    id: string;
    name: string;
    slug?: string;
    color?: string;
  };
  workspace?: {
    id: string;
    name: string;
    slug: string;
  };
  createdAt: string;
  updatedAt: string;
  dueDate?: string;
  _count?: {
    comments?: number;
    children?: number;
  };
}

// Grouped relations structure
export interface IssueRelations {
  parent?: RelationItem;
  children: RelationItem[];
  blocks: RelationItem[];
  blocked_by: RelationItem[];
  relates_to: RelationItem[];
  duplicates: RelationItem[];
  duplicated_by: RelationItem[];
  workspace?: {
    id: string;
    slug: string;
  };
}

// Configuration for each relation type
export interface RelationConfig {
  type: IssueRelationType;
  label: string;
  description: string;
  icon: string;
  color: string;
  canHaveMultiple: boolean;
  searchPlaceholder: string;
}

// Props interfaces
export interface IssueRelationsSectionProps {
  issue: any;
  workspaceId: string;
  currentUserId?: string;
  onRefresh?: () => void;
}

export interface RelationItemProps {
  item: RelationItem;
  workspaceId: string; // Can be either workspace slug or ID, URL generation handles it
  relationType: IssueRelationType;
  onRemove?: () => void;
  canRemove?: boolean;
  compact?: boolean;
}

export interface RelationGroupProps {
  relationType: IssueRelationType;
  relations: RelationItem[];
  workspaceId: string;
  onAddRelation: (type: IssueRelationType) => void;
  onRemoveRelation: (relationId: string, type: IssueRelationType) => void;
  canEdit?: boolean;
}

export interface AddRelationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (relations: Array<{item: RelationItem; relationType: IssueRelationType}>) => Promise<void>;
  relationType: IssueRelationType;
  workspaceId: string;
  currentIssueId: string;
  excludeIds?: string[];
}

export interface SearchRelationItemProps {
  item: RelationItem;
  isSelected: boolean;
  onToggle: (item: RelationItem) => void;
}

export interface RelationSearchFilters {
  type?: RelatedItemType[];
  status?: string[];
  assignee?: string[];
  project?: string[];
  query?: string;
}
