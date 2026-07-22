"use client";

import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Send, Loader2 } from "lucide-react";
import { useCurrentUser } from "@/hooks/queries/useUser";
import { UserAvatar } from '@/components/ui/user-avatar';
import { useToast } from "@/hooks/use-toast";

interface QuickPostInputProps {
  workspaceId: string;
}

export default function QuickPostInput({ workspaceId }: QuickPostInputProps) {
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { data: user } = useCurrentUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleSubmit = useCallback(async () => {
    if (!message.trim() || !workspaceId || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/timeline/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: message.trim(),
          workspaceId,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to create post");
      }

      setMessage("");
      toast({ description: "Update posted" });

      // Invalidate timeline to show new post
      queryClient.invalidateQueries({ queryKey: ["unified-timeline"] });
    } catch (error) {
      console.error("Failed to post:", error);
      toast({
        title: "Error",
        description: "Failed to post update",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [message, workspaceId, isSubmitting, toast, queryClient]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="bg-collab-800 border border-collab-700 rounded-2xl p-5">
      <div className="flex items-start gap-4">
        <UserAvatar user={user} size="lg" className="ring-2 ring-collab-700 flex-shrink-0" />

        <div className="flex-1 min-w-0">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Share an update with your team..."
            className="w-full bg-transparent text-sm text-collab-50 placeholder:text-collab-500 resize-none outline-none min-h-[72px]"
            rows={2}
          />

          <div className="flex items-center justify-between mt-3 pt-3 border-t border-collab-700">
            <span className="text-xs text-collab-500">
              Press Enter to post
            </span>

            <button
              onClick={handleSubmit}
              disabled={!message.trim() || isSubmitting}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-collab-600 hover:bg-collab-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-sm text-collab-400 hover:text-collab-50"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              <span>Post</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
