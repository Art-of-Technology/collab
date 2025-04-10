"use client";

import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { TextAreaWithAI } from "@/components/ui/text-area-with-ai";
import { useCreateComment } from "@/hooks/queries/useComment";

interface CommentReplyFormProps {
  postId: string;
  parentCommentId: string;
  parentCommentAuthor: string;
  onReplyAdded: () => void;
  onCancel: () => void;
}

export function CommentReplyForm({
  postId,
  parentCommentId,
  parentCommentAuthor,
  onReplyAdded,
  onCancel
}: CommentReplyFormProps) {
  const [replyText, setReplyText] = useState("");
  const [replyHtml, setReplyHtml] = useState("");
  const [isImproving, setIsImproving] = useState(false);
  const { toast } = useToast();
  
  // Use TanStack Query hooks
  const createCommentMutation = useCreateComment();

  const handleReplyChange = (value: string) => {
    setReplyText(value);
    // Note: TextAreaWithAI doesn't provide HTML, so we reset it
    setReplyHtml("");
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

  const handleReply = async () => {
    if (!replyText.trim()) return;

    try {
      await createCommentMutation.mutateAsync({
        postId,
        message: replyText,
        html: replyHtml,
        parentId: parentCommentId,
      });

      setReplyText("");
      setReplyHtml("");
      
      toast({
        description: "Reply added"
      });

      // Notify parent that a reply was added
      onReplyAdded();
    } catch (error) {
      console.error("Failed to add reply:", error);
      toast({
        title: "Error",
        description: "Failed to add reply",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="mt-2">
      <div className="flex gap-2 items-start">
        <div className="flex-1">
          <TextAreaWithAI
            value={replyText}
            onChange={handleReplyChange}
            onSubmit={handleReply}
            placeholder={`Reply to ${parentCommentAuthor}...`}
            minHeight="80px"
            maxHeight="200px"
            onAiImprove={handleAiImprove}
            loading={createCommentMutation.isPending || isImproving}
            disabled={createCommentMutation.isPending || isImproving}
          />
          <div className="flex justify-end gap-2 mt-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onCancel}
              className="text-xs h-7"
            >
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
} 