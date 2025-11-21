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
  // Progress tracking for items with children
  childrenProgress?: {
    completed: number;
    total: number;
    percentage: number;
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
  // Progress data for children
  childrenProgress?: {
    completed: number;
    total: number;
    percentage: number;
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
  mode?: 'modal' | 'page';
}

export interface RelationItemProps {
  item: RelationItem;
  workspaceId: string; // Can be either workspace slug or ID, URL generation handles it
  relationTypeConfig: RelationConfig;
  onRemove?: () => void;
  canRemove?: boolean;
  compact?: boolean;
  mode?: 'modal' | 'page';
}

export interface RelationGroupProps {
  relationType: IssueRelationType;
  relations: RelationItem[];
  workspaceId: string;
  onAddRelation: (type: IssueRelationType) => void;
  onRemoveRelation: (relationId: string, type: IssueRelationType) => void;
  canEdit?: boolean;
  // For inline creation
  showInlineCreator?: boolean;
  onInlineCreate?: (issueId: string, issueKey: string) => void;
  onLinkExisting?: (relations: Array<{ item: RelationItem; relationType: IssueRelationType }>) => Promise<void>;
  parentIssueId?: string;
  parentIssueKey?: string;
  projectId?: string;
  // Progress data for children
  progress?: {
    completed: number;
    total: number;
    percentage: number;
  };
  // Collapsible state
  defaultExpanded?: boolean;
  mode?: 'modal' | 'page';
}

export interface AddRelationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (relations: Array<{ item: RelationItem; relationType: IssueRelationType }>) => Promise<void>;
  relationType: IssueRelationType | null;
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

// Inline creator mode
export type InlineCreatorMode = 'create' | 'link';

// Inline creator props
export interface InlineCreatorProps {
  workspaceId: string;
  projectId?: string;
  parentIssueId?: string;
  parentIssueKey?: string;
  defaultRelationType?: IssueRelationType;
  defaultAssigneeId?: string;
  onIssueCreated?: (issueId: string, issueKey: string) => void;
  onLinkExisting?: (relations: Array<{ item: RelationItem; relationType: IssueRelationType }>) => Promise<void>;
  onCancel?: () => void;
  autoFocus?: boolean;
  className?: string;
}
