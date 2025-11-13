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
    isCreatingIssue,
    newIssueTitle,
    setNewIssueTitle,

    // Computed values
    filteredIssues,
    columns,
    issueCounts,
    displayProperties,
    isLoadingStatuses,
    draggedIssue,
    hoverState,
    operationsInProgress,

    // Handlers
    handleDragStart,
    handleDragUpdate,
    handleDragEnd,
    handleIssueClick,
    handleCreateIssue,
    handleToggleSubIssues,
    handleStartCreatingIssue,
    handleCancelCreatingIssue,
    handleIssueKeyDown
  } = useKanbanState(props);

  return (
    <div className="h-full flex-1 bg-[#101011]">
      {/* Kanban Board Container - Full height scrollable area */}
      <div className="h-full">
        <div className="h-full p-6">
          {isLoadingStatuses && (view.grouping?.field || 'status') === 'status' ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
          ) : (
            <KanbanBoard
              columns={columns}
              issues={issues}
              displayProperties={displayProperties}
              groupField={view.grouping?.field || 'status'}
              isCreatingIssue={isCreatingIssue}
              newIssueTitle={newIssueTitle}
              projects={view.projects || []}
              workspaceId={workspaceId || workspace?.id || ''}
              currentUserId={currentUserId || ''}
              draggedIssue={draggedIssue}
              hoverState={hoverState}
              operationsInProgress={operationsInProgress}
              onDragEnd={handleDragEnd}
              onDragStart={handleDragStart}
              onDragUpdate={handleDragUpdate}
              onIssueClick={handleIssueClick}
              onCreateIssue={handleCreateIssue}
              onStartCreatingIssue={handleStartCreatingIssue}
              onCancelCreatingIssue={handleCancelCreatingIssue}
              onIssueKeyDown={handleIssueKeyDown}
              onIssueInputChange={setNewIssueTitle}
              onIssueCreated={onIssueCreated || (() => { })}
            />
          )}
        </div>
      </div>
    </div>
  );
}