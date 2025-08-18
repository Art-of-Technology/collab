"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { RichEditor } from "@/components/RichEditor";
import { CustomAvatar } from "@/components/ui/custom-avatar";
import { useCurrentUser } from "@/hooks/queries/useUser";
import type { CommentFormProps } from "../types/comment";

export function CommentForm({
  onSubmit,
  placeholder = "Leave a comment...",
  isLoading = false,
  workspaceId,
  showUserInfo = true,
}: CommentFormProps) {
  const [content, setContent] = useState("");
  const { data: currentUser } = useCurrentUser();

  const handleSubmit = useCallback(async () => {
    if (!content.trim()) return;

    try {
      await onSubmit(content);
      setContent("");
    } catch (error) {
      // Error handling is done in the parent component
    }
  }, [content, onSubmit]);

  return (
    <div className="space-y-2 pt-3">
      <RichEditor
        value={content}
        onChange={(html, text) => setContent(html)}
        placeholder={placeholder}
        minHeight="80px"
        toolbarMode="static"
        showAiImprove={true}
        workspaceId={workspaceId}
      />

      <div className="flex justify-between">
        {showUserInfo && (
          <div className="flex items-center gap-2">
            <CustomAvatar user={currentUser || {}} size="xs" />
            <span className="text-xs font-medium text-[#e1e7ef]">
              {currentUser?.name || "You"}
            </span>
          </div>
        )}
        <Button
          onClick={handleSubmit}
          disabled={!content.trim() || isLoading}
          className="bg-[#238636] hover:bg-[#2ea043] text-white text-xs px-3 py-1 h-7"
          size="sm"
        >
          {isLoading ? "..." : "Comment"}
        </Button>
      </div>
    </div>
  );
}
