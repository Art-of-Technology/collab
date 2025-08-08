"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { CustomAvatar } from "@/components/ui/custom-avatar";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { useAddTaskComment, useUpdateTaskComment } from "@/hooks/queries/useTaskComment";
import { useCurrentUser } from "@/hooks/queries/useUser";
import { useToast } from "@/hooks/use-toast";
import { extractMentionUserIds } from "@/utils/mentions";
import axios from "axios";
import { useState } from "react";

interface TaskCommentFormProps {
  taskId: string;
  initialContent?: string;
  commentId?: string;
  onCancel?: () => void;
  onSuccess?: () => void;
  isEdit?: boolean;
}

export function TaskCommentForm({
  taskId,
  initialContent = "",
  commentId,
  onCancel,
  onSuccess,
  isEdit = false
}: TaskCommentFormProps) {
  const [content, setContent] = useState(initialContent);
  const [isImproving, setIsImproving] = useState(false);
  const { toast } = useToast();
  const addCommentMutation = useAddTaskComment();
  const updateCommentMutation = useUpdateTaskComment();
  
  // Get current user data with custom avatar fields
  const { data: currentUser } = useCurrentUser();

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
        taskId,
        content
      });

      // Process mentions if there are any in the comment
      if (newComment?.id) {
        const mentionedUserIds = extractMentionUserIds(content);
        
        if (mentionedUserIds.length > 0) {
          try {
            await axios.post("/api/mentions", {
              userIds: mentionedUserIds,
              sourceType: "TASK_COMMENT",
              sourceId: newComment.id,
              content: `mentioned you in a task comment: "${content.length > 100 ? content.substring(0, 97) + '...' : content}"`
            });
          } catch (error) {
            console.error("Failed to process mentions:", error);
            // Don't fail the comment submission if mentions fail
          }
        }
      }

      toast({
        title: "Success",
        description: "Comment added successfully",
      });

      setContent("");
    } catch (error) {
      console.error("Failed to add comment:", error);
      toast({
        title: "Error",
        description: "Failed to add comment",
        variant: "destructive",
      });
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

      // Extract message from the response
      const improvedText = data.message || data.improvedText || text;

      // Return improved text
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

  // Show loading if user data is not available yet
  if (!currentUser) {
    return (
      <div className="flex gap-3">
        <div className="h-7 w-7 bg-muted/50 rounded-full animate-pulse" />
        <div className="flex-1 h-20 bg-muted/50 rounded-md animate-pulse" />
      </div>
    );
  }

  // Handler for editing a comment
  const handleEdit = async (e: React.FormEvent) => {
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
      await updateCommentMutation.mutateAsync({ taskId, commentId: commentId!, content });
      toast({
        title: "Success",
        description: "Comment updated successfully",
      });
      if (onSuccess) onSuccess();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update comment",
        variant: "destructive",
      });
    }
  };

  if (isEdit) {
    return (
      <form onSubmit={handleEdit} className="space-y-4">
        <MarkdownEditor
          onChange={setContent}
          placeholder="Edit your comment..."
          minHeight="80px"
          maxHeight="200px"
          content={content}
          onAiImprove={handleAiImprove}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={updateCommentMutation.isPending}>Cancel</Button>
          <Button type="submit" size="sm" disabled={!content.trim() || isImproving || updateCommentMutation.isPending}>
            {updateCommentMutation.isPending ? "Saving..." : "Save"}
          </Button>
        </div>
      </form>
    );
  }

  return (
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
          disabled={addCommentMutation.isPending || !content.trim() || isImproving}
        >
          {addCommentMutation.isPending ? "Posting..." : "Post Comment"}
        </Button>
      </div>
    </form>
  );
} 