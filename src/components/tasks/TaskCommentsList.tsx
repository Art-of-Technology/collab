"use client";

import { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { TaskComment, TaskCommentWithAuthor } from "@/components/tasks/TaskComment";
import { TaskCommentForm } from "@/components/tasks/TaskCommentForm";
import { 
  organizeTaskCommentsIntoTree, 
  initializeTaskLikedCommentsState 
} from "@/utils/taskCommentHelpers";

interface TaskCommentsListProps {
  taskId: string;
  comments: TaskCommentWithAuthor[];
  currentUserId: string;
  userImage?: string | null;
  onRefresh?: () => void;
}

export function TaskCommentsList({ 
  taskId, 
  comments, 
  currentUserId,
  userImage,
  onRefresh 
}: TaskCommentsListProps) {
  const router = useRouter();
  const { toast } = useToast();
  
  // Initialize liked comments state from the comments array
  const [likedComments, setLikedComments] = useState<Record<string, boolean>>(() => 
    initializeTaskLikedCommentsState(comments, currentUserId)
  );

  // Wrap refreshCommentLikes in useCallback to prevent unnecessary re-renders
  const refreshCommentLikes = useCallback(async (commentId: string) => {
    try {
      const response = await fetch(`/api/tasks/${taskId}/comments/${commentId}/like`, {
        method: "GET",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch comment likes");
      }

      const data = await response.json();

      // Check if current user has liked this comment
      const userHasLiked = data.likes && data.likes.some(
        (reaction: any) => reaction.authorId === currentUserId && reaction.type === "LIKE"
      );

      // Update the likedComments state
      setLikedComments(prev => ({
        ...prev,
        [commentId]: !!userHasLiked // Use double negation to ensure boolean type
      }));

      // Always return the likes array (empty or with data)
      return data.likes || [];
    } catch (error) {
      console.error("Failed to refresh comment likes:", error);
      return [];
    }
  }, [taskId, currentUserId]);

  const handleLikeComment = useCallback(async (commentId: string) => {
    try {
      // Make the API request
      const response = await fetch(`/api/tasks/${taskId}/comments/${commentId}/like`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        }
      });

      if (!response.ok) {
        throw new Error("Failed to like comment");
      }

      // Get the response data
      const data = await response.json();

      if (data.comment && data.comment.reactions) {
        // Check if current user has liked this comment based on server response
        const userHasLiked = data.comment.reactions.some(
          (reaction: any) => reaction.authorId === currentUserId && reaction.type === "LIKE"
        );

        // Update the likedComments state with server data
        setLikedComments(prev => ({
          ...prev,
          [commentId]: userHasLiked
        }));

        return true;
      }

      return false;
    } catch (error) {
      console.error("Failed to like comment:", error);

      toast({
        title: "Error",
        description: "Failed to like comment",
        variant: "destructive"
      });

      return false;
    }
  }, [taskId, currentUserId, toast]);

  // Refresh data when a reply is added
  const handleReplyAdded = useCallback(() => {
    // If a specific refresh callback is provided, use it
    if (onRefresh) {
      onRefresh();
    }
    // Otherwise, refresh the page when needed
    else if (router && typeof router.refresh === 'function') {
      router.refresh();
    }
  }, [router, onRefresh]);

  // Use organizeTaskCommentsIntoTree when rendering comments
  const organizedComments = useMemo(() => 
    organizeTaskCommentsIntoTree(comments), [comments]
  );

  return (
    <div className="space-y-4">
      {organizedComments.length > 0 && (
        <div className="space-y-4 mb-4 max-h-[400px] overflow-y-auto pr-2">
          {organizedComments.map((comment) => (
            <TaskComment
              key={`${comment.id}-${likedComments[comment.id] ? 'liked' : 'notliked'}`}
              comment={comment}
              taskId={taskId}
              currentUserId={currentUserId}
              onReplyAdded={handleReplyAdded}
              likedComments={likedComments}
              onLikeComment={handleLikeComment}
              onRefreshLikes={refreshCommentLikes}
            />
          ))}
        </div>
      )}

      <div className="pt-4 mt-4 border-t border-border/30">
        <TaskCommentForm 
          taskId={taskId} 
          currentUserId={currentUserId}
          userImage={userImage}
          onCommentAdded={handleReplyAdded}
        />
      </div>
    </div>
  );
} 