"use client";

import { useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { HeartIcon as HeartIconOutline } from "@heroicons/react/24/outline";
import { HeartIcon as HeartIconSolid } from "@heroicons/react/24/solid";
import type { User } from "@prisma/client";
import CommentReplyForm from "./CommentReplyForm";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { CustomAvatar } from "@/components/ui/custom-avatar";
import { CollabText } from "@/components/ui/collab-text";
import { useCommentReactions, useAddReaction, useRemoveReaction } from "@/hooks/queries/useReaction";

export type CommentWithAuthor = {
  id: string;
  message: string;
  html?: string | null;
  createdAt: Date;
  author: User;
  reactions?: {
    id: string;
    type: string;
    authorId: string;
    author?: {
      id: string;
      name?: string | null;
      image?: string | null;
    };
  }[];
  parentId?: string | null;
  replies?: CommentWithAuthor[];
};

interface CommentProps {
  comment: CommentWithAuthor;
  postId: string;
  currentUserId: string;
  onReplyAdded: () => void;
  isReply?: boolean;
}

export function Comment({
  comment,
  postId,
  currentUserId,
  onReplyAdded,
  isReply = false,
}: CommentProps) {
  const [isReplying, setIsReplying] = useState(false);
  const [showReplies, setShowReplies] = useState(false);
  
  // Use TanStack Query hooks for reactions
  const { data: reactionsData } = useCommentReactions(comment.id);
  const addReactionMutation = useAddReaction();
  const removeReactionMutation = useRemoveReaction();
  
  // Get reactions from query data
  const reactions = reactionsData?.reactions || comment.reactions || [];
  const hasReacted = reactionsData?.hasReacted || false;
  
  // Count likes for this comment
  const likesCount = reactions.length;

  // Function to handle like button click
  const handleLike = async () => {
    try {
      if (hasReacted) {
        // Remove reaction if already liked
        await removeReactionMutation.mutateAsync({
          type: 'LIKE',
          commentId: comment.id
        });
      } else {
        // Add reaction if not liked
        await addReactionMutation.mutateAsync({
          type: 'LIKE',
          commentId: comment.id
        });
      }
    } catch (error) {
      console.error("Error handling like:", error);
    }
  };

  // Toggle function to show/hide replies
  const toggleReplies = () => {
    setShowReplies(prev => !prev);
  };

  // Check if the author has a custom avatar
  const hasCustomAvatar = comment.author && comment.author.useCustomAvatar;

  return (
    <div className={`mb-2 ${isReply ? 'reply-comment' : 'top-level-comment'}`}>
      <div className="flex gap-2 hover:bg-muted/50 p-2 rounded-lg">
        {hasCustomAvatar ? (
          <CustomAvatar user={comment.author} size="sm" />
        ) : (
          <Avatar className="h-7 w-7">
            <AvatarImage src={comment.author.image || undefined} alt={comment.author.name || "User"} />
            <AvatarFallback>
              {comment.author.name?.charAt(0).toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>
        )}
        <div className="flex-1">
          <div className="rounded-lg">
            <div className="flex flex-col">
              <Link
                href={`/profile/${comment.author.id}`}
                className="font-semibold text-sm hover:underline"
              >
                {comment.author.name}
              </Link>
              {comment.html ? (
                <div className="text-sm">
                  <MarkdownContent content={comment.html} />
                </div>
              ) : (
                <CollabText
                  content={comment.message}
                  small
                  asSpan
                />
              )}
            </div>

            <div className="flex gap-4 mt-1 text-xs">
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
              </span>
              {likesCount > 0 && (
                <span className="text-xs text-muted-foreground">
                  {likesCount} {likesCount === 1 ? 'like' : 'likes'}
                </span>
              )}
              <button
                className="text-xs text-muted-foreground hover:text-primary"
                onClick={() => setIsReplying(!isReplying)}
              >
                Reply
              </button>
            </div>
          </div>

          {isReplying && (
            <CommentReplyForm
              postId={postId}
              parentId={comment.id}
              onSuccess={() => {
                setIsReplying(false);
                onReplyAdded();
              }}
              onCancel={() => setIsReplying(false)}
            />
          )}
        </div>

        <button
          className={`flex ml-auto items-center hover:text-primary ${hasReacted ? 'text-red-500' : 'text-muted-foreground'}`}
          onClick={handleLike}
          disabled={addReactionMutation.isPending || removeReactionMutation.isPending}
        >
          {hasReacted ? (
            <HeartIconSolid className="h-3.5 w-3.5" />
          ) : (
            <HeartIconOutline className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {/* Replies section */}
      {comment.replies && comment.replies.length > 0 && (
        <div className="ml-8 mt-1">
          <button
            onClick={toggleReplies}
            className="text-xs text-muted-foreground hover:text-primary mb-1"
          >
            {showReplies ? "Hide replies" : `Show ${comment.replies.length} ${comment.replies.length === 1 ? 'reply' : 'replies'}`}
          </button>
          
          {showReplies && (
            <div className="space-y-2 mt-1">
              {comment.replies.map(reply => (
                <Comment
                  key={reply.id}
                  comment={reply}
                  postId={postId}
                  currentUserId={currentUserId}
                  onReplyAdded={onReplyAdded}
                  isReply={true}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
} 