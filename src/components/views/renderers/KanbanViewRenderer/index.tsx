"use client";

import { useCallback, useMemo, type MouseEvent } from 'react';
import KanbanBoard from './components/KanbanBoard';
import { useKanbanState } from './hooks/useKanbanState';
import type { KanbanViewRendererProps } from './types';
import { IssueDetailModal } from '@/components/issue/IssueDetailModal';
import { useIssueModalUrlState } from '@/hooks/useIssueModalUrlState';

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
    workspaceId,
    currentUserId,
    onIssueCreated,
  } = props;

  const {
    selectedIssueId,
    setSelectedIssueId,
    closeModal: handleCloseModal
  } = useIssueModalUrlState();

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
    handleStartCreatingIssue,
    handleCancelCreatingIssue
  } = useKanbanState(props);

  // Wrap handleIssueClick to open modal instead of navigating
  const handleIssueClickWithModal = useCallback((issueIdOrKey: string, event?: MouseEvent) => {
    // For Ctrl/Cmd+click, still open in new tab
    if (event && (event.ctrlKey || event.metaKey)) {
      const sampleIssue = issues.find((i) => i.id === issueIdOrKey || i.issueKey === issueIdOrKey) || issues[0];
      const workspaceSegment = (workspace as any)?.slug || (workspace as any)?.id || sampleIssue?.workspaceId || (view as any)?.workspaceId;
      const viewParams = view?.slug ? `?view=${view.slug}&viewName=${encodeURIComponent(view.name)}` : '';
      const url = workspaceSegment
        ? `/${workspaceSegment}/issues/${issueIdOrKey}${viewParams}`
        : `/issues/${issueIdOrKey}${viewParams}`;
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }

    // For normal clicks, open modal
    setSelectedIssueId(issueIdOrKey);
  }, [issues, view, workspace, setSelectedIssueId]);

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#101011]">
      {/* Kanban Board Container - Full height scrollable area */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <div className="h-full p-6 overflow-hidden">
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
              onIssueClick={handleIssueClickWithModal}
              onStartCreatingIssue={handleStartCreatingIssue}
              onCancelCreatingIssue={handleCancelCreatingIssue}
              onIssueCreated={handleIssueCreated}
            />
          )}
        </div>
      </div>

      {/* Issue Detail Modal */}
      <IssueDetailModal
        issueId={selectedIssueId}
        onClose={handleCloseModal}
      />
    </div>
  );
}