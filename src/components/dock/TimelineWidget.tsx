"use client";

import React, { useState } from 'react';
import { Send, Loader2, MessageSquarePlus, Sparkles } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useWorkspace } from "@/context/WorkspaceContext";

interface TimelineWidgetProps {
  className?: string;
}

export function TimelineWidget({ className }: TimelineWidgetProps) {
  const [content, setContent] = useState<string>("");
  const [isPosting, setIsPosting] = useState(false);
  const [isImproving, setIsImproving] = useState(false);
  const { toast } = useToast();
  const { currentWorkspace } = useWorkspace();

  const handleAiImprove = async () => {
    if (isImproving || !content.trim()) return;
    
    setIsImproving(true);
    toast({
      title: "Improving text...",
      description: "Please wait while AI improves your text"
    });
    
    try {
      const response = await fetch("/api/ai/shorten", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ text: content })
      });
      
      if (!response.ok) {
        throw new Error("Failed to improve text");
      }
      
      const data = await response.json();
      
      // Extract message from the response
      const improvedText = data.message || data.improvedText || content;
      setContent(improvedText);
      
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to improve text. Please try again.",
        variant: "destructive"
      });
      console.error(error);
    } finally {
      setIsImproving(false);
    }
  };

  const handlePost = async () => {
    if (!content.trim() || isPosting || !currentWorkspace?.id) return;

    setIsPosting(true);
    try {
      const response = await fetch('/api/timeline/posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: content.trim(),
          workspaceId: currentWorkspace.id
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to post to timeline' }));
        throw new Error(errorData.message || 'Failed to post to timeline');
      }

      await response.json();
      
      toast({
        title: 'Posted to Timeline',
        description: 'Your post has been shared to the timeline.',
      });

      setContent(""); // Clear the input

    } catch (err: any) {
      console.error('Error posting to timeline:', err);
      toast({
        title: "Error",
        description: err.message || 'Could not post to timeline.',
        variant: "destructive",
      });
    } finally {
      setIsPosting(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handlePost();
    }
  };

  const maxLength = 160;
  const remainingChars = maxLength - content.length;
  const isOverLimit = remainingChars < 0;

  return (
    <div className={`flex items-center gap-3 w-full ${className}`}>
      <MessageSquarePlus className="h-4 w-4 text-white/70 flex-shrink-0" />
      
      <div className="flex-1 min-w-0 relative pb-4 mt-4">
        <Input
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="What's happening?"
          className="h-8 text-sm bg-white/10 border-white/20 text-white placeholder:text-white/50"
          disabled={isPosting || isImproving}
          maxLength={maxLength}
        />
        {content.length > 0 && (
          <span className={`absolute top-9 right-0 text-[10px] ${isOverLimit ? 'text-red-400' : remainingChars <= 20 ? 'text-yellow-400' : 'text-white/70'}`}>
            {remainingChars}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={handleAiImprove}
          disabled={isImproving || isPosting || !content.trim()}
          className="h-8 px-3 gap-1.5 text-xs font-medium rounded-md border-border/60 bg-background/80 backdrop-blur-sm hover:bg-primary/10 hover:text-primary hover:border-primary/30 hover:shadow-sm focus:ring-1 focus:ring-primary/20 focus:border-primary/40 active:scale-[0.98] disabled:opacity-70"
        >
          {isImproving ? (
            <Loader2 className="h-4 w-4 text-purple-500 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4 text-purple-500" />
          )}
        </Button>
        
        <Button
          size="sm"
          onClick={handlePost}
          disabled={isPosting || !content.trim() || isOverLimit || isImproving}
          className="h-8 px-3 gap-1.5 text-xs font-medium rounded-md border-border/60 bg-background/80 backdrop-blur-sm hover:bg-primary/10 hover:text-primary hover:border-primary/30 hover:shadow-sm focus:ring-1 focus:ring-primary/20 focus:border-primary/40 active:scale-[0.98] disabled:opacity-70"
        >
          {isPosting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
    </div>
  );
} 