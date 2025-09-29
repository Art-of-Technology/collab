/*
 * This file is commented out as per manager's instructions.
 * We're now using the unified comment system instead of custom note comments.
 */

/*
"use client";

import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
*/

/*
interface NoteCommentReplyFormProps {
  noteId: string;
  parentCommentId: string;
  parentCommentAuthor: string;
  onCancel: () => void;
  onSuccess?: () => void;
}

export function NoteCommentReplyForm({
  noteId,
  parentCommentId,
  parentCommentAuthor,
  onCancel,
  onSuccess
}: NoteCommentReplyFormProps) {
*/
/*
  const [content, setContent] = useState("");
  const [isImproving, setIsImproving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

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
      setIsSubmitting(true);
      console.log("Sending reply with parent ID:", parentCommentId);
      // Log the data we're sending
      const requestData = {
        message: content,
        html: content, // Using same content for html for now
        parentId: parentCommentId
      };
      
      console.log(`Sending reply to note ${noteId} with parent ${parentCommentId}:`, requestData);
      
      const response = await fetch(`/api/notes/${noteId}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestData),
      });
      
      const responseData = await response.json();
      console.log("Reply response:", responseData);
      
      // Force refresh after a short delay to ensure the backend has processed everything
      if (onSuccess) {
        setTimeout(() => {
          onSuccess();
        }, 500);
      }

      if (response.ok) {
        toast({
          title: "Success",
          description: "Reply added successfully",
        });

        setContent("");
        onCancel();
        if (onSuccess) onSuccess();
      } else {
        throw new Error("Failed to add reply");
      }
    } catch (error) {
      console.error("Failed to add reply:", error);
      toast({
        title: "Error",
        description: "Failed to add reply",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
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
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={isSubmitting || !content.trim() || isImproving}
        >
          {isSubmitting ? "Submitting..." : "Reply"}
        </Button>
      </div>
    </form>
  );
}
*/

// Empty export to avoid import errors
export function NoteCommentReplyForm() {
  return null;
}
