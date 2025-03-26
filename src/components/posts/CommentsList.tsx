"use client";

import { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { Comment, CommentWithAuthor } from "@/components/posts/Comment";
import { AddCommentForm } from "@/components/posts/AddCommentForm";
import { organizeCommentsIntoTree, initializeLikedCommentsState } from "@/utils/commentHelpers";

interface CommentsListProps {
  postId: string;
  comments: CommentWithAuthor[];
  currentUserId: string;
}

export default function CommentsList({ postId, comments, currentUserId }: CommentsListProps) {
  const router = useRouter();
  const { toast } = useToast();
  
  // Initialize liked comments state from the comments array
  const [likedComments, setLikedComments] = useState<Record<string, boolean>>(() => 
    initializeLikedCommentsState(comments, currentUserId)
  );

  // Wrap refreshCommentLikes in useCallback to prevent unnecessary re-renders
  const refreshCommentLikes = useCallback(async (commentId: string) => {
    try {
      const response = await fetch(`/api/posts/${postId}/comments/${commentId}/like`, {
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
  }, [postId, currentUserId]);

  const handleLikeComment = useCallback(async (commentId: string) => {
    try {
      // Make the API request
      const response = await fetch(`/api/posts/${postId}/comments/${commentId}/like`, {
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
  }, [postId, currentUserId, toast]);

  // Refresh data when a reply is added
  const handleReplyAdded = useCallback(() => {
    // Only refresh the page when needed
    if (router && typeof router.refresh === 'function') {
      router.refresh();
    }
  }, [router]);

  // Use organizeCommentsIntoTree when rendering comments
  const organizedComments = useMemo(() => 
    organizeCommentsIntoTree(comments), [comments]
  );

  return (
    <>
      {organizedComments.length > 0 && (
        <div className="space-y-4 mb-4">
          {organizedComments.map((comment) => (
            <Comment
              key={`${comment.id}-${likedComments[comment.id] ? 'liked' : 'notliked'}`}
              comment={comment}
              postId={postId}
              currentUserId={currentUserId}
              onReplyAdded={handleReplyAdded}
              likedComments={likedComments}
              onLikeComment={handleLikeComment}
              onRefreshLikes={refreshCommentLikes}
            />
          ))}
        </div>
      )}

      <AddCommentForm 
        postId={postId} 
        currentUserId={currentUserId} 
      />
    </>
  );
} 