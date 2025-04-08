"use client";

import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { useAddTaskComment } from "@/hooks/queries/useTaskComment";

interface TaskCommentFormProps {
  taskId: string;
  currentUserId: string;
  userImage?: string | null;
}

export function TaskCommentForm({
  taskId,
  currentUserId,
  userImage
}: TaskCommentFormProps) {
  const [content, setContent] = useState("");
  const [isImproving, setIsImproving] = useState(false);
  const { toast } = useToast();
  const addCommentMutation = useAddTaskComment();

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
      await addCommentMutation.mutateAsync({
        taskId,
        content
      });

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

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex gap-3">
        <Avatar className="h-7 w-7">
          <AvatarImage src={userImage || undefined} alt="Your avatar" />
          <AvatarFallback>
            {currentUserId.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
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