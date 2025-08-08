"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { CustomAvatar } from "@/components/ui/custom-avatar";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { UnifiedComment, UnifiedCommentData } from "@/components/ui/unified-comment";
import { UnifiedItemType, useAddUnifiedComment, useUnifiedComments } from "@/hooks/queries/useUnifiedComments";
import { useCurrentUser } from "@/hooks/queries/useUser";
import { useToast } from "@/hooks/use-toast";
import { extractMentionUserIds } from "@/utils/mentions";
import { organizeTaskCommentsIntoTree } from "@/utils/taskCommentHelpers";
import axios from "axios";
import { useMemo, useState } from "react";

// Helper function to normalize comment structure between TaskComment and Comment models
const normalizeCommentStructure = (comments: any[], itemType: UnifiedItemType): UnifiedCommentData[] => {
  return comments.map(comment => {
    const normalizedComment: UnifiedCommentData = {
      id: comment.id,
      content: comment.content,
      message: comment.message,
      html: comment.html,
      createdAt: comment.createdAt,
      author: comment.author || {
        id: "unknown",
        name: "Unknown User",
        image: null,
        useCustomAvatar: false
      },
      reactions: comment.reactions || [],
      parentId: comment.parentId,
      replies: comment.replies ? normalizeCommentStructure(comment.replies, itemType) : undefined
    };
    
    return normalizedComment;
  });
};

interface UnifiedCommentsSectionProps {
  itemType: UnifiedItemType;
  itemId: string;
  initialComments?: any[];
  currentUserId?: string;
}

export function UnifiedCommentsSection({ 
  itemType,
  itemId, 
  initialComments = [],
  currentUserId: initialUserId
}: UnifiedCommentsSectionProps) {
  const [content, setContent] = useState("");
  const [isImproving, setIsImproving] = useState(false);
  // Reply functionality is now handled directly in UnifiedComment component
  const { toast } = useToast();
  
  // Use unified hooks
  const { data, isLoading } = useUnifiedComments(itemType, itemId);
  const addCommentMutation = useAddUnifiedComment();
  
  // Get current user data
  const { data: currentUser } = useCurrentUser();
  
  // Normalize comment structure and use the query data or fall back to initial comments
  const rawComments = data?.comments || initialComments;
  const comments = useMemo(() => normalizeCommentStructure(rawComments, itemType), [rawComments, itemType]);
  const currentUserId = data?.currentUserId || initialUserId || '';
  
  // Use organizeTaskCommentsIntoTree when rendering comments
  const organizedComments = useMemo(() => 
    organizeTaskCommentsIntoTree(comments as any), [comments]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!content.trim()) {
      toast({
        title: "Error",
        description: "Comment cannot be empty",
        variant: "destructive",
      });
      return;
    }

    try {
      const newComment = await addCommentMutation.mutateAsync({
        itemType,
        itemId,
        content
      });

      // Process mentions if there are any in the comment
      if (newComment?.id) {
        const mentionedUserIds = extractMentionUserIds(content);
        
        if (mentionedUserIds.length > 0) {
          try {
            await axios.post("/api/mentions", {
              userIds: mentionedUserIds,
              sourceType: itemType === 'task' ? "TASK_COMMENT" : "COMMENT",
              sourceId: newComment.id,
              content: `mentioned you in a ${itemType} comment: "${content.length > 100 ? content.substring(0, 97) + '...' : content}"`
            });
          } catch (error) {
            console.error("Failed to process mentions:", error);
            // Don't fail the comment submission if mentions fail
          }
        }
      }

      setContent("");
    } catch (error) {
      console.error("Failed to add comment:", error);
      // Error handling is done in the mutation hook
    }
  };

  const handleEditorChange = (markdown: string) => {
    setContent(markdown);
  };

  const handleAiImprove = async (text: string): Promise<string> => {
    if (isImproving || !text.trim()) return text;

    setIsImproving(true);

    try {
      const response = await fetch("/api/ai/improve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ text })
      });

      if (!response.ok) {
        throw new Error("Failed to improve text");
      }

      const data = await response.json();
      const improvedText = data.message || data.improvedText || text;
      return improvedText;
    } catch (error) {
      console.error("Error improving text:", error);
      toast({
        title: "Error",
        description: "Failed to improve text",
        variant: "destructive"
      });
      return text;
    } finally {
      setIsImproving(false);
    }
  };

  // Reply functionality moved to individual UnifiedComment components

  if (isLoading && !initialComments.length) {
    return (
      <div className="py-4 text-center text-muted-foreground">
        <div className="animate-pulse flex justify-center items-center">
          <div className="h-4 w-4 bg-primary/20 rounded-full mr-1"></div>
          <div className="h-4 w-24 bg-primary/20 rounded"></div>
        </div>
      </div>
    );
  }

  // Show loading if user data is not available yet
  if (!currentUser) {
    return (
      <div className="flex gap-3">
        <div className="h-7 w-7 bg-muted/50 rounded-full animate-pulse" />
        <div className="flex-1 h-20 bg-muted/50 rounded-md animate-pulse" />
      </div>
    );
  }

  const isSubmitting = addCommentMutation.isPending;

  return (
    <div className="space-y-4">
      {organizedComments.length > 0 && (
        <div className="space-y-4 mb-4 max-h-[400px] overflow-y-auto pr-2">
          {organizedComments.map((comment) => (
            <UnifiedComment
              key={comment.id}
              comment={comment as UnifiedCommentData}
              itemType={itemType}
              itemId={itemId}
              currentUserId={currentUserId}
              // onReply removed - handled internally
            />
          ))}
        </div>
      )}

      <div className="pt-4 mt-4 border-t border-border/30">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex gap-3">
            {currentUser.useCustomAvatar ? (
              <CustomAvatar user={currentUser} size="sm" />
            ) : (
              <Avatar className="h-7 w-7">
                <AvatarImage src={currentUser.image || undefined} alt="Your avatar" />
                <AvatarFallback>
                  {currentUser.name?.charAt(0).toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
            )}
            <div className="flex-1">
              <MarkdownEditor
                onChange={handleEditorChange}
                placeholder="Add a comment..."
                minHeight="80px"
                maxHeight="200px"
                content={content}
                onAiImprove={handleAiImprove}
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting || !content.trim() || isImproving}
            >
              {isSubmitting ? "Posting..." : "Post Comment"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
} 