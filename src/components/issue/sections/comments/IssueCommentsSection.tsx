"use client";

import { useMemo, useCallback } from "react";
import { useCurrentUser } from "@/hooks/queries/useUser";
import type { IssueCommentsSectionProps } from "./types/comment";
import { useIssueComments } from "./hooks/useIssueComments";
import { useAddIssueComment } from "./hooks/useAddIssueComment";
import { organizeCommentsIntoTree } from "./utils/commentHelpers";
import { CommentItem } from "./components/CommentItem";
import { CommentForm } from "./components/CommentForm";
import { EmptyCommentsState } from "./components/EmptyCommentsState";
import { LoadingState } from "./components/LoadingState";

export function IssueCommentsSection({
  issueId,
  initialComments = [],
  currentUserId,
  workspaceId
}: IssueCommentsSectionProps) {
  const { data: currentUser } = useCurrentUser();
  const { data: comments = [], isLoading } = useIssueComments(issueId);
  const addCommentMutation = useAddIssueComment();

  const organizedComments = useMemo(() => {
    const commentsToUse = comments.length > 0 ? comments : initialComments;
    return organizeCommentsIntoTree(commentsToUse);
  }, [comments, initialComments]);

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
    return <LoadingState />;
  }

  return (
    <div className="space-y-3">
      {/* Comments list */}
      {organizedComments.length === 0 ? (
        <EmptyCommentsState />
      ) : (
        <div className="space-y-0.5 max-h-96 overflow-y-auto">
          {organizedComments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              issueId={issueId}
              currentUserId={currentUserId || currentUser?.id}
              onReply={handleReply}
            />
          ))}
        </div>
      )}

      {/* Add new comment */}
      <CommentForm
        onSubmit={handleAddComment}
        isLoading={addCommentMutation.isPending}
        workspaceId={workspaceId}
      />
    </div>
  );
}
