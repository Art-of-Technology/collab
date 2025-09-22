export interface KanbanIssueUser {
  id: string;
  name?: string;
  image?: string;
}

export interface KanbanIssueProject {
  id: string;
  name: string;
  color?: string;
}

export interface KanbanIssueStatus {
  id?: string;
  name?: string;
  displayName?: string;
  color?: string;
}

export interface KanbanIssueLabel {
  id: string;
  name: string;
  color: string;
}

export interface KanbanIssueCount {
  comments?: number;
  children?: number;
}

export interface KanbanIssue {
  id: string;
  issueKey?: string;
  title: string;
  type?: string;
  priority?: string;
  status?: string;
  statusValue?: string;
  description?: string;
  dueDate?: string;
  createdAt?: string;
  updatedAt?: string;
  storyPoints?: number;
  projectStatus?: KanbanIssueStatus;
  assignee?: KanbanIssueUser | null;
  reporter?: KanbanIssueUser | null;
  project?: KanbanIssueProject | null;
  labels?: KanbanIssueLabel[];
  children?: KanbanIssue[];
  subtasks?: KanbanIssue[];
  _count?: KanbanIssueCount;
  [key: string]: unknown;
}

export interface KanbanViewRendererProps {
  view: any;
  issues: KanbanIssue[];
  workspace: any;
  currentUser: any;
  activeFilters?: Record<string, string[]>;
  setActiveFilters?: (filters: Record<string, string[]>) => void;
  onColumnUpdate?: (columnId: string, updates: any) => void;
  onCreateIssue?: (columnId: string, issueData: any) => void;
  onOrderingChange?: (ordering: string) => void;
}


export type FilterType = 'all' | 'active' | 'backlog';

export interface FilterState {
  assignees: string[];
  labels: string[];
  priority: string[];
  projects: string[];
}



export interface Column {
  id: string;
  name: string;
  issues: KanbanIssue[];
  order: number;
  color?: string;
}

export interface KanbanState {
  columns: Column[];
  showSubIssues: boolean;
}



export interface KanbanColumnProps {
  column: Column;
  issues: any[];
  index: number;
  groupField: string;
  displayProperties: string[];
  isCreatingIssue: boolean;
  newIssueTitle: string;
  projects: Array<{
    id: string;
    name: string;
    slug: string;
    issuePrefix: string;
    color?: string;
  }>;
  workspaceId: string;
  currentUserId: string;
  draggedIssue?: any;
  hoverState: { canDrop: boolean, columnId: string };
  onIssueClick: (issueId: string) => void;
  onCreateIssue: (columnId: string) => void;
  onStartCreatingIssue: (columnId: string) => void;
  onCancelCreatingIssue: () => void;
  onIssueKeyDown: (e: React.KeyboardEvent) => void;
  onIssueInputChange: (value: string) => void;
  onStartEditingColumn: (columnId: string, name: string) => void;
  onColumnEdit: (columnId: string, name: string) => void;
  onCancelEditingColumn: () => void;
  onColumnKeyDown: (e: React.KeyboardEvent) => void;
  onColumnNameChange: (value: string) => void;
  onIssueCreated: (issue: KanbanIssue) => void;
}

export interface KanbanIssueCardProps {
  issue: KanbanIssue;
  index: number;
  displayProperties: string[];
  onCardClick: (issueId: string) => void;
}



export interface KanbanBoardProps {
  columns: Column[];
  issues: KanbanIssue[];
  displayProperties: string[];
  groupField: string;
  isCreatingIssue: string | null;
  newIssueTitle: string;
  projects: Array<{
    id: string;
    name: string;
    slug: string;
    issuePrefix: string;
    color?: string;
  }>;
  workspaceId: string;
  currentUserId: string;
  draggedIssue?: any;
  hoverState: { canDrop: boolean, columnId: string };
  onDragEnd: (result: any) => void;
  onDragStart: (start: any) => void;
  onDragUpdate: (update: any) => void;
  onIssueClick: (issueId: string) => void;
  onCreateIssue: (columnId: string) => void;
  onStartCreatingIssue: (columnId: string) => void;
  onCancelCreatingIssue: () => void;
  onIssueKeyDown: (e: React.KeyboardEvent) => void;
  onIssueInputChange: (value: string) => void;
  onStartEditingColumn: (columnId: string, name: string) => void;
  onColumnEdit: (columnId: string, name: string) => void;
  onCancelEditingColumn: () => void;
  onColumnKeyDown: (e: React.KeyboardEvent) => void;
  onColumnNameChange: (value: string) => void;
  onIssueCreated: (issue: KanbanIssue) => void;
}