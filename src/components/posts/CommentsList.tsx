"use client";

import { useMemo } from "react";
import { Comment } from "@/components/posts/Comment";
import { AddCommentForm } from "@/components/posts/AddCommentForm";
import { organizeCommentsIntoTree } from "@/utils/commentHelpers";
import { useComments } from "@/hooks/queries/useComment";

interface CommentsListProps {
  postId: string;
  comments: any[]; // Add the missing comments property
  initialComments?: any[]; // Optional initial comments for SSR
  currentUserId: string;
}

export default function CommentsList({ postId, comments: passedComments, currentUserId }: CommentsListProps) {
  // Use TanStack Query to fetch comments
  const { data: commentsData, isLoading } = useComments(postId);
  
  // Use server data first, then fall back to initial data, then to passed comments
  const commentsToUse = commentsData ? commentsData.topLevelComments : passedComments || [];
  
  // Create a map of replies by parent ID
  const repliesMap = commentsData?.repliesByParentId || {};
  
  // Process comments to include replies
  const processedComments = commentsToUse.map(comment => {
    if (!comment.parentId) {
      // For top-level comments, attach replies from the map
      return {
        ...comment,
        replies: repliesMap[comment.id] || []
      };
    }
    return comment;
  });
  
  // Use organizeCommentsIntoTree when rendering comments
  const organizedComments = useMemo(() => 
    organizeCommentsIntoTree(processedComments), [processedComments]
  );

  // Handle refresh after a reply is added
  const handleReplyAdded = () => {
    // Nothing needed here as TanStack Query will handle data refresh
  };

  return (
    <>
      {isLoading ? (
        <div className="py-4 text-center text-muted-foreground">
          Loading comments...
        </div>
      ) : organizedComments.length > 0 ? (
        <div className="space-y-4 mb-4">
          {organizedComments.map((comment) => (
            <Comment
              key={comment.id}
              comment={comment}
              postId={postId}
              currentUserId={currentUserId}
              onReplyAdded={handleReplyAdded}
              isReply={false}
            />
          ))}
        </div>
      ) : (
        <div className="py-4 text-center text-muted-foreground">
          No comments yet. Be the first to comment!
        </div>
      )}

      <AddCommentForm postId={postId} />
    </>
  );
} 