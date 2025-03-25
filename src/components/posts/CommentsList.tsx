"use client";

import { useState, useRef, useEffect, useCallback, memo, useMemo } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { HeartIcon as HeartIconOutline } from "@heroicons/react/24/outline";
import { HeartIcon as HeartIconSolid } from "@heroicons/react/24/solid";
import { useToast } from "@/hooks/use-toast";
import { WandSparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CoolMode } from "../magicui/cool-mode";
import { AnimatePresence, motion } from "framer-motion";
import type { User } from "@prisma/client";

type CommentWithAuthor = {
  id: string;
  message: string;
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

interface CommentsListProps {
  postId: string;
  comments: CommentWithAuthor[];
  currentUserId: string;
}

// Comment component to render a single comment and its replies
const CommentComponent = ({
  comment,
  postId,
  currentUserId,
  onReplyAdded,
  likedComments,
  onLikeComment,
  onRefreshLikes,
  isReply = false,
}: {
  comment: CommentWithAuthor;
  postId: string;
  currentUserId: string;
  onReplyAdded: () => void;
  likedComments: Record<string, boolean>;
  onLikeComment: (commentId: string) => void;
  onRefreshLikes: (commentId: string) => Promise<any[]>;
  isReply?: boolean;
}) => {
  const [isReplying, setIsReplying] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [isAddingReply, setIsAddingReply] = useState(false);
  const [showReplies, setShowReplies] = useState(false);
  const { toast } = useToast();
  const router = useRouter();
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

  const handleReply = async () => {
    if (!replyText.trim()) return;

    setIsAddingReply(true);

    try {
      const response = await fetch(`/api/posts/${postId}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: replyText,
          parentId: comment.id,
        }),
      });

      if (!response.ok) throw new Error();

      setReplyText("");
      setIsReplying(false);

      toast({
        description: "Reply added"
      });

      // Notify parent that a reply was added
      onReplyAdded();

      // Refresh the page to show the new reply
      router.refresh();
    } catch (error) {
      console.error("Failed to add reply:", error);
      toast({
        title: "Error",
        description: "Failed to add reply",
        variant: "destructive"
      });
    } finally {
      setIsAddingReply(false);
    }
  };

  // Keep likesData in sync with likedComments state
  useEffect(() => {
    // When the liked state changes, ensure likesData reflects this change
    const currentUserLikeExists = likesData.some(
      reaction => reaction.authorId === currentUserId && reaction.type === "LIKE"
    );

    // If server says liked but not in our state, fetch latest data
    if (likedComments[comment.id] !== currentUserLikeExists) {
      const updateLikesData = async () => {
        const refreshedLikes = await onRefreshLikes(comment.id);
        setLikesData(refreshedLikes || []);
      };

      updateLikesData();
    }
  }, [likedComments[comment.id]]); // eslint-disable-line react-hooks/exhaustive-deps

  // Toggle function to show/hide replies
  const toggleReplies = () => {
    setShowReplies(prev => !prev);
  };

  return (
    <div className={`mb-2 ${isReply ? 'reply-comment' : 'top-level-comment'}`}>
      <div className="flex gap-2 hover:bg-muted/50 p-2 rounded-lg">
        <Avatar className="h-7 w-7">
          <AvatarImage src={comment.author.image || undefined} alt={comment.author.name || "User"} />
          <AvatarFallback>
            {comment.author.name?.charAt(0).toUpperCase() || "U"}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <div className="rounded-lg">
            <div className="flex items-start">
              <div>
                <Link
                  href={`/profile/${comment.author.id}`}
                  className="font-semibold text-sm hover:underline mr-2"
                >
                  {comment.author.name}
                </Link>
                <span className="text-sm">{comment.message}</span>
              </div>
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
            <div className="mt-2">
              <div className="flex gap-2 items-start">
                <div className="flex-1">
                  <Textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder={`Reply to ${comment.author.name}...`}
                    className="min-h-[40px] text-xs resize-none mb-1 focus:ring-1 focus:ring-primary focus:border-primary/50"
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setIsReplying(false)}
                      className="text-xs h-7"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleReply}
                      disabled={!replyText.trim() || isAddingReply}
                      className="text-xs h-7"
                    >
                      {isAddingReply ? "Posting..." : "Reply"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
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

      {/* Render nested replies - now with collapsible functionality and animation */}
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
                    <Comment
                      comment={reply}
                      postId={postId}
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
};

// Memoize the Comment component to prevent unnecessary re-renders
const Comment = memo(CommentComponent);

export default function CommentsList({ postId, comments, currentUserId }: CommentsListProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [commentText, setCommentText] = useState("");
  const [isAddingComment, setIsAddingComment] = useState(false);
  const [isTextImproverLoading, setIsTextImproverLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [likedComments, setLikedComments] = useState<Record<string, boolean>>(() => {
    const initialState: Record<string, boolean> = {};

    // Process all comments
    const processComment = (comment: CommentWithAuthor) => {
      // Process the main comment
      initialState[comment.id] = comment.reactions?.some(
        reaction => reaction.authorId === currentUserId && reaction.type === "LIKE"
      ) || false;

      // Process any replies
      if (comment.replies && comment.replies.length > 0) {
        comment.replies.forEach(reply => {
          initialState[reply.id] = reply.reactions?.some(
            reaction => reaction.authorId === currentUserId && reaction.type === "LIKE"
          ) || false;

          // Recursively process nested replies if they exist
          if (reply.replies && reply.replies.length > 0) {
            processComment(reply);
          }
        });
      }
    };

    // Process all top-level comments
    comments.forEach(processComment);

    return initialState;
  });

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

      // Only log if we have actual likes (reduces console spam)
      if (data.likes && data.likes.length > 0) {
        console.log(`Refreshed likes for comment ${commentId}:`, data.likes);
      }

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

  const improveText = async () => {
    if (!commentText.trim()) {
      toast({
        title: "Error",
        description: "Comment text is required",
        variant: "destructive"
      });
      return;
    }

    setIsTextImproverLoading(true);

    try {
      const response = await fetch("/api/ai/improve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: commentText,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || "Failed to improve text");
      }

      const data = await response.json();
      setCommentText(data.message);
    } catch (error) {
      console.error("Failed to improve text:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to improve text",
        variant: "destructive"
      });
    } finally {
      setIsTextImproverLoading(false);
    }
  };

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

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!commentText.trim()) return;

    setIsAddingComment(true);

    try {
      const response = await fetch(`/api/posts/${postId}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: commentText,
        }),
      });

      if (!response.ok) throw new Error();

      setCommentText("");
      toast({
        description: "Comment added"
      });

      // Refresh the page to show the new comment
      router.refresh();
    } catch (error) {
      console.error("Failed to add comment:", error);
      toast({
        title: "Error",
        description: "Failed to add comment",
        variant: "destructive"
      });
    } finally {
      setIsAddingComment(false);
    }
  };

  // Refresh data when a reply is added
  const handleReplyAdded = useCallback(() => {
    // Only refresh the page when needed
    if (router && typeof router.refresh === 'function') {
      router.refresh();
    }
  }, [router]);

  // Function to recursively organize comments into a tree structure
  const organizeCommentsIntoTree = useCallback((comments: CommentWithAuthor[]) => {
    // Create a map of comments by ID for quick lookup
    const commentMap = new Map<string, CommentWithAuthor>();

    // First pass: add all comments to the map
    comments.forEach(comment => {
      // Create a copy of the comment with an empty replies array if needed
      const commentWithReplies = {
        ...comment,
        replies: comment.replies || []
      };
      commentMap.set(comment.id, commentWithReplies);
    });

    // Second pass: organize into hierarchy
    const rootComments: CommentWithAuthor[] = [];

    comments.forEach(comment => {
      if (!comment.parentId) {
        // This is a root comment
        rootComments.push(commentMap.get(comment.id)!);
      } else {
        // This is a reply
        const parent = commentMap.get(comment.parentId);
        if (parent) {
          if (!parent.replies) {
            parent.replies = [];
          }
          // Add this comment as a reply to its parent
          parent.replies.push(commentMap.get(comment.id)!);
        } else {
          // If parent not found, treat as root comment
          rootComments.push(commentMap.get(comment.id)!);
        }
      }
    });

    return rootComments;
  }, []);

  // Use organizeCommentsIntoTree when rendering comments
  const organizedComments = useMemo(() => organizeCommentsIntoTree(comments), [comments, organizeCommentsIntoTree]);

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

      <form onSubmit={handleAddComment} className="flex gap-2 items-start mt-3 border-t pt-3 border-border/30">
        <Avatar className="h-8 w-8">
          <AvatarFallback>
            {currentUserId.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <div className="relative">
            <Textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Add a comment..."
              className="min-h-[40px] resize-none mb-2 pr-12 focus:ring-1 focus:ring-primary focus:border-primary/50"
              ref={textareaRef}
            />
            <div className="absolute right-2 bottom-2">
              <CoolMode>
                <Button
                  type="button"
                  disabled={isAddingComment || !commentText.trim()}
                  className="bg-primary hover:bg-primary/90 transition-colors relative aspect-square h-8 w-8"
                  onClick={() => improveText()}
                >
                  {!isTextImproverLoading && <WandSparkles className="h-4 w-4" />}
                  <Badge variant="secondary" className="absolute -top-3 -left-3 text-[0.6rem] py-0 px-1.5 border-green-400">
                    AI
                  </Badge>
                  {isTextImproverLoading && <span className="animate-spin">
                    <svg className="h-4 w-4" fill="white" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 30"><path d="M 14.070312 2 C 11.330615 2 8.9844456 3.7162572 8.0390625 6.1269531 C 6.061324 6.3911222 4.2941948 7.5446684 3.2773438 9.3066406 C 1.9078196 11.678948 2.2198602 14.567816 3.8339844 16.591797 C 3.0745422 18.436097 3.1891418 20.543674 4.2050781 22.304688 C 5.5751778 24.677992 8.2359331 25.852135 10.796875 25.464844 C 12.014412 27.045167 13.895916 28 15.929688 28 C 18.669385 28 21.015554 26.283743 21.960938 23.873047 C 23.938676 23.608878 25.705805 22.455332 26.722656 20.693359 C 28.09218 18.321052 27.78014 15.432184 26.166016 13.408203 C 26.925458 11.563903 26.810858 9.4563257 25.794922 7.6953125 C 24.424822 5.3220082 21.764067 4.1478652 19.203125 4.5351562 C 17.985588 2.9548328 16.104084 2 14.070312 2 z M 14.070312 4 C 15.226446 4 16.310639 4.4546405 17.130859 5.2265625 C 17.068225 5.2600447 17.003357 5.2865019 16.941406 5.3222656 L 12.501953 7.8867188 C 12.039953 8.1527187 11.753953 8.6456875 11.751953 9.1796875 L 11.724609 15.146484 L 9.5898438 13.900391 L 9.5898438 8.4804688 C 9.5898438 6.0104687 11.600312 4 14.070312 4 z M 20.492188 6.4667969 C 21.927441 6.5689063 23.290625 7.3584375 24.0625 8.6953125 C 24.640485 9.696213 24.789458 10.862812 24.53125 11.958984 C 24.470201 11.920997 24.414287 11.878008 24.351562 11.841797 L 19.910156 9.2773438 C 19.448156 9.0113437 18.879016 9.0103906 18.416016 9.2753906 L 13.236328 12.236328 L 13.248047 9.765625 L 17.941406 7.0546875 C 18.743531 6.5915625 19.631035 6.4055313 20.492188 6.4667969 z M 7.5996094 8.2675781 C 7.5972783 8.3387539 7.5898438 8.4087418 7.5898438 8.4804688 L 7.5898438 13.607422 C 7.5898438 14.141422 7.8729844 14.635297 8.3339844 14.904297 L 13.488281 17.910156 L 11.34375 19.134766 L 6.6484375 16.425781 C 4.5094375 15.190781 3.7747656 12.443687 5.0097656 10.304688 C 5.5874162 9.3043657 6.522013 8.5923015 7.5996094 8.2675781 z M 18.65625 10.865234 L 23.351562 13.574219 C 25.490562 14.809219 26.225234 17.556313 24.990234 19.695312 C 24.412584 20.695634 23.477987 21.407698 22.400391 21.732422 C 22.402722 21.661246 22.410156 21.591258 22.410156 21.519531 L 22.410156 16.392578 C 22.410156 15.858578 22.127016 15.364703 21.666016 15.095703 L 16.511719 12.089844 L 18.65625 10.865234 z M 15.009766 12.947266 L 16.78125 13.980469 L 16.771484 16.035156 L 14.990234 17.052734 L 13.21875 16.017578 L 13.228516 13.964844 L 15.009766 12.947266 z M 18.275391 14.853516 L 20.410156 16.099609 L 20.410156 21.519531 C 20.410156 23.989531 18.399687 26 15.929688 26 C 14.773554 26 13.689361 25.54536 12.869141 24.773438 C 12.931775 24.739955 12.996643 24.713498 13.058594 24.677734 L 17.498047 22.113281 C 17.960047 21.847281 18.246047 21.354312 18.248047 20.820312 L 18.275391 14.853516 z M 16.763672 17.763672 L 16.751953 20.234375 L 12.058594 22.945312 C 9.9195938 24.180312 7.1725 23.443687 5.9375 21.304688 C 5.3595152 20.303787 5.2105423 19.137188 5.46875 18.041016 C 5.5297994 18.079003 5.5857129 18.121992 5.6484375 18.158203 L 10.089844 20.722656 C 10.551844 20.988656 11.120984 20.989609 11.583984 20.724609 L 16.763672 17.763672 z" /></svg>
                  </span>}
                </Button>
              </CoolMode>
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              type="submit"
              size="sm"
              variant="ghost"
              disabled={!commentText.trim() || isAddingComment}
              className="text-primary hover:text-primary/90"
            >
              {isAddingComment ? "Posting..." : "Post"}
            </Button>
          </div>
        </div>
      </form>
    </>
  );
} 