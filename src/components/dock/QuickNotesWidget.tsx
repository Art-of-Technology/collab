"use client";

import React, { useState } from 'react';
import { Send, Loader2, NotebookPen } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

interface QuickNotesWidgetProps {
  className?: string;
}

export function QuickNotesWidget({ className }: QuickNotesWidgetProps) {
  const [content, setContent] = useState<string>("");
  const [isCreating, setIsCreating] = useState(false);
  const { toast } = useToast();

  const handleCreateNote = async () => {
    if (!content.trim() || isCreating) return;

    setIsCreating(true);
    try {
      const response = await fetch('/api/notes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: content.length > 50 ? content.substring(0, 50) + '...' : content,
          content: content.trim(),
          isPublic: false,
          isFavorite: false,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to create note' }));
        throw new Error(errorData.error || 'Failed to create note');
      }

      const result = await response.json();
      
      toast({
        title: 'Note Created',
        description: 'Your quick note has been saved.',
      });

      setContent(""); // Clear the input

    } catch (err: any) {
      console.error('Error creating note:', err);
      toast({
        title: "Error",
        description: err.message || 'Could not create note.',
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleCreateNote();
    }
  };

  const maxLength = 200; // Character limit for quick notes
  const remainingChars = maxLength - content.length;
  const isOverLimit = remainingChars < 0;

  return (
    <div className={`flex items-center gap-3 w-full ${className}`}>
      <NotebookPen className="h-4 w-4 text-white/70 flex-shrink-0" />
      
      <div className="flex-1 min-w-0">
        <Input
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Quick note..."
          className="h-8 text-sm bg-white/10 border-white/20 text-white placeholder:text-white/50"
          disabled={isCreating}
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
          onClick={handleCreateNote}
          disabled={isCreating || !content.trim() || isOverLimit}
          className="h-8 bg-blue-600 hover:bg-blue-700 text-white disabled:bg-gray-600 disabled:opacity-50"
        >
          {isCreating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
} 