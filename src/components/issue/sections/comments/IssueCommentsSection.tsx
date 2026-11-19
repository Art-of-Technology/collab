"use client";

import { useMemo, useCallback } from "react";
import { useCurrentUser } from "@/hooks/queries/useUser";
import type { IssueCommentsSectionProps } from "./types/comment";
import { useIssueComments, useAddIssueComment } from "@/hooks/queries/useIssueComment";
import { organizeCommentsIntoTree } from "./utils/commentHelpers";
import { CommentItem } from "./components/CommentItem";
import { CommentForm } from "./components/CommentForm";
import { EmptyCommentsState } from "./components/EmptyCommentsState";
import { useCommentArrivalFeedback } from "./hooks/useCommentArrivalFeedback";
import { CommentsSkeleton } from "./components/CommentsSkeleton";

export function IssueCommentsSection({
  issueId,
  initialComments = [],
  currentUserId,
  workspaceId,
  autofocus = false
}: IssueCommentsSectionProps) {
  const { data: currentUser } = useCurrentUser();
  const { data: comments = [], isLoading, isError, refetch, isFetching, isFetchedAfterMount, isSuccess } = useIssueComments(issueId, initialComments, workspaceId);
  const addCommentMutation = useAddIssueComment();
  const { containerRef, highlightedIds } = useCommentArrivalFeedback(
    issueId, comments, isFetchedAfterMount && isSuccess && !isFetching, currentUserId || currentUser?.id
  );

  const organizedComments = useMemo(() => {
    return organizeCommentsIntoTree(comments);
  }, [comments]);

  const handleAddComment = useCallback(async (content: string) => {
    await addCommentMutation.mutateAsync({
      issueId,
      content,
    });
  }, [issueId, addCommentMutation]);

  const handleReply = useCallback((parentId: string) => {
    console.log("Reply to comment:", parentId);
  }, []);

  if (isLoading) {
    return <CommentsSkeleton />;
  }

  return (
    <div ref={containerRef} className="space-y-3">
      {isError && (
        <div role="alert" className="text-sm text-muted-foreground">
          Could not load the latest comments.{' '}
          <button type="button" className="underline" disabled={isFetching} onClick={() => void refetch()}>
            Try again
          </button>
        </div>
      )}
      {/* Comments list */}
      {organizedComments.length === 0 ? (
        isError ? null : <EmptyCommentsState />
      ) : (
        <div className="space-y-0.5">
          {organizedComments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              issueId={issueId}
              currentUserId={currentUserId || currentUser?.id}
              onReply={handleReply}
              highlightedIds={highlightedIds}
            />
          ))}
        </div>
      )}

      {/* Add new comment */}
      <CommentForm
        onSubmit={handleAddComment}
        isLoading={addCommentMutation.isPending}
        workspaceId={workspaceId}
        autofocus={autofocus}
      />
    </div>
  );
}
