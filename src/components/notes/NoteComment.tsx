"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { HeartIcon as HeartIconOutline } from "@heroicons/react/24/outline";
import { HeartIcon as HeartIconSolid } from "@heroicons/react/24/solid";
import { AnimatePresence, motion } from "framer-motion";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { NoteCommentReplyForm } from "./NoteCommentReplyForm";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useToast } from "@/hooks/use-toast";
import { NoteCommentForm } from "./NoteCommentForm";
import { Edit, Trash2, MessageSquare } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export type NoteCommentAuthor = {
  id: string;
  name: string | null;
  image: string | null;
};

export type NoteCommentWithAuthor = {
  id: string;
  message: string;
  html?: string | null;
  createdAt: string;
  updatedAt: string;
  author: NoteCommentAuthor;
  parentId?: string | null;
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
  children?: NoteCommentWithAuthor[];
};

interface NoteCommentProps {
  comment: NoteCommentWithAuthor;
  noteId: string;
  isReply?: boolean;
  onCommentUpdate?: () => void;
}

export function NoteComment({
  comment,
  noteId,
  isReply = false,
  onCommentUpdate
}: NoteCommentProps) {
  const [isReplying, setIsReplying] = useState(false);
  const [showReplies, setShowReplies] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const { data: session } = useSession();
  const { toast } = useToast();

  // For debugging - check if author is missing
  if (!comment.author) {
    console.error("Comment is missing author data:", comment);
  }
  
  // Debug children
  console.log(`Comment ${comment.id} details:`, {
    id: comment.id,
    parentId: comment.parentId,
    hasChildren: comment.children && comment.children.length > 0,
    childrenCount: comment.children?.length || 0,
    children: comment.children
  });

  // Provide fallback values for missing authors
  const author = comment.author || {
    id: "unknown",
    name: "Unknown User",
    image: null
  };

  // Function to handle like button click
  const handleLike = async () => {
    try {
      const response = await fetch(`/api/notes/${noteId}/comments/${comment.id}/like`, {
        method: "POST",
      });

      if (response.ok) {
        const data = await response.json();
        setIsLiked(data.isLiked);
        setLikesCount(data.likesCount);
      } else {
        throw new Error("Failed to toggle like");
      }
    } catch (error) {
      console.error("Error toggling like:", error);
      toast({
        title: "Error",
        description: "Failed to toggle like",
        variant: "destructive",
      });
    }
  };
  
  // Function to handle comment deletion
  const handleDeleteComment = async () => {
    if (!confirm("Are you sure you want to delete this comment?")) return;
    
    try {
      setIsDeleting(true);
      const response = await fetch(`/api/notes/${noteId}/comments/${comment.id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: "Comment deleted successfully",
        });
        if (onCommentUpdate) onCommentUpdate();
      } else {
        throw new Error("Failed to delete comment");
      }
    } catch (error) {
      console.error("Error deleting comment:", error);
      toast({
        title: "Error",
        description: "Failed to delete comment",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Toggle function to show/hide replies
  const toggleReplies = () => {
    setShowReplies(prev => !prev);
  };

  // Check if current user is the author of the comment
  const isAuthor = session?.user?.id === author.id;

  return (
    <div className={`mb-2 ${isReply ? 'reply-comment' : 'top-level-comment'}`}>
      <div className="flex gap-2 hover:bg-muted/50 p-2 rounded-lg">
        <Avatar className="h-7 w-7">
          <AvatarImage src={author.image || undefined} alt={author.name || "User"} />
          <AvatarFallback>
            {author.name?.charAt(0).toUpperCase() || "U"}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <div className="rounded-lg">
            <div className="flex flex-col">
              <Link
                href={`/profile/${author.id}`}
                className="font-semibold text-sm hover:underline"
              >
                {author.name}
              </Link>
              {!isEditing ? (
                <MarkdownContent 
                  content={comment.html || comment.message} 
                  htmlContent={comment.html || comment.message}
                  className="text-sm mt-0.5" 
                />
              ) : (
                <div className="mt-2">
                  <NoteCommentForm
                    noteId={noteId}
                    initialContent={comment.message}
                    commentId={comment.id}
                    onCancel={() => setIsEditing(false)}
                    onSuccess={() => {
                      setIsEditing(false);
                      if (onCommentUpdate) onCommentUpdate();
                    }}
                    isEdit
                  />
                </div>
              )}
            </div>

              {!isEditing && (
                <div className="flex gap-4 mt-1 text-xs items-center">
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                  </span>
                  {likesCount > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {likesCount} {likesCount === 1 ? 'like' : 'likes'}
                    </span>
                  )}
                  {isAuthor && (
                    <>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              className="p-1 rounded-full hover:bg-muted flex items-center justify-center"
                              onClick={() => setIsEditing(true)}
                            >
                              <Edit className="h-3 w-3 text-muted-foreground hover:text-primary" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Edit comment</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              className="p-1 rounded-full hover:bg-muted flex items-center justify-center"
                              onClick={handleDeleteComment}
                              disabled={isDeleting}
                            >
                              <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Delete comment</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </>
                  )}
                  
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          className="p-1 rounded-full hover:bg-muted flex items-center justify-center"
                          onClick={() => setIsReplying(!isReplying)}
                        >
                          <MessageSquare className="h-3 w-3 text-muted-foreground hover:text-primary" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Reply</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              )}
          </div>

          {isReplying && (
            <NoteCommentReplyForm
              noteId={noteId}
              parentCommentId={comment.id}
              parentCommentAuthor={author.name || "User"}
              onCancel={() => setIsReplying(false)}
              onSuccess={onCommentUpdate}
            />
          )}
        </div>
        <button
          className={`flex items-center hover:text-primary ${isLiked ? 'text-red-500' : 'text-muted-foreground'}`}
          onClick={handleLike}
        >
          {isLiked ? (
            <HeartIconSolid className="h-3.5 w-3.5" />
          ) : (
            <HeartIconOutline className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {/* Render nested replies - always visible for now to debug */}
      {comment.children && comment.children.length > 0 && (
        <div className="mt-1 ml-8">
          <div className="text-xs text-muted-foreground flex items-center mb-1">
            <div className="w-6 h-[1px] bg-border/60 mr-2"></div>
            <span className="flex items-center gap-1">
              <span className="text-xs">{comment.children.length} {comment.children.length === 1 ? 'reply' : 'replies'}</span>
            </span>
          </div>

          <div className="space-y-1">
            {comment.children.map((reply) => (
              <NoteComment
                key={reply.id}
                comment={reply}
                noteId={noteId}
                isReply={true}
                onCommentUpdate={onCommentUpdate}
              />
            ))}
          </div>
        </div>
      )}
      
      {/* Debug info */}
      {process.env.NODE_ENV === 'development' && (
        <div className="text-xs text-gray-400 mt-1 hidden">
          ID: {comment.id} | 
          {comment.parentId ? `Parent: ${comment.parentId}` : 'Root comment'} | 
          {comment.children?.length ? `Children: ${comment.children.length}` : 'No children'}
        </div>
      )}
    </div>
  );
}
