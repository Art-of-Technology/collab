"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { CustomAvatar } from "@/components/ui/custom-avatar";
import { RichTextRenderer } from "@/components/RichEditor";
import type { CommentItemProps } from "../types/comment";
import { CommentActions } from "./CommentActions";
import { CommentReplyForm } from "./CommentReplyForm";

export function CommentItem({
  comment,
  issueId,
  currentUserId,
  onReply,
  level = 0,
}: CommentItemProps) {
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [repliesCollapsed, setRepliesCollapsed] = useState(false);

  const handleLike = async () => {
    // TODO: Implement like functionality
    console.log("Like comment:", comment.id);
  };

  const handleReplyClick = () => {
    setShowReplyForm(!showReplyForm);
  };

  const handleReplySuccess = () => {
    setShowReplyForm(false);
  };

  const handleReplyCancel = () => {
    setShowReplyForm(false);
  };

  const handleToggleReplies = () => {
    setRepliesCollapsed(!repliesCollapsed);
  };

  const handleEdit = () => {
    // TODO: Implement edit functionality
    console.log("Edit comment:", comment.id);
  };

  const handleDelete = () => {
    // TODO: Implement delete functionality
    console.log("Delete comment:", comment.id);
  };

  return (
    <div className={`${level > 0 ? "ml-4 border-l border-[#2a2a2a] pl-3" : ""}`}>
      <div className="group flex gap-2 py-1.5 hover:bg-[#0d0d0d] rounded-md px-1">
        <div className="flex-shrink-0">
          <CustomAvatar user={comment.author} size="xs" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-xs font-medium text-[#e1e7ef]">
              {comment.author.name}
            </span>
            <span className="text-[10px] text-[#7d8590]">
              {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
            </span>
          </div>

          <div className="mb-1">
            <RichTextRenderer
              content={comment.html || comment.content}
              className="text-[#c9d1d9] text-xs leading-relaxed"
            />
          </div>

          <CommentActions
            comment={comment}
            currentUserId={currentUserId}
            onLike={handleLike}
            onReply={handleReplyClick}
            onToggleReplies={handleToggleReplies}
            repliesCollapsed={repliesCollapsed}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />

          {showReplyForm && (
            <CommentReplyForm
              issueId={issueId}
              parentId={comment.id}
              onSuccess={handleReplySuccess}
              onCancel={handleReplyCancel}
            />
          )}

          {/* Render replies */}
          {comment.replies && comment.replies.length > 0 && !repliesCollapsed && (
            <div className="mt-2">
              {comment.replies.map((reply) => (
                <CommentItem
                  key={reply.id}
                  comment={reply}
                  issueId={issueId}
                  currentUserId={currentUserId}
                  onReply={onReply}
                  level={level + 1}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
