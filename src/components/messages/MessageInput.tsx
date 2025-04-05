"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PaperAirplaneIcon } from "@heroicons/react/24/solid";
import { cn } from "@/lib/utils";
import { useSendMessage } from "@/hooks/queries/useMessage";

interface MessageInputProps {
  conversationId: string;
}

export default function MessageInput({ conversationId }: MessageInputProps) {
  const [message, setMessage] = useState("");
  const sendMessageMutation = useSendMessage();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!message.trim() || sendMessageMutation.isPending) return;
    
    try {
      await sendMessageMutation.mutateAsync({
        conversationId,
        content: message.trim(),
      });
      
      setMessage("");
    } catch (error) {
      console.error(error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 p-2 bg-background border-t border-border/40 rounded-b-lg shadow-inner">
      <Textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type your message..."
        className={cn(
          "resize-none border-border/60 bg-card/60 focus:ring-primary/20",
          sendMessageMutation.isPending && "opacity-70"
        )}
        disabled={sendMessageMutation.isPending}
        rows={1}
      />
      <Button
        type="submit"
        size="icon"
        disabled={sendMessageMutation.isPending || !message.trim()}
        className={cn(
          "flex-shrink-0 transition-all", 
          sendMessageMutation.isPending ? "opacity-70" : "hover:bg-primary/90"
        )}
      >
        {sendMessageMutation.isPending ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        ) : (
          <PaperAirplaneIcon className="h-5 w-5" />
        )}
      </Button>
    </form>
  );
} 