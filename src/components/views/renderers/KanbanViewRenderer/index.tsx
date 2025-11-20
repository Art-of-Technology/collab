"use client";

import { useCallback, useMemo } from 'react';
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
    workspace,
    workspaceId,
    currentUserId,
    onIssueCreated,
  } = props;

  const groupField = useMemo(() => view.grouping?.field || 'status', [view.grouping?.field]);
  const projects = useMemo(() => view.projects ?? [], [view.projects]);
  const resolvedWorkspaceId = useMemo(() => workspaceId || workspace?.id || '', [workspaceId, workspace]);
  const resolvedCurrentUserId = currentUserId || '';
  const handleIssueCreated = useCallback((issue: any) => {
    onIssueCreated?.(issue);
  }, [onIssueCreated]);

  const {
    // State
    isCreatingIssue,

    // Computed values
    columns,
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
    handleStartCreatingIssue,
    handleCancelCreatingIssue
  } = useKanbanState(props);

  return (
    <div className="h-full flex-1 bg-[#101011]">
      {/* Kanban Board Container - Full height scrollable area */}
      <div className="h-full">
        <div className="h-full p-6">
          {isLoadingStatuses && groupField === 'status' ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
          ) : (
            <KanbanBoard
              columns={columns}
              displayProperties={displayProperties}
              groupField={groupField}
              isCreatingIssue={isCreatingIssue}
              projects={projects}
              workspaceId={resolvedWorkspaceId}
              currentUserId={resolvedCurrentUserId}
              draggedIssue={draggedIssue}
              hoverState={hoverState}
              operationsInProgress={operationsInProgress}
              onDragEnd={handleDragEnd}
              onDragStart={handleDragStart}
              onDragUpdate={handleDragUpdate}
              onIssueClick={handleIssueClick}
              onStartCreatingIssue={handleStartCreatingIssue}
              onCancelCreatingIssue={handleCancelCreatingIssue}
              onIssueCreated={handleIssueCreated}
            />
          )}
        </div>
      </div>
    </div>
  );
}