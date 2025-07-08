"use client";

import { useState, useEffect } from "react";
import { formatDistanceToNow } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { HeartIcon as HeartIconOutline } from "@heroicons/react/24/outline";
import { HeartIcon as HeartIconSolid } from "@heroicons/react/24/solid";
import { AnimatePresence, motion } from "framer-motion";
import { MarkdownContent } from "@/components/ui/markdown-content";
import Link from "next/link";
import { CustomAvatar } from "@/components/ui/custom-avatar";
import { useWorkspace } from "@/context/WorkspaceContext";
import { UnifiedItemType } from "@/hooks/queries/useUnifiedComments";
import { UnifiedCommentReplyForm } from "./unified-comment-reply-form";
import { useTaskCommentLikes, useToggleTaskCommentLike, useUpdateTaskComment } from "@/hooks/queries/useTaskComment";
import { Button } from "@/components/ui/button";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { useToast } from "@/hooks/use-toast";
import { EllipsisHorizontalIcon, PencilSquareIcon } from "@heroicons/react/24/outline";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

export type UnifiedCommentAuthor = {
  id: string;
  name: string | null;
  image: string | null;
  useCustomAvatar?: boolean;
  avatarSkinTone?: number | null;
  avatarEyes?: number | null;
  avatarBrows?: number | null;
  avatarMouth?: number | null;
  avatarNose?: number | null;
  avatarHair?: number | null;
  avatarEyewear?: number | null;
  avatarAccessory?: number | null;
};

export type UnifiedCommentData = {
  id: string;
  content?: string;
  message?: string; // For non-task comments
  html?: string | null;
  createdAt: Date;
  updatedAt?: Date;
  author: UnifiedCommentAuthor;
  reactions?: {
    id: string;
    type: string;
    authorId: string;
    author?: {
      id: string;
      name?: string | null;
      image?: string | null;
      useCustomAvatar?: boolean;
    };
  }[];
  parentId?: string | null;
  replies?: UnifiedCommentData[];
};

interface UnifiedCommentProps {
  comment: UnifiedCommentData;
  itemType: UnifiedItemType;
  itemId: string;
  currentUserId: string;
  isReply?: boolean;
}

export function UnifiedComment({
  comment,
  itemType,
  itemId,
  currentUserId,
  isReply = false,
}: UnifiedCommentProps) {
  const [isReplying, setIsReplying] = useState(false);
  const [showReplies, setShowReplies] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content || comment.message || "");
  const [localCommentContent, setLocalCommentContent] = useState(comment.content || comment.message || "");
  const [localCommentHtml, setLocalCommentHtml] = useState(comment.html || "");
  const { currentWorkspace } = useWorkspace();
  const { toast } = useToast();

  // Sync local state with props when they change
  useEffect(() => {
    setLocalCommentContent(comment.content || comment.message || "");
    setLocalCommentHtml(comment.html || "");
    setEditContent(comment.content || comment.message || "");
  }, [comment.content, comment.message, comment.html]);

  // For debugging - check if author is missing
  if (!comment.author) {
    console.error("Comment is missing author data:", comment);
  }

  // Provide fallback values for missing authors
  const author = comment.author || {
    id: "unknown",
    name: "Unknown User",
    image: null,
    useCustomAvatar: false
  };

  // Get the comment content (handle both TaskComment.content and Comment.message)
  const commentContent = localCommentContent || comment.content || comment.message || "";

  // Use TanStack Query to get likes data (only for tasks for now)
  const { data: likesData } = useTaskCommentLikes(itemId, comment.id);
  const toggleLikeMutation = useToggleTaskCommentLike();
  const updateCommentMutation = useUpdateTaskComment();

  // Extract like information
  const isLiked = likesData?.isLiked || false;
  const likes = likesData?.likes || [];
  const likesCount = likes.length;

  // Function to handle like button click (only for tasks)
  const handleLike = async () => {
    if (itemType === 'task') {
      toggleLikeMutation.mutate({ taskId: itemId, commentId: comment.id });
    }
  };

  // Function to handle edit submission
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editContent.trim()) {
      toast({
        title: "Error",
        description: "Comment cannot be empty",
        variant: "destructive",
      });
      return;
    }
    try {
      if (itemType === 'task') {
        await updateCommentMutation.mutateAsync({ 
          taskId: itemId, 
          commentId: comment.id, 
          content: editContent 
        });
        toast({
          title: "Success",
          description: "Comment updated successfully",
        });
        setIsEditing(false);
        // Update local state immediately for UI responsiveness
        setLocalCommentContent(editContent);
        setLocalCommentHtml(editContent);
      } else {
        toast({
          title: "Info",
          description: "Edit functionality for non-task comments coming soon",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update comment",
        variant: "destructive",
      });
    }
  };

  // Toggle function to show/hide replies
  const toggleReplies = () => {
    setShowReplies(prev => !prev);
  };

  return (
    <div className={`mb-2 ${isReply ? 'reply-comment' : 'top-level-comment'}`}>
      <div className="flex gap-2 hover:bg-muted/50 p-2 rounded-lg">
        {author.useCustomAvatar ? (
          <CustomAvatar user={author} size="sm" />
        ) : (
          <Avatar className="h-7 w-7">
            <AvatarImage src={author.image || undefined} alt={author.name || "User"} />
            <AvatarFallback>
              {author.name?.charAt(0).toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>
        )}
        <div className="flex-1">
          <div className="rounded-lg">
            <div className="flex flex-col">
              <Link
                href={currentWorkspace ? `/${currentWorkspace.id}/profile/${author.id}` : `#`}
                className="font-semibold text-sm hover:underline"
              >
                {author.name}
              </Link>
              <MarkdownContent 
                content={localCommentHtml || comment.html || commentContent} 
                htmlContent={localCommentHtml || comment.html || commentContent}
                className="text-sm mt-0.5" 
              />
            </div>

            <div className="flex gap-4 mt-1 text-xs items-center">
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
              </span>
              {likesCount > 0 && (
                <span className="text-xs text-muted-foreground">
                  {likesCount} {likesCount === 1 ? 'like' : 'likes'}
                </span>
              )}
              <button
                className={`flex items-center gap-1 text-xs text-muted-foreground hover:text-primary ${isLiked ? 'text-red-500' : 'text-muted-foreground'}`}
                onClick={handleLike}
                disabled={toggleLikeMutation.isPending}
              >
                {isLiked ? (
                  <HeartIconSolid className="h-3.5 w-3.5" />
                ) : (
                  <HeartIconOutline className="h-3.5 w-3.5" />
                )}
                <span>Like</span>
              </button>
              <button
                className="text-xs text-muted-foreground hover:text-primary"
                onClick={() => setIsReplying(!isReplying)}
              >
                Reply
              </button>
              <div className="flex-1" />
              {author.id === currentUserId && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 hover-effect">
                      <EllipsisHorizontalIcon className="h-5 w-5" />
                      <span className="sr-only">More options</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="shadow-lg hover-effect">
                    <DropdownMenuItem onClick={() => setIsEditing(true)}>
                      <PencilSquareIcon className="h-4 w-4 mr-2" />
                      Edit
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>

          {isReplying && (
            <UnifiedCommentReplyForm
              itemType={itemType}
              itemId={itemId}
              parentCommentId={comment.id}
              parentCommentAuthor={author.name || "User"}
              onCancel={() => setIsReplying(false)}
            />
          )}
          {isEditing && (
            <div className="mt-2">
              <form onSubmit={handleEditSubmit} className="space-y-4">
                <MarkdownEditor
                  onChange={setEditContent}
                  placeholder="Edit your comment..."
                  minHeight="80px"
                  maxHeight="200px"
                  content={editContent}
                />
                <div className="flex justify-end gap-2">
                  <Button 
                    type="button" 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setIsEditing(false)} 
                    disabled={updateCommentMutation.isPending}
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    size="sm" 
                    disabled={!editContent.trim() || updateCommentMutation.isPending}
                  >
                    {updateCommentMutation.isPending ? "Saving..." : "Save"}
                  </Button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* Render nested replies - with collapsible functionality and animation */}
      {comment.replies && comment.replies.length > 0 && (
        <div className="mt-1 ml-8">
          <button
            onClick={toggleReplies}
            className="text-xs text-muted-foreground hover:text-primary cursor-pointer flex items-center mb-1 transition-colors duration-200 group"
          >
            <div className="w-6 h-[1px] bg-border/60 mr-2 group-hover:bg-primary/30 transition-colors duration-200"></div>
            <span className="flex items-center gap-1">
              {showReplies ? (
                <>
                  <motion.svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    animate={{ rotate: 180 }}
                    transition={{ duration: 0.2 }}
                    className="transition-transform duration-200"
                  >
                    <path d="M6 9l6 6 6-6" />
                  </motion.svg>
                  <span className="text-xs">Hide {comment.replies.length} {comment.replies.length === 1 ? 'reply' : 'replies'}</span>
                </>
              ) : (
                <>
                  <motion.svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    animate={{ rotate: 0 }}
                    transition={{ duration: 0.2 }}
                    className="transition-transform duration-200"
                  >
                    <path d="M6 9l6 6 6-6" />
                  </motion.svg>
                  <span className="text-xs">View {comment.replies.length} {comment.replies.length === 1 ? 'reply' : 'replies'}</span>
                </>
              )}
            </span>
          </button>

          <AnimatePresence>
            {showReplies && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="space-y-1"
              >
                {comment.replies.map((reply) => (
                  <UnifiedComment
                    key={reply.id}
                    comment={reply}
                    itemType={itemType}
                    itemId={itemId}
                    currentUserId={currentUserId}
                    isReply={true}
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}