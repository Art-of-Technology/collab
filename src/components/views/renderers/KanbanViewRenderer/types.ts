export interface KanbanViewRendererProps {
  view: any;
  issues: any[];
  workspace: any;
  currentUser: any;
  activeFilters?: Record<string, string[]>;
  setActiveFilters?: (filters: Record<string, string[]>) => void;
  onIssueUpdate?: (issueId: string, updates: any) => void;
  onColumnUpdate?: (columnId: string, updates: any) => void;
  onCreateIssue?: (columnId: string, issueData: any) => void;
}



export interface Column {
  id: string;
  name: string;
  issues: any[];
  order: number;
  color?: string;
}

export interface KanbanState {
  columns: Column[];
  showSubIssues: boolean;
}



export interface KanbanColumnProps {
  column: Column;
  index: number;
  groupField: string;
  displayProperties: string[];
  isCreatingIssue: boolean;
  newIssueTitle: string;
  editingColumnId: string | null;
  newColumnName: string;
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
}

export interface KanbanIssueCardProps {
  issue: any;
  index: number;
  displayProperties: string[];
  onClick: (issueId: string) => void;
}



export interface KanbanBoardProps {
  columns: Column[];
  issues: any[];
  displayProperties: string[];
  groupField: string;
  isCreatingIssue: string | null;
  newIssueTitle: string;
  editingColumnId: string | null;
  newColumnName: string;
  onDragEnd: (result: any) => void;
  onDragStart: () => void;
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
}