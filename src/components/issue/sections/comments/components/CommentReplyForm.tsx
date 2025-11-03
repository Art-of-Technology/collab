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

  editorRef.current?.getEditor()?.commands.blur();

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
    } catch {
      // handled by mutation
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
          className="bg-[#238636] hover:bg-[#2ea043] text-white h-6 text-xs px-2"
        >
          {addCommentMutation.isPending ? "..." : "Reply"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleCancel}
          className="border-[#333] text-[#7d8590] hover:bg-[#1a1a1a] h-6 text-xs px-2"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}