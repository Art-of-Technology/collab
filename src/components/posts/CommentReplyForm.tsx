"use client";

import { CollabInput } from "@/components/ui/collab-input";
import { useCreateComment } from "@/hooks/queries/useComment";
import { useToast } from "@/hooks/use-toast";
import { extractMentionUserIds } from "@/utils/mentions";
import axios from "axios";
import { useState } from "react";

interface CommentReplyFormProps {
  postId: string;
  parentId?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
  autoFocus?: boolean;
}

export default function CommentReplyForm({
  postId,
  parentId,
  onSuccess,
}: CommentReplyFormProps) {
  const { toast } = useToast();
  const [comment, setComment] = useState("");
  const createComment = useCreateComment();
  
  const handleSubmit = async (text: string) => {
    if (!text.trim()) return;
    
    const mentionedUserIds = extractMentionUserIds(text);
    
    createComment.mutate(
      { postId, message: text, parentId },
      {
        onSuccess: async (data) => {
          setComment("");
          
          // Create notifications for mentioned users
          if (mentionedUserIds.length > 0 && data?.id) {
            try {
              await axios.post("/api/mentions", {
                userIds: mentionedUserIds,
                sourceType: "COMMENT",
                sourceId: data.id,
                content: `mentioned you in a comment`
              });
            } catch (error) {
              console.error("Failed to process mentions:", error);
            }
          }
          
          toast({
            title: "Comment added",
            description: "Your comment has been added to the discussion",
          });
          
          if (onSuccess) onSuccess();
        },
        onError: () => {
          toast({
            title: "Error",
            description: "Failed to add your comment",
            variant: "destructive",
          });
        }
      }
    );
  };
  
  return (
    <div className="space-y-2">
      <CollabInput
        value={comment}
        onChange={setComment}
        onSubmit={handleSubmit}
        placeholder="Write a reply..."
        className="min-h-[80px]"
        minHeight="80px"
        maxHeight="180px"
        maxLength={1000}
        loading={createComment.isPending}
        submitLabel="Reply"
      />
    </div>
  );
} 