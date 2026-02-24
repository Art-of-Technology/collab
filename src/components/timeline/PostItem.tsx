"use client";

import { useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import {
  MessageSquare,
  Heart,
  AlertOctagon,
  Lightbulb,
  HelpCircle,
  FileText,
  ChevronDown,
  Send,
  Loader2,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PostTimelineItem } from "@/hooks/queries/useUnifiedTimeline";
import { useComments, useCreateComment } from "@/hooks/queries/useComment";
import { useCurrentUser } from "@/hooks/queries/useUser";
import { usePostReactions, useAddReaction, useRemoveReaction } from "@/hooks/queries/useReaction";
import { useToast } from "@/hooks/use-toast";

interface PostItemProps {
  item: PostTimelineItem;
  workspaceSlug: string;
}

const POST_TYPE_CONFIG: Record<
  string,
  { icon: any; color: string; bgColor: string; label: string }
> = {
  UPDATE: {
    icon: FileText,
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    label: "Update",
  },
  BLOCKER: {
    icon: AlertOctagon,
    color: "text-red-400",
    bgColor: "bg-red-500/10",
    label: "Blocker",
  },
  IDEA: {
    icon: Lightbulb,
    color: "text-amber-400",
    bgColor: "bg-amber-500/10",
    label: "Idea",
  },
  QUESTION: {
    icon: HelpCircle,
    color: "text-purple-400",
    bgColor: "bg-purple-500/10",
    label: "Question",
  },
};

const DEFAULT_CONFIG = {
  icon: MessageSquare,
  color: "text-[#71717a]",
  bgColor: "bg-[#27272a]",
  label: "Post",
};

export default function PostItem({ item }: PostItemProps) {
  const config = POST_TYPE_CONFIG[item.postType] || DEFAULT_CONFIG;
  const Icon = config.icon;
  const { toast } = useToast();

  const [isExpanded, setIsExpanded] = useState(false);
  const [commentText, setCommentText] = useState("");

  // Fetch current user
  const { data: currentUser } = useCurrentUser();

  // Fetch comments when expanded
  const { data: commentsData, isLoading: commentsLoading } = useComments(item.id);
  const createCommentMutation = useCreateComment();

  // Reactions
  const { data: reactionsData } = usePostReactions(item.id);
  const addReactionMutation = useAddReaction();
  const removeReactionMutation = useRemoveReaction();

  const hasReacted = reactionsData?.hasReacted || false;
  const reactionCount = reactionsData?.reactions?.length || item.reactionCount || 0;

  // Strip HTML and truncate message
  const plainText = item.message
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();
  const truncatedMessage =
    plainText.length > 200 ? plainText.slice(0, 200) + "..." : plainText;

  const comments = commentsData?.topLevelComments || [];
  const commentCount = comments.length || item.commentCount || 0;

  const handleLike = async () => {
    try {
      if (hasReacted) {
        await removeReactionMutation.mutateAsync({
          type: 'LIKE',
          postId: item.id
        });
      } else {
        await addReactionMutation.mutateAsync({
          type: 'LIKE',
          postId: item.id
        });
      }
    } catch (error) {
      console.error("Error handling like:", error);
    }
  };

  const handleSubmitComment = async () => {
    if (!commentText.trim()) return;

    try {
      await createCommentMutation.mutateAsync({
        postId: item.id,
        message: commentText.trim(),
        html: ""
      });
      setCommentText("");
      toast({ description: "Comment added" });
    } catch (error) {
      console.error("Failed to add comment:", error);
      toast({
        title: "Error",
        description: "Failed to add comment",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="py-4 px-4 -mx-4 rounded-2xl bg-[#171719] border border-[#1f1f22] transition-all">
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={`p-2 rounded-xl ${config.bgColor} mt-0.5`}>
          <Icon className={`h-4 w-4 ${config.color}`} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 mb-2">
            <Avatar className="h-6 w-6 ring-1 ring-[#1f1f22]">
              <AvatarImage src={item.user.image || undefined} />
              <AvatarFallback className="text-[10px] bg-[#101011] text-[#75757a]">
                {item.user.name?.charAt(0) || "?"}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm text-[#9c9ca1] font-medium">
              {item.user.name || "Someone"}
            </span>
            <span
              className={`text-xs px-2 py-0.5 rounded-lg ${config.bgColor} ${config.color}`}
            >
              {config.label}
            </span>
            <span className="text-xs text-[#75757a] ml-auto">
              {format(new Date(item.createdAt), "h:mm a")}
            </span>
          </div>

          {/* Message */}
          <p className="text-sm text-[#9c9ca1] leading-relaxed">
            {truncatedMessage}
          </p>

          {/* Actions */}
          <div className="flex items-center gap-1 mt-3">
            {/* Like button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLike}
              disabled={addReactionMutation.isPending || removeReactionMutation.isPending}
              className={cn(
                "h-8 px-3 gap-1.5 rounded-lg text-xs",
                hasReacted
                  ? "text-red-400 hover:text-red-300 hover:bg-red-500/10"
                  : "text-[#75757a] hover:text-[#9c9ca1] hover:bg-[#27272b]"
              )}
            >
              <Heart className={cn("h-3.5 w-3.5", hasReacted && "fill-current")} />
              {reactionCount > 0 && <span>{reactionCount}</span>}
            </Button>

            {/* Comment toggle button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className={cn(
                "h-8 px-3 gap-1.5 rounded-lg text-xs",
                isExpanded
                  ? "text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
                  : "text-[#75757a] hover:text-[#9c9ca1] hover:bg-[#27272b]"
              )}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              {commentCount > 0 && <span>{commentCount}</span>}
              <ChevronDown className={cn(
                "h-3 w-3 transition-transform",
                isExpanded && "rotate-180"
              )} />
            </Button>
          </div>

          {/* Expandable Comments Section */}
          <div
            className={cn(
              "overflow-hidden transition-all duration-200 ease-out",
              isExpanded ? "max-h-[500px] opacity-100 mt-4" : "max-h-0 opacity-0"
            )}
          >
            <div className="pt-4 border-t border-[#1f1f22]">
              {/* Comment Input */}
              {currentUser && (
                <div className="flex items-start gap-3 mb-4">
                  <Avatar className="h-7 w-7 ring-1 ring-[#1f1f22]">
                    <AvatarImage src={currentUser.image || undefined} />
                    <AvatarFallback className="text-[10px] bg-[#101011] text-[#75757a]">
                      {currentUser.name?.charAt(0) || "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 flex gap-2">
                    <input
                      type="text"
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSubmitComment();
                        }
                      }}
                      placeholder="Write a comment..."
                      className="flex-1 h-9 px-3 rounded-xl bg-[#101011] border border-[#1f1f22] text-sm text-[#fafafa] placeholder:text-[#75757a] focus:outline-none focus:border-[#27272b]"
                    />
                    <Button
                      size="icon"
                      onClick={handleSubmitComment}
                      disabled={!commentText.trim() || createCommentMutation.isPending}
                      className="h-9 w-9 rounded-xl bg-[#27272b] hover:bg-[#3f3f46] text-[#9c9ca1] hover:text-[#fafafa]"
                    >
                      {createCommentMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {/* Comments List */}
              {commentsLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-[#75757a]" />
                </div>
              ) : comments.length > 0 ? (
                <div className="space-y-3">
                  {comments.slice(0, 5).map((comment: any) => (
                    <div key={comment.id} className="flex items-start gap-3">
                      <Avatar className="h-6 w-6 ring-1 ring-[#1f1f22]">
                        <AvatarImage src={comment.author?.image || undefined} />
                        <AvatarFallback className="text-[9px] bg-[#101011] text-[#75757a]">
                          {comment.author?.name?.charAt(0) || "?"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-[#9c9ca1]">
                            {comment.author?.name || "Someone"}
                          </span>
                          <span className="text-[10px] text-[#75757a]">
                            {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                          </span>
                        </div>
                        <p className="text-sm text-[#9c9ca1] mt-0.5">
                          {comment.message}
                        </p>
                      </div>
                    </div>
                  ))}
                  {comments.length > 5 && (
                    <p className="text-xs text-[#75757a] text-center pt-2">
                      +{comments.length - 5} more comments
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-[#75757a] text-center py-2">
                  No comments yet. Be the first to comment!
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
