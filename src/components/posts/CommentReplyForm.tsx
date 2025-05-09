"use client";

import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useCreateComment } from "@/hooks/queries/useComment";
import { CollabInput } from "@/components/ui/collab-input";
import { extractMentionUserIds } from "@/utils/mentions";
import axios from "axios";

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
  const [commentHtml, setCommentHtml] = useState("");
  const createComment = useCreateComment();
  
  const handleInputChange = (text: string, html: string) => {
    setComment(text);
    setCommentHtml(html);
  };
  
  const handleSubmit = async (text: string) => {
    if (!comment.trim()) return;
    
    const mentionedUserIds = extractMentionUserIds(commentHtml);
    
    createComment.mutate(
      { postId, message: comment, parentId },
      {
        onSuccess: async (data) => {
          setComment("");
          setCommentHtml("");
          
          // Create notifications for mentioned users
          if (mentionedUserIds.length > 0 && data?.id) {
            try {
              await axios.post("/api/mentions", {
                userIds: mentionedUserIds,
                sourceType: "comment",
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
        onChange={handleInputChange}
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