"use client";

import { IssueDetailModal } from '@/components/issue/IssueDetailModal';
import KanbanBoard from './components/KanbanBoard';
import { useKanbanState } from './hooks/useKanbanState';
import type { KanbanViewRendererProps } from './types';

export default function KanbanViewRenderer(props: KanbanViewRendererProps) {
  const {
    view, 
    issues, 
    workspace,
  } = props;

  const {
    // State
    kanbanState,
    selectedIssueId,
    setSelectedIssueId,
    editingColumnId,
    newColumnName,
    setNewColumnName,
    isCreatingIssue,
    newIssueTitle,
    setNewIssueTitle,
    
    // Computed values
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
            issues={issues}
            displayProperties={displayProperties}
            groupField={view.grouping?.field || 'status'}
            isCreatingIssue={isCreatingIssue}
            newIssueTitle={newIssueTitle}
            editingColumnId={editingColumnId}
            newColumnName={newColumnName}
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
          />
        </div>
      </div>

      {/* Issue Detail Modal */}
      {selectedIssueId && (
        <IssueDetailModal
          issueId={selectedIssueId}
          onClose={() => setSelectedIssueId(null)}
        />
      )}
    </div>
  );
}