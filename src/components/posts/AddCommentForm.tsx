"use client";

import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { TextAreaWithAI } from "@/components/ui/text-area-with-ai";
import { useCreateComment } from "@/hooks/queries/useComment";
import { CustomAvatar } from "@/components/ui/custom-avatar";
import { useCurrentUser } from "@/hooks/queries/useUser";

interface AddCommentFormProps {
  postId: string;
}

export function AddCommentForm({ postId }: AddCommentFormProps) {
  const { toast } = useToast();
  const [commentText, setCommentText] = useState("");
  const [commentHtml, setCommentHtml] = useState("");
  const [isImproving, setIsImproving] = useState(false);
  
  // Use TanStack Query hooks
  const { data: currentUser } = useCurrentUser();
  const createCommentMutation = useCreateComment();

  const handleCommentChange = (value: string) => {
    setCommentText(value);
    // Note: TextAreaWithAI doesn't provide HTML, so we reset it
    setCommentHtml("");
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
    if (!commentText.trim()) return;

    try {
      await createCommentMutation.mutateAsync({
        postId,
        message: commentText,
        html: commentHtml
      });

      setCommentText("");
      setCommentHtml("");
      
      toast({
        description: "Comment added"
      });
    } catch (error) {
      console.error("Failed to add comment:", error);
      toast({
        title: "Error",
        description: "Failed to add comment",
        variant: "destructive"
      });
    }
  };

  if (!currentUser) return null;

  return (
    <form onSubmit={handleAddComment} className="flex gap-2 items-start mt-3 border-t pt-3 border-border/30">
      {currentUser.useCustomAvatar ? (
        <CustomAvatar user={currentUser} size="sm" />
      ) : (
        <Avatar className="h-8 w-8">
          <AvatarImage src={currentUser.image || undefined} alt={currentUser.name || "User"} />
          <AvatarFallback>
            {currentUser.name?.charAt(0).toUpperCase() || "U"}
          </AvatarFallback>
        </Avatar>
      )}
      <div className="flex-1">
        <TextAreaWithAI
          value={commentText}
          onChange={handleCommentChange}
          placeholder="Add a comment..."
          minHeight="80px"
          maxHeight="250px"
          onAiImprove={handleAiImprove}
          onSubmit={handleAddComment}
          loading={createCommentMutation.isPending || isImproving}
          disabled={createCommentMutation.isPending || isImproving}
        />
      </div>
    </form>
  );
} 