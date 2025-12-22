"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { IssueDetailContent } from "./IssueDetailContent";
import { IssueDetailSkeleton } from "./IssueDetailSkeleton";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useIssue } from "@/hooks/queries/useIssues";
import type { IssueModalProps } from "@/types/issue";
import { useIssueModalUrlState } from "@/hooks/useIssueModalUrlState";

export function IssueDetailModal({ issueId, onClose }: IssueModalProps) {
  const { currentWorkspace } = useWorkspace();
  const { parentIssueInfo } = useIssueModalUrlState();

  // Use React Query to fetch issue data with workspace context
  // This ensures we get the correct issue when the same prefix exists in multiple workspaces
  const { data: issueData, isLoading, error: queryError } = useIssue(issueId || "", currentWorkspace?.id);

  const issue = issueData?.issue || issueData;
  const error = queryError instanceof Error ? queryError.message : queryError ? "Failed to load issue" : null;

  // No-op refresh handler - React Query handles updates automatically
  const handleRefresh = () => {
    // React Query will automatically refetch when queries are invalidated
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      onClose();
    }
  };

  const handleOpenExternal = () => {
    if (!issue?.issueKey) return;

    const url = currentWorkspace?.slug
      ? `/${currentWorkspace.slug}/issues/${issue.issueKey}`
      : `/issues/${issue.issueKey}`;

    window.open(url, '_blank');
  };

  if (!issueId) return null;

  return (
    <Dialog open={true} onOpenChange={handleOpenChange}>
      <DialogContent
        onEscapeKeyDown={(e) => e.preventDefault()}
        className={`
        max-w-[95vw] md:max-w-[90vw] lg:max-w-[85vw] xl:max-w-[80vw]
        max-h-[95vh] min-h-[600px] h-full bg-[#0a0a0a]
        border-[#1f1f1f]
        overflow-hidden flex flex-col
        p-0
      `}>
        <DialogHeader className="sr-only">
          <DialogTitle>
            {issue ? `${issue.issueKey} - ${issue.title}` : "Issue Details"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 h-full bg-[#0a0a0a]">
          {isLoading && !issue ? (
            <IssueDetailSkeleton />
          ) : (
            <IssueDetailContent
              issue={issue}
              error={error}
              isLoading={isLoading}
              onRefresh={handleRefresh}
              onClose={onClose}
              boardId={issue?.project?.id}
              mode="modal"
              workspaceId={currentWorkspace?.slug || currentWorkspace?.id}
              issueId={issueId}
              parentIssueInfo={parentIssueInfo}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
} 