"use client";

import React, { useState } from 'react';
import { Send, Loader2, NotebookPen, Sparkles } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

interface QuickNotesWidgetProps {
  className?: string;
}

export function QuickNotesWidget({ className }: QuickNotesWidgetProps) {
  const [content, setContent] = useState<string>("");
  const [isCreating, setIsCreating] = useState(false);
  const [isImproving, setIsImproving] = useState(false);
  const { toast } = useToast();

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

      await response.json();
      
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
          disabled={isCreating || isImproving}
        />
      </div>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={handleAiImprove}
          disabled={isImproving || isCreating || !content.trim()}
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
          onClick={handleCreateNote}
          disabled={isCreating || !content.trim() || isImproving}
          className="h-8 px-3 gap-1.5 text-xs font-medium rounded-md border-border/60 bg-background/80 backdrop-blur-sm hover:bg-primary/10 hover:text-primary hover:border-primary/30 hover:shadow-sm focus:ring-1 focus:ring-primary/20 focus:border-primary/40 active:scale-[0.98] disabled:opacity-70"
        >
          {isCreating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
    </div>
  );
} 