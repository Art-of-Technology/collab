"use client";

import { useState, useEffect } from "react";
import { formatDistanceToNow } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { HeartIcon as HeartIconOutline } from "@heroicons/react/24/outline";
import { HeartIcon as HeartIconSolid } from "@heroicons/react/24/solid";
import { AnimatePresence, motion } from "framer-motion";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { TaskCommentReplyForm } from "./TaskCommentReplyForm";
import Link from "next/link";
import { CustomAvatar } from "@/components/ui/custom-avatar";

export type TaskCommentAuthor = {
  id: string;
  name: string | null;
  image: string | null;
  useCustomAvatar?: boolean;
};

export type TaskCommentWithAuthor = {
  id: string;
  content: string;
  html?: string | null;
  createdAt: Date;
  author: TaskCommentAuthor;
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
  replies?: TaskCommentWithAuthor[];
};

interface TaskCommentProps {
  comment: TaskCommentWithAuthor;
  taskId: string;
  currentUserId: string;
  onReplyAdded: () => void;
  likedComments: Record<string, boolean>;
  onLikeComment: (commentId: string) => Promise<boolean>;
  onRefreshLikes: (commentId: string) => Promise<any[]>;
  isReply?: boolean;
}

export function TaskComment({
  comment,
  taskId,
  currentUserId,
  onReplyAdded,
  likedComments,
  onLikeComment,
  onRefreshLikes,
  isReply = false,
}: TaskCommentProps) {
  const [isReplying, setIsReplying] = useState(false);
  const [showReplies, setShowReplies] = useState(false);
  const [likesData, setLikesData] = useState<any[]>(
    comment.reactions?.filter(reaction => reaction.type === "LIKE") || []
  );

  // Refresh likes data on component mount only
  useEffect(() => {
    let isMounted = true;

    const fetchInitialLikes = async () => {
      const refreshedLikes = await onRefreshLikes(comment.id);

      // Only update state if component is still mounted
      if (isMounted) {
        setLikesData(refreshedLikes || []);
      }
    };

    fetchInitialLikes();

    // Cleanup function to prevent state updates after unmount
    return () => {
      isMounted = false;
    };
  }, [comment.id, onRefreshLikes]); // Only depend on stable dependencies

  // Count likes for this comment
  const likesCount = likesData.length;

  // Function to handle like button click with server data only
  const handleLike = async () => {
    try {
      // Call the parent's onLikeComment function and wait for it to complete
      await onLikeComment(comment.id);

      // The likedComments state will be updated by handleLikeComment
      // The useEffect watching likedComments[comment.id] will handle updating likesData
    } catch (error) {
      console.error("Error handling like:", error);
    }
  };

  // Keep likesData in sync with likedComments state
  useEffect(() => {
    // Extract the liked state for this comment to a separate variable
    const isLikedByCurrentUser = likedComments[comment.id];
    
    // When the liked state changes, ensure likesData reflects this change
    const currentUserLikeExists = likesData.some(
      reaction => reaction.authorId === currentUserId && reaction.type === "LIKE"
    );

    // If server says liked but not in our state, fetch latest data
    if (isLikedByCurrentUser !== currentUserLikeExists) {
      const updateLikesData = async () => {
        const refreshedLikes = await onRefreshLikes(comment.id);
        setLikesData(refreshedLikes || []);
      };

      updateLikesData();
    }
  }, [comment.id, currentUserId, likesData, onRefreshLikes, likedComments]);

  // Toggle function to show/hide replies
  const toggleReplies = () => {
    setShowReplies(prev => !prev);
  };

  return (
    <div className={`mb-2 ${isReply ? 'reply-comment' : 'top-level-comment'}`}>
      <div className="flex gap-2 hover:bg-muted/50 p-2 rounded-lg">
        {comment.author.useCustomAvatar ? (
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
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  <MarkdownContent content={comment.html} className="text-sm" />
                </div>
              ) : (
                <span className="text-sm">{comment.content}</span>
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
            <TaskCommentReplyForm
              taskId={taskId}
              parentCommentId={comment.id}
              parentCommentAuthor={comment.author.name || "User"}
              onReplyAdded={() => {
                setIsReplying(false);
                onReplyAdded();
              }}
              onCancel={() => setIsReplying(false)}
            />
          )}
        </div>
        <button
          className={`flex ml-auto items-center hover:text-primary ${likedComments[comment.id] ? 'text-red-500' : 'text-muted-foreground'}`}
          onClick={handleLike}
        >
          {likedComments[comment.id] ? (
            <HeartIconSolid className="h-3.5 w-3.5" />
          ) : (
            <HeartIconOutline className="h-3.5 w-3.5" />
          )}
        </button>
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
                  <span className="text-xs">Hide</span>
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
                  <span className="text-xs">View</span>
                </>
              )}
              {comment.replies.length} {comment.replies.length === 1 ? 'reply' : 'replies'}
            </span>
          </button>

          <AnimatePresence>
            {showReplies && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{
                  opacity: 1,
                  height: "auto",
                  transition: {
                    height: { duration: 0.3, ease: "easeOut" },
                    opacity: { duration: 0.2, delay: 0.1 }
                  }
                }}
                exit={{
                  opacity: 0,
                  height: 0,
                  transition: {
                    height: { duration: 0.3, ease: "easeIn" },
                    opacity: { duration: 0.2 }
                  }
                }}
                className="space-y-2 mt-2 overflow-hidden"
              >
                {comment.replies.map((reply, index) => (
                  <motion.div
                    key={`${reply.id}-${likedComments[reply.id] ? 'liked' : 'notliked'}`}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{
                      opacity: 1,
                      y: 0,
                      transition: { 
                        duration: 0.2,
                        delay: index * 0.05 // Staggered animation delay based on index
                      }
                    }}
                  >
                    <TaskComment
                      comment={reply}
                      taskId={taskId}
                      currentUserId={currentUserId}
                      onReplyAdded={onReplyAdded}
                      likedComments={likedComments}
                      onLikeComment={onLikeComment}
                      onRefreshLikes={onRefreshLikes}
                      isReply={true}
                    />
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
} 