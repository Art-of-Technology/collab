"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PaperAirplaneIcon } from "@heroicons/react/24/solid";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface MessageInputProps {
  conversationId: string;
}

export default function MessageInput({ conversationId }: MessageInputProps) {
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!message.trim() || isSubmitting) return;
    
    setIsSubmitting(true);
    
    try {
      const response = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: message.trim(),
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || "Failed to send message");
      }
      
      setMessage("");
      router.refresh();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to send message",
        variant: "destructive",
      });
      console.error(error);
    } finally {
      setIsSubmitting(false);
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
          isSubmitting && "opacity-70"
        )}
        disabled={isSubmitting}
        rows={1}
      />
      <Button
        type="submit"
        size="icon"
        disabled={isSubmitting || !message.trim()}
        className={cn(
          "flex-shrink-0 transition-all", 
          isSubmitting ? "opacity-70" : "hover:bg-primary/90"
        )}
      >
        {isSubmitting ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        ) : (
          <PaperAirplaneIcon className="h-5 w-5" />
        )}
      </Button>
    </form>
  );
} 