"use client";

import { Heart, Reply, MoreHorizontal, Trash2, Edit, ChevronDown, ChevronRight } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { IssueComment } from "../types/comment";
import { hasUserLikedComment, getLikeCount } from "../utils/commentHelpers";

interface CommentActionsProps {
  comment: IssueComment;
  currentUserId?: string;
  onLike: () => void;
  onReply: () => void;
  onToggleReplies?: () => void;
  repliesCollapsed?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function CommentActions({
  comment,
  currentUserId,
  onLike,
  onReply,
  onToggleReplies,
  repliesCollapsed,
  onEdit,
  onDelete,
}: CommentActionsProps) {
  const isAuthor = currentUserId === comment.author.id;
  const hasLiked = hasUserLikedComment(comment, currentUserId);
  const likeCount = getLikeCount(comment);
  const hasReplies = comment.replies && comment.replies.length > 0;

  return (
    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
      <button
        onClick={onLike}
        className={`flex items-center gap-1 text-[10px] hover:text-red-400 transition-colors ${
          hasLiked ? "text-red-400" : "text-[#7d8590]"
        }`}
      >
        <Heart className={`h-2.5 w-2.5 ${hasLiked ? "fill-current" : ""}`} />
        {likeCount}
      </button>

      <button
        onClick={onReply}
        className="flex items-center gap-1 text-[10px] text-[#7d8590] hover:text-[#c9d1d9] transition-colors"
      >
        <Reply className="h-2.5 w-2.5" />
        Reply
      </button>

      {hasReplies && onToggleReplies && (
        <button
          onClick={onToggleReplies}
          className="flex items-center gap-1 text-[10px] text-[#7d8590] hover:text-[#c9d1d9] transition-colors"
        >
          {repliesCollapsed ? (
            <ChevronRight className="h-2.5 w-2.5" />
          ) : (
            <ChevronDown className="h-2.5 w-2.5" />
          )}
          {comment.replies?.length}
        </button>
      )}

      {isAuthor && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="text-[10px] text-[#7d8590] hover:text-[#c9d1d9] transition-all">
              <MoreHorizontal className="h-2.5 w-2.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="bg-[#1f1f1f] border-[#333]">
            {onEdit && (
              <DropdownMenuItem onClick={onEdit} className="text-[#ccc] hover:bg-[#333]">
                <Edit className="h-3 w-3 mr-2" />
                Edit
              </DropdownMenuItem>
            )}
            {onDelete && (
              <DropdownMenuItem onClick={onDelete} className="text-red-400 hover:bg-[#333]">
                <Trash2 className="h-3 w-3 mr-2" />
                Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
