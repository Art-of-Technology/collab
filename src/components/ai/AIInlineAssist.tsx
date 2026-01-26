'use client';

import * as React from 'react';
import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Sparkles,
  Send,
  X,
  Loader2,
  CornerDownLeft,
  Wand2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

// Types
interface AIInlineAssistProps {
  workspaceId: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
  disabled?: boolean;
}

interface SuggestionPreset {
  id: string;
  label: string;
  prompt: string;
}

const PRESETS: SuggestionPreset[] = [
  { id: 'improve', label: 'Improve', prompt: 'Improve this text to be clearer and more professional' },
  { id: 'fix', label: 'Fix errors', prompt: 'Fix grammar and spelling errors' },
  { id: 'shorten', label: 'Shorten', prompt: 'Make this more concise' },
  { id: 'expand', label: 'Expand', prompt: 'Add more detail and context' },
  { id: 'formal', label: 'Formal', prompt: 'Make this more formal and professional' },
  { id: 'casual', label: 'Casual', prompt: 'Make this more casual and friendly' },
];

export function AIInlineAssist({
  workspaceId,
  value,
  onChange,
  placeholder = 'Ask AI to help...',
  className,
  triggerClassName,
  disabled,
}: AIInlineAssistProps) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when opened
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  // Generate AI suggestion
  const generateSuggestion = useCallback(
    async (customPrompt?: string) => {
      if (!value.trim()) return;

      setIsLoading(true);
      setPreview(null);

      try {
        const response = await fetch('/api/ai/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'custom',
            input: value,
            options: {
              systemPrompt: customPrompt || prompt || 'Improve this text',
              model: 'claude-haiku-3.5',
            },
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to generate');
        }

        const data = await response.json();
        if (data.result) {
          setPreview(data.result);
        }
      } catch (error) {
        console.error('AI inline assist error:', error);
      } finally {
        setIsLoading(false);
      }
    },
    [value, prompt]
  );

  // Apply suggestion
  const applySuggestion = useCallback(() => {
    if (preview) {
      onChange(preview);
      setOpen(false);
      setPreview(null);
      setPrompt('');
    }
  }, [preview, onChange]);

  // Handle keyboard
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (preview) {
        applySuggestion();
      } else {
        generateSuggestion();
      }
    }
    if (e.key === 'Escape') {
      setOpen(false);
      setPreview(null);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn('h-7 px-2 gap-1', triggerClassName)}
          disabled={disabled || !value.trim()}
        >
          <Wand2 className="h-3.5 w-3.5" />
          <span className="text-xs">AI Assist</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn('w-80 p-3', className)}
        align="start"
        side="bottom"
      >
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">AI Assist</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => setOpen(false)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Presets */}
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((preset) => (
              <Button
                key={preset.id}
                variant="outline"
                size="sm"
                className="h-6 text-xs"
                onClick={() => generateSuggestion(preset.prompt)}
                disabled={isLoading}
              >
                {preset.label}
              </Button>
            ))}
          </div>

          {/* Custom prompt input */}
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className="h-8 text-sm"
              disabled={isLoading}
            />
            <Button
              size="sm"
              className="h-8 px-2"
              onClick={() => generateSuggestion()}
              disabled={isLoading || !prompt.trim()}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Preview */}
          {preview && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">
                Suggestion:
              </div>
              <div className="p-2 rounded-md bg-muted/50 text-sm max-h-[150px] overflow-y-auto">
                {preview}
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPreview(null)}
                >
                  Discard
                </Button>
                <Button size="sm" onClick={applySuggestion}>
                  <CornerDownLeft className="h-3.5 w-3.5 mr-1" />
                  Apply
                </Button>
              </div>
            </div>
          )}

          {/* Loading indicator */}
          {isLoading && (
            <div className="flex items-center justify-center py-4 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              <span className="text-sm">Generating...</span>
            </div>
          )}

          {/* Footer hint */}
          <div className="text-[10px] text-muted-foreground text-center">
            Press Enter to generate • Esc to close
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default AIInlineAssist;
