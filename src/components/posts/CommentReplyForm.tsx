"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { MarkdownEditor } from "@/components/ui/markdown-editor";

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
  const [isAddingReply, setIsAddingReply] = useState(false);
  const [isImproving, setIsImproving] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const handleEditorChange = (html: string, markdown: string) => {
    setReplyHtml(html);
    setReplyText(markdown);
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

    setIsAddingReply(true);

    try {
      const response = await fetch(`/api/posts/${postId}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: replyText,
          html: replyHtml,
          parentId: parentCommentId,
        }),
      });

      if (!response.ok) throw new Error();

      setReplyText("");
      setReplyHtml("");
      
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

  return (
    <div className="mt-2">
      <div className="flex gap-2 items-start">
        <div className="flex-1">
          <MarkdownEditor
            onChange={handleEditorChange}
            placeholder={`Reply to ${parentCommentAuthor}...`}
            minHeight="80px"
            maxHeight="200px"
            compact={true}
            className="mb-2"
            content={replyText}
            onAiImprove={handleAiImprove}
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onCancel}
              className="text-xs h-7"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleReply}
              disabled={!replyText.trim() || isAddingReply || isImproving}
              className="text-xs h-7"
            >
              {isAddingReply ? "Posting..." : "Reply"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
} 