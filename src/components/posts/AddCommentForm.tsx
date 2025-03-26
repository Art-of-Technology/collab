"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { MarkdownEditor } from "@/components/ui/markdown-editor";

interface AddCommentFormProps {
  postId: string;
  currentUserId: string;
  userImage?: string | null;
}

export function AddCommentForm({ postId, currentUserId, userImage }: AddCommentFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [commentText, setCommentText] = useState("");
  const [commentHtml, setCommentHtml] = useState("");
  const [isAddingComment, setIsAddingComment] = useState(false);
  const [isImproving, setIsImproving] = useState(false);

  const handleEditorChange = (html: string, markdown: string) => {
    setCommentHtml(html);
    setCommentText(markdown);
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
      
      // Return improved text to display in the UI
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
          html: commentHtml
        }),
      });

      if (!response.ok) throw new Error();

      setCommentText("");
      setCommentHtml("");
      
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

  return (
    <form onSubmit={handleAddComment} className="flex gap-2 items-start mt-3 border-t pt-3 border-border/30">
      <Avatar className="h-8 w-8">
        <AvatarImage src={userImage || undefined} alt="User" />
        <AvatarFallback>
          {currentUserId.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1">
        <MarkdownEditor
          onChange={handleEditorChange}
          placeholder="Add a comment..."
          minHeight="80px"
          maxHeight="250px"
          compact={true}
          className="mb-2"
          content={commentText}
          onAiImprove={handleAiImprove}
        />
        <div className="flex justify-end">
          <Button
            type="submit"
            size="sm"
            variant="ghost"
            disabled={!commentText.trim() || isAddingComment || isImproving}
            className="text-primary hover:text-primary/90"
          >
            {isAddingComment ? "Posting..." : "Post"}
          </Button>
        </div>
      </div>
    </form>
  );
} 