import type { MouseEvent, KeyboardEvent } from 'react';
import type { DragUpdate, DropResult } from '@hello-pangea/dnd';

export interface KanbanViewRendererProps {
  view: any;
  issues: any[];
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
  hoverColumnId?: string;
  index: number;
  groupField: string;
  displayProperties: string[];
  isCreatingIssue: boolean;
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
  operationsInProgress?: Set<string>;
  onIssueClick: (issueId: string, event?: MouseEvent) => void;
  onStartCreatingIssue: (columnId: string) => void;
  onCancelCreatingIssue: () => void;
  onIssueCreated: (issue: any) => void;
}

export interface KanbanIssueCardProps {
  issue: any;
  index: number;
  displayProperties: string[];
  operationsInProgress?: Set<string>;
  onCardClick: (issueId: string, event?: MouseEvent) => void;
}


export interface OverrideDestination {
  droppableId: string;
  index: number;
}

export type KanbanDragUpdate = DragUpdate & {
  overrideColumnId?: string;
};

export type KanbanDropResult = DropResult & {
  overrideDestination?: OverrideDestination;
};



export interface KanbanBoardProps {
  columns: Column[];
  displayProperties: string[];
  groupField: string;
  isCreatingIssue: string | null;
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
  operationsInProgress?: Set<string>;
  onDragEnd: (result: KanbanDropResult) => void;
  onDragStart: (start: any) => void;
  onDragUpdate: (update: KanbanDragUpdate) => void;
  onIssueClick: (issueId: string, event?: MouseEvent) => void;
  onStartCreatingIssue: (columnId: string) => void;
  onCancelCreatingIssue: () => void;
  onIssueCreated: (issue: any) => void;
}