"use client";

import React, { useState } from 'react';
import { Send, Loader2, MessageSquarePlus } from 'lucide-react';
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
  const { toast } = useToast();
  const { currentWorkspace } = useWorkspace();

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

      const result = await response.json();
      
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

  const maxLength = 280; // Twitter-like character limit
  const remainingChars = maxLength - content.length;
  const isOverLimit = remainingChars < 0;

  return (
    <div className={`flex items-center gap-3 w-full ${className}`}>
      <MessageSquarePlus className="h-4 w-4 text-white/70 flex-shrink-0" />
      
      <div className="flex-1 min-w-0">
        <Input
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="What's happening?"
          className="h-8 text-sm bg-white/10 border-white/20 text-white placeholder:text-white/50"
          disabled={isPosting}
        />
      </div>

      <div className="flex items-center gap-2">
        {content.length > 0 && (
          <span className={`text-xs ${isOverLimit ? 'text-red-400' : remainingChars <= 20 ? 'text-yellow-400' : 'text-white/70'}`}>
            {remainingChars}
          </span>
        )}
        
        <Button
          size="sm"
          onClick={handlePost}
          disabled={isPosting || !content.trim() || isOverLimit}
          className="h-8 bg-blue-600 hover:bg-blue-700 text-white disabled:bg-gray-600 disabled:opacity-50"
        >
          {isPosting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
} 