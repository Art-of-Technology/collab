"use client";

import { useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { HeartIcon as HeartIconOutline } from "@heroicons/react/24/outline";
import { HeartIcon as HeartIconSolid } from "@heroicons/react/24/solid";
import { PencilIcon, TrashIcon, XMarkIcon, CheckIcon } from "@heroicons/react/24/outline";
import type { User } from "@prisma/client";
import CommentReplyForm from "./CommentReplyForm";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { CustomAvatar } from "@/components/ui/custom-avatar";
import { CollabText } from "@/components/ui/collab-text";
import { CollabInput } from "@/components/ui/collab-input";
import { useCommentReactions, useAddReaction, useRemoveReaction } from "@/hooks/queries/useReaction";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useUpdateComment, useDeleteComment } from "@/hooks/queries/useComment";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

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
  const [isEditing, setIsEditing] = useState(false);
  const [editedMessage, setEditedMessage] = useState(comment.message);
  const [editedHtml, setEditedHtml] = useState(comment.html || "");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const { currentWorkspace } = useWorkspace();
  const { toast } = useToast();

  // Use TanStack Query hooks for reactions
  const { data: reactionsData } = useCommentReactions(comment.id);
  const addReactionMutation = useAddReaction();
  const removeReactionMutation = useRemoveReaction();

  // Use TanStack Query hooks for comment operations
  const updateCommentMutation = useUpdateComment(comment.id, postId);
  const deleteCommentMutation = useDeleteComment(postId);

  // Get reactions from query data
  const reactions = reactionsData?.reactions || comment.reactions || [];
  const hasReacted = reactionsData?.hasReacted || false;

  // Count likes for this comment
  const likesCount = reactions.length;

  // Check if current user is the author
  const isAuthor = currentUserId === comment.author.id;

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

  // Handle edit comment
  const handleEditComment = async () => {
    if (!editedMessage.trim()) {
      toast({
        title: "Error",
        description: "Comment cannot be empty",
        variant: "destructive"
      });
      return;
    }

    try {
      await updateCommentMutation.mutateAsync({
        message: editedMessage,
        html: "" // Clear HTML to force regeneration from the edited message
      });
      setIsEditing(false);
      toast({
        description: "Comment updated"
      });
    } catch (error) {
      console.error("Error updating comment:", error);
      toast({
        title: "Error",
        description: "Failed to update comment",
        variant: "destructive"
      });
    }
  };

  // Handle delete comment
  const handleDeleteComment = async () => {
    try {
      await deleteCommentMutation.mutateAsync(comment.id);
      toast({
        description: "Comment deleted"
      });
    } catch (error) {
      console.error("Error deleting comment:", error);
      toast({
        title: "Error",
        description: "Failed to delete comment",
        variant: "destructive"
      });
    }
  };

  // Handle cancel edit
  const handleCancelEdit = () => {
    setEditedMessage(comment.message);
    setEditedHtml(comment.html || "");
    setIsEditing(false);
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
              <div className="flex items-center justify-between">
                <Link
                  href={currentWorkspace ? `/${currentWorkspace.id}/profile/${comment.author.id}` : `#`}
                  className="font-semibold text-sm hover:underline"
                >
                  {comment.author.name}
                </Link>
              </div>

              {isEditing ? (
                <div className="mt-2">
                  <CollabInput
                    value={editedMessage}
                    onChange={setEditedMessage}
                    placeholder="Edit your comment..."
                    minHeight="60px"
                    maxHeight="200px"
                    disabled={updateCommentMutation.isPending}
                  />
                  <div className="flex gap-2 mt-2">
                    <Button
                      size="sm"
                      onClick={handleEditComment}
                      disabled={updateCommentMutation.isPending || !editedMessage.trim()}
                    >
                      <CheckIcon className="h-3.5 w-3.5 mr-1" />
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleCancelEdit}
                      disabled={updateCommentMutation.isPending}
                    >
                      <XMarkIcon className="h-3.5 w-3.5 mr-1" />
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  {comment.html ? (
                    <div className="text-sm">
                      <MarkdownContent content={comment.html} htmlContent={comment.html} />
                    </div>
                  ) : (
                    <CollabText
                      content={comment.message}
                      small
                      asSpan
                    />
                  )}
                </>
              )}
            </div>

            {!isEditing && (
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
            )}
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


        {isAuthor && !isEditing && (
          <div className="flex gap-1">
            <button
              onClick={() => setIsEditing(true)}
              className="p-1 rounded text-muted-foreground hover:text-primary"
              title="Edit comment"
            >
              <PencilIcon className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setShowDeleteDialog(true)}
              className="p-1 rounded text-muted-foreground hover:text-red-500"
              title="Delete comment"
            >
              <TrashIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {!isAuthor && (
          <button
            className={`flex ml-auto items-center hover:text-red-500 ${hasReacted ? 'text-red-500 ' : 'text-muted-foreground'}`}
            onClick={handleLike}
            disabled={addReactionMutation.isPending || removeReactionMutation.isPending}
          >
            {hasReacted ? (
              <HeartIconSolid className="h-3.5 w-3.5" />
            ) : (
              <HeartIconOutline className="h-3.5 w-3.5" />
            )}
          </button>
        )}
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

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Comment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this comment? This action cannot be undone.
              {comment.replies && comment.replies.length > 0 && (
                <span className="block mt-2 font-semibold">
                  This will also delete {comment.replies.length} {comment.replies.length === 1 ? 'reply' : 'replies'}.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteComment}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
} 