"use client";

import { useState, useMemo, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { useCurrentUser } from "@/hooks/queries/useUser";
import { CustomAvatar } from "@/components/ui/custom-avatar";
import { extractMentionUserIds } from "@/utils/mentions";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Heart, Reply, MoreHorizontal, Trash2, Edit, ChevronDown, ChevronRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface IssueComment {
  id: string;
  content: string;
  html?: string;
  createdAt: string;
  author: {
    id: string;
    name: string | null;
    image: string | null;
    useCustomAvatar?: boolean;
  };
  reactions: IssueCommentReaction[];
  parentId?: string | null;
  replies?: IssueComment[];
}

interface IssueCommentReaction {
  id: string;
  type: string;
  author: {
    id: string;
    name: string | null;
    image: string | null;
  };
}

interface IssueCommentsSectionProps {
  issueId: string;
  initialComments?: IssueComment[];
  currentUserId?: string;
}

// Hook to fetch issue comments
function useIssueComments(issueId: string) {
  return useQuery({
    queryKey: ["issue-comments", issueId],
    queryFn: async () => {
      const response = await fetch(`/api/issues/${issueId}/comments`);
      if (!response.ok) {
        throw new Error("Failed to fetch comments");
      }
      return response.json() as Promise<IssueComment[]>;
    },
    enabled: !!issueId,
  });
}

// Hook to add issue comment
function useAddIssueComment() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      issueId,
      content,
      html,
      parentId,
    }: {
      issueId: string;
      content: string;
      html?: string;
      parentId?: string;
    }) => {
      const response = await fetch(`/api/issues/${issueId}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content, html, parentId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to add comment");
      }

      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["issue-comments", variables.issueId],
      });
      toast({
        title: "Success",
        description: "Comment added successfully",
      });
    },
    onError: (error) => {
      console.error("Error adding comment:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add comment",
        variant: "destructive",
      });
    },
  });
}

// Organize comments into a tree structure
function organizeCommentsIntoTree(comments: IssueComment[]): IssueComment[] {
  const commentMap = new Map<string, IssueComment>();
  const rootComments: IssueComment[] = [];

  // First pass: create comment map
  comments.forEach(comment => {
    commentMap.set(comment.id, { ...comment, replies: [] });
  });

  // Second pass: organize into tree
  comments.forEach(comment => {
    const commentWithReplies = commentMap.get(comment.id)!;
    
    if (comment.parentId) {
      const parent = commentMap.get(comment.parentId);
      if (parent) {
        parent.replies = parent.replies || [];
        parent.replies.push(commentWithReplies);
      }
    } else {
      rootComments.push(commentWithReplies);
    }
  });

  return rootComments;
}

// Individual comment component
function CommentItem({
  comment,
  issueId,
  currentUserId,
  onReply,
  level = 0,
}: {
  comment: IssueComment;
  issueId: string;
  currentUserId?: string;
  onReply: (parentId: string) => void;
  level?: number;
}) {
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [replyContent, setReplyContent] = useState("");
  const [repliesCollapsed, setRepliesCollapsed] = useState(false);
  const addCommentMutation = useAddIssueComment();

  const isAuthor = currentUserId === comment.author.id;
  const hasLiked = comment.reactions?.some(
    r => r.type === "like" && r.author.id === currentUserId
  );

  const handleReply = async () => {
    if (!replyContent.trim()) return;

    try {
      await addCommentMutation.mutateAsync({
        issueId,
        content: replyContent,
        parentId: comment.id,
      });
      setReplyContent("");
      setShowReplyForm(false);
    } catch (error) {
      // Error handled by mutation
    }
  };

  const handleLike = async () => {
    // TODO: Implement like functionality
    console.log("Like comment:", comment.id);
  };

  return (
    <div className={`${level > 0 ? "ml-6 border-l border-[#333] pl-3" : ""}`}>
      <div className="group flex gap-3 py-2">
        <div className="flex-shrink-0">
          <CustomAvatar user={comment.author} size="sm" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-[#e1e7ef]">
              {comment.author.name}
            </span>
            <span className="text-xs text-[#666]">
              {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
            </span>
          </div>

          <div className="prose prose-sm prose-invert max-w-none mb-2">
            <div 
              className="text-[#ccc] text-sm leading-relaxed"
              dangerouslySetInnerHTML={{ __html: comment.html || comment.content }}
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleLike}
              className={`flex items-center gap-1 text-xs hover:text-red-400 transition-colors ${
                hasLiked ? "text-red-400" : "text-[#666]"
              }`}
            >
              <Heart className={`h-3 w-3 ${hasLiked ? "fill-current" : ""}`} />
              {comment.reactions?.filter(r => r.type === "like").length || 0}
            </button>

            <button
              onClick={() => setShowReplyForm(!showReplyForm)}
              className="flex items-center gap-1 text-xs text-[#666] hover:text-[#ccc] transition-colors"
            >
              <Reply className="h-3 w-3" />
              Reply
            </button>

            {comment.replies && comment.replies.length > 0 && (
              <button
                onClick={() => setRepliesCollapsed(!repliesCollapsed)}
                className="flex items-center gap-1 text-xs text-[#666] hover:text-[#ccc] transition-colors"
              >
                {repliesCollapsed ? (
                  <ChevronRight className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
                {comment.replies.length} {comment.replies.length === 1 ? 'reply' : 'replies'}
              </button>
            )}

            {isAuthor && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="text-xs text-[#666] hover:text-[#ccc] opacity-0 group-hover:opacity-100 transition-all">
                    <MoreHorizontal className="h-3 w-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="bg-[#1f1f1f] border-[#333]">
                  <DropdownMenuItem className="text-[#ccc] hover:bg-[#333]">
                    <Edit className="h-3 w-3 mr-2" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-red-400 hover:bg-[#333]">
                    <Trash2 className="h-3 w-3 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {showReplyForm && (
            <div className="mt-3 space-y-3">
              <MarkdownEditor
                value={replyContent}
                onChange={setReplyContent}
                placeholder="Write a reply..."
                className="min-h-[80px]"
                showAiImprove={true}
                onAiImprove={async (text: string) => {
                  // TODO: Implement AI improve for replies
                  return text;
                }}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleReply}
                  disabled={!replyContent.trim() || addCommentMutation.isPending}
                  className="bg-[#238636] hover:bg-[#2ea043] text-white"
                >
                  {addCommentMutation.isPending ? "Replying..." : "Reply"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setShowReplyForm(false);
                    setReplyContent("");
                  }}
                  className="border-[#333] text-[#ccc] hover:bg-[#1a1a1a]"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Render replies */}
          {comment.replies && comment.replies.length > 0 && !repliesCollapsed && (
            <div className="mt-3">
              {comment.replies.map((reply) => (
                <CommentItem
                  key={reply.id}
                  comment={reply}
                  issueId={issueId}
                  currentUserId={currentUserId}
                  onReply={onReply}
                  level={level + 1}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function IssueCommentsSection({
  issueId,
  initialComments = [],
  currentUserId
}: IssueCommentsSectionProps) {
  const [newComment, setNewComment] = useState("");
  const { data: currentUser } = useCurrentUser();
  const { data: comments = [], isLoading } = useIssueComments(issueId);
  const addCommentMutation = useAddIssueComment();

  const organizedComments = useMemo(() => {
    const commentsToUse = comments.length > 0 ? comments : initialComments;
    return organizeCommentsIntoTree(commentsToUse);
  }, [comments, initialComments]);

  const handleAddComment = useCallback(async () => {
    if (!newComment.trim()) return;

    try {
      await addCommentMutation.mutateAsync({
        issueId,
        content: newComment,
      });
      setNewComment("");
    } catch (error) {
      // Error handled by mutation
    }
  }, [newComment, issueId, addCommentMutation]);

  const handleAiImprove = useCallback(async (text: string): Promise<string> => {
    try {
      const response = await fetch('/api/ai/improve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to improve text');
      }
      
      const data = await response.json();
      return data.improvedText || text;
    } catch (error) {
      console.error('Error improving text:', error);
      throw error;
    }
  }, []);

  const handleReply = useCallback((parentId: string) => {
    console.log("Reply to comment:", parentId);
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Comments list */}
      {organizedComments.length === 0 ? (
        <div className="text-center py-8">
          <MessageSquare className="h-10 w-10 mx-auto mb-3 text-[#333]" />
          <p className="text-[#ccc] text-sm mb-1">No comments yet</p>
          <p className="text-[#666] text-xs">Start the conversation</p>
        </div>
      ) : (
        <div className="space-y-1">
          {organizedComments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              issueId={issueId}
              currentUserId={currentUserId || currentUser?.id}
              onReply={handleReply}
            />
          ))}
        </div>
      )}

      {/* Add new comment */}
      <div className="space-y-3 pt-4 border-t border-[#1f1f1f]">
        <div className="flex items-center gap-3">
          <CustomAvatar user={currentUser} size="sm" />
          <span className="text-sm font-medium text-[#e1e7ef]">
            {currentUser?.name || "You"}
          </span>
        </div>
        
        <MarkdownEditor
          value={newComment}
          onChange={setNewComment}
          placeholder="Leave a comment..."
          className="min-h-[100px]"
          showAiImprove={true}
          onAiImprove={handleAiImprove}
        />
        
        <div className="flex justify-end">
          <Button
            onClick={handleAddComment}
            disabled={!newComment.trim() || addCommentMutation.isPending}
            className="bg-[#238636] hover:bg-[#2ea043] text-white text-sm px-4 py-2"
            size="sm"
          >
            {addCommentMutation.isPending ? "Posting..." : "Comment"}
          </Button>
        </div>
      </div>
    </div>
  );
}
