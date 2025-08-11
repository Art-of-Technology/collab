"use client";

import KanbanBoard from './components/KanbanBoard';
import { useKanbanState } from './hooks/useKanbanState';
import type { KanbanViewRendererProps } from './types';

export default function KanbanViewRenderer(props: KanbanViewRendererProps & {
  projectId?: string;
  workspaceId?: string;
  currentUserId?: string;
  onIssueCreated?: (issue: any) => void;
}) {
  const {
    view, 
    issues, 
    workspace,
    projectId,
    workspaceId,
    currentUserId,
    onIssueCreated,
  } = props;

  const {
    // State
    editingColumnId,
    newColumnName,
    setNewColumnName,
    isCreatingIssue,
    newIssueTitle,
    setNewIssueTitle,
    
    // Computed values
    filteredIssues,
    columns,
    issueCounts,
    displayProperties,
    
    // Handlers
    handleDragStart,
    handleDragEnd,
    handleIssueClick,
    handleCreateIssue,
    handleColumnEdit,
    handleToggleSubIssues,
    handleStartCreatingIssue,
    handleCancelCreatingIssue,
    handleIssueKeyDown,
    handleStartEditingColumn,
    handleCancelEditingColumn,
    handleColumnKeyDown
  } = useKanbanState(props);

  return (
    <div className="h-full w-full bg-[#101011] overflow-hidden">
      {/* Kanban Board Container - Full height scrollable area */}
      <div className="h-full overflow-hidden">
        <div className="h-full p-6 overflow-hidden w-full">
          <KanbanBoard
            columns={columns}
            issues={filteredIssues}
            displayProperties={displayProperties}
            groupField={view.grouping?.field || 'status'}
            isCreatingIssue={isCreatingIssue}
            newIssueTitle={newIssueTitle}
            editingColumnId={editingColumnId}
            newColumnName={newColumnName}
            projectId={projectId || view.projects?.[0]?.id || ''}
            workspaceId={workspaceId || workspace?.id || ''}
            currentUserId={currentUserId || ''}
            onDragEnd={handleDragEnd}
            onDragStart={handleDragStart}
            onIssueClick={handleIssueClick}
            onCreateIssue={handleCreateIssue}
            onStartCreatingIssue={handleStartCreatingIssue}
            onCancelCreatingIssue={handleCancelCreatingIssue}
            onIssueKeyDown={handleIssueKeyDown}
            onIssueInputChange={setNewIssueTitle}
            onStartEditingColumn={handleStartEditingColumn}
            onColumnEdit={handleColumnEdit}
            onCancelEditingColumn={handleCancelEditingColumn}
            onColumnKeyDown={handleColumnKeyDown}
            onColumnNameChange={setNewColumnName}
            onIssueCreated={onIssueCreated || (() => {})}
          />
        </div>
      </div>
    </div>
  );
}