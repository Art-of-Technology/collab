"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { CustomAvatar } from "@/components/ui/custom-avatar";
import { RichTextRenderer } from "@/components/RichEditor";
import { RichEditor } from "@/components/RichEditor";
import { Button } from "@/components/ui/button";
import { ConfirmationModal } from "@/components/modals/ConfirmationModal";
import { useToast } from "@/hooks/use-toast";
import { 
  useToggleIssueCommentLike, 
  useUpdateIssueComment, 
  useDeleteIssueComment 
} from "@/hooks/queries/useIssueComment";
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
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  
  const { toast } = useToast();
  const toggleLikeMutation = useToggleIssueCommentLike();
  const updateCommentMutation = useUpdateIssueComment();
  const deleteCommentMutation = useDeleteIssueComment();

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

  const handleLike = async () => {
    try {
      await toggleLikeMutation.mutateAsync({ 
        issueId, 
        commentId: comment.id 
      });
    } catch (error) {
      console.error("Error toggling like:", error);
      toast({
        title: "Error",
        description: "Failed to update like",
        variant: "destructive",
      });
    }
  };

  const handleEdit = () => {
    setIsEditing(true);
    setEditContent(comment.content);
  };

  const handleEditSave = async () => {
    if (!editContent.trim()) {
      toast({
        title: "Error",
        description: "Comment cannot be empty",
        variant: "destructive",
      });
      return;
    }

    try {
      await updateCommentMutation.mutateAsync({
        issueId,
        commentId: comment.id,
        content: editContent,
      });
      setIsEditing(false);
      toast({
        title: "Success",
        description: "Comment updated successfully",
      });
    } catch (error) {
      console.error("Error updating comment:", error);
      toast({
        title: "Error",
        description: "Failed to update comment",
        variant: "destructive",
      });
    }
  };

  const handleEditCancel = () => {
    setIsEditing(false);
    setEditContent(comment.content);
  };

  const handleDelete = () => {
    setShowDeleteModal(true);
  };

  const handleDeleteConfirm = async () => {
    try {
      await deleteCommentMutation.mutateAsync({
        issueId,
        commentId: comment.id,
      });
      setShowDeleteModal(false);
      toast({
        title: "Success",
        description: "Comment deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting comment:", error);
      toast({
        title: "Error",
        description: "Failed to delete comment",
        variant: "destructive",
      });
    }
  };

  const handleDeleteCancel = () => {
    setShowDeleteModal(false);
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
            {isEditing ? (
              <div className="space-y-2">
                <RichEditor
                  value={editContent}
                  onChange={setEditContent}
                  placeholder="Edit your comment..."
                  minHeight="80px"
                  maxHeight="200px"
                  showToolbar={true}
                  toolbarMode="floating"
                  className="text-xs"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleEditSave}
                    disabled={updateCommentMutation.isPending}
                    className="h-6 text-xs px-2"
                  >
                    {updateCommentMutation.isPending ? "Saving..." : "Save"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleEditCancel}
                    disabled={updateCommentMutation.isPending}
                    className="h-6 text-xs px-2"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <RichTextRenderer
                content={comment.html || comment.content}
                className="text-[#c9d1d9] text-xs leading-relaxed"
              />
            )}
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

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={showDeleteModal}
        onClose={handleDeleteCancel}
        onConfirm={handleDeleteConfirm}
        title="Delete Comment"
        message="Are you sure you want to delete this comment? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        variant="destructive"
        isLoading={deleteCommentMutation.isPending}
      />
    </div>
  );
}
