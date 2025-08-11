"use client";

import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { useAddUnifiedComment, UnifiedItemType } from "@/hooks/queries/useUnifiedComments";
import { extractMentionUserIds } from "@/utils/mentions";
import axios from "axios";

interface UnifiedCommentReplyFormProps {
  itemType: UnifiedItemType;
  itemId: string;
  parentCommentId: string;
  parentCommentAuthor: string;
  onCancel: () => void;
}

export function UnifiedCommentReplyForm({
  itemType,
  itemId,
  parentCommentId,
  parentCommentAuthor,
  onCancel
}: UnifiedCommentReplyFormProps) {
  const [content, setContent] = useState("");
  const [isImproving, setIsImproving] = useState(false);
  const { toast } = useToast();
  const addCommentMutation = useAddUnifiedComment();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!content.trim()) {
      toast({
        title: "Error",
        description: "Reply cannot be empty",
        variant: "destructive",
      });
      return;
    }

    try {
      const newReply = await addCommentMutation.mutateAsync({
        itemType,
        itemId,
        content,
        parentId: parentCommentId
      });

      setContent("");
      onCancel();
    } catch (error) {
      console.error("Failed to add reply:", error);
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
    <form onSubmit={handleSubmit} className="mt-2 space-y-2">
      <MarkdownEditor
        onChange={handleEditorChange}
        placeholder={`Reply to ${parentCommentAuthor}...`}
        minHeight="60px"
        maxHeight="150px"
        content={content}
        onAiImprove={handleAiImprove}
      />
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={addCommentMutation.isPending || !content.trim() || isImproving}
        >
          {addCommentMutation.isPending ? "Submitting..." : "Reply"}
        </Button>
      </div>
    </form>
  );
} 