"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { TextImproverButton } from "@/components/ui/text-improver-button";

interface AddCommentFormProps {
  postId: string;
  currentUserId: string;
  userImage?: string | null;
}

export function AddCommentForm({ postId, currentUserId, userImage }: AddCommentFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [commentText, setCommentText] = useState("");
  const [isAddingComment, setIsAddingComment] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleImprovedText = (improvedText: string) => {
    setCommentText(improvedText);
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
        }),
      });

      if (!response.ok) throw new Error();

      setCommentText("");
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
        <div className="relative">
          <Textarea
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Add a comment..."
            className="min-h-[40px] resize-none mb-2 pr-10 focus:ring-1 focus:ring-primary focus:border-primary/50"
            ref={textareaRef}
          />
          <div className="absolute right-2 bottom-2">
            <TextImproverButton
              text={commentText}
              onImprovedText={handleImprovedText}
              disabled={isAddingComment}
              size="sm"
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button
            type="submit"
            size="sm"
            variant="ghost"
            disabled={!commentText.trim() || isAddingComment}
            className="text-primary hover:text-primary/90"
          >
            {isAddingComment ? "Posting..." : "Post"}
          </Button>
        </div>
      </div>
    </form>
  );
} 