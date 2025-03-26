"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { TextImproverButton } from "@/components/ui/text-improver-button";

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
  const [isAddingReply, setIsAddingReply] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const handleImprovedText = (improvedText: string) => {
    setReplyText(improvedText);
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
          parentId: parentCommentId,
        }),
      });

      if (!response.ok) throw new Error();

      setReplyText("");
      
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
          <div className="relative">
            <Textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder={`Reply to ${parentCommentAuthor}...`}
              className="min-h-[40px] text-xs resize-none mb-1 focus:ring-1 focus:ring-primary focus:border-primary/50 pr-10"
            />
            <div className="absolute right-2 bottom-2">
              <TextImproverButton
                text={replyText}
                onImprovedText={handleImprovedText}
                disabled={isAddingReply}
                size="sm"
              />
            </div>
          </div>
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
              disabled={!replyText.trim() || isAddingReply}
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