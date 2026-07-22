"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { RichEditor } from "@/components/RichEditor";
import { useAddIssueComment } from "@/hooks/queries/useIssueComment";

interface CommentReplyFormProps {
  issueId: string;
  parentId: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function CommentReplyForm({
  issueId,
  parentId,
  onSuccess,
  onCancel,
}: CommentReplyFormProps) {
  const [content, setContent] = useState("");
  const addCommentMutation = useAddIssueComment();
  const editorRef = useRef<any>(null);

  const handleSubmit = async () => {
    // Force the editor to commit mentions before reading content
    editorRef.current?.getEditor()?.commands.blur();

    if (!content.trim()) return;

    try {
      await addCommentMutation.mutateAsync({
        issueId,
        content,
        parentId,
      });
      setContent("");
      onSuccess?.();
    } catch (error) {
      // Error handled by mutation
    }
  };

  const handleCancel = () => {
    setContent("");
    onCancel?.();
  };

  return (
    <div className="mt-2 space-y-2">
      <RichEditor
        ref={editorRef}
        value={content}
        onChange={(html) => setContent(html)}
        placeholder="Write a reply..."
        minHeight="80px"
        toolbarMode="static"
        showAiImprove={true}
      />
      <div className="flex gap-1.5">
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={!content.trim() || addCommentMutation.isPending}
          className="bg-green-700 hover:bg-green-600 text-white h-6 text-xs px-2"
        >
          {addCommentMutation.isPending ? "..." : "Reply"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleCancel}
          className="border-collab-600 text-collab-500 hover:bg-collab-800 h-6 text-xs px-2"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}