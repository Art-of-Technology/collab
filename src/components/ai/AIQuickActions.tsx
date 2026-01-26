'use client';

import * as React from 'react';
import { useState, useCallback } from 'react';
import {
  Sparkles,
  Wand2,
  FileText,
  Lightbulb,
  Zap,
  ArrowUpRight,
  Loader2,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

// Types
interface AIQuickActionsProps {
  workspaceId: string;
  context: {
    type: 'editor' | 'form' | 'list';
    content?: string;
    onContentUpdate?: (newContent: string) => void;
  };
  className?: string;
  variant?: 'inline' | 'floating' | 'toolbar';
}

interface QuickAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  shortcut?: string;
  action: () => Promise<void>;
}

export function AIQuickActions({
  workspaceId,
  context,
  className,
  variant = 'inline',
}: AIQuickActionsProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Execute AI completion
  const executeCompletion = useCallback(
    async (type: string, options?: Record<string, unknown>) => {
      if (!context.content || !context.onContentUpdate) return;

      try {
        const response = await fetch('/api/ai/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type,
            input: context.content,
            options,
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to complete');
        }

        const data = await response.json();
        if (data.result) {
          context.onContentUpdate(data.result);
        }
      } catch (error) {
        console.error('AI completion error:', error);
        throw error;
      }
    },
    [context]
  );

  // Execute action with loading state
  const executeAction = useCallback(
    async (actionId: string, action: () => Promise<void>) => {
      setLoading(actionId);
      setSuccess(null);

      try {
        await action();
        setSuccess(actionId);
        setTimeout(() => setSuccess(null), 2000);
      } catch {
        // Error already logged
      } finally {
        setLoading(null);
      }
    },
    []
  );

  // Define quick actions
  const actions: QuickAction[] = [
    {
      id: 'improve',
      label: 'Improve Writing',
      icon: <Wand2 className="h-4 w-4" />,
      shortcut: '⌘I',
      action: () => executeCompletion('improve'),
    },
    {
      id: 'shorten',
      label: 'Make Concise',
      icon: <FileText className="h-4 w-4" />,
      shortcut: '⌘⇧S',
      action: () => executeCompletion('shorten'),
    },
    {
      id: 'expand',
      label: 'Expand',
      icon: <ArrowUpRight className="h-4 w-4" />,
      action: () =>
        executeCompletion('custom', {
          systemPrompt:
            'Expand the following text with more detail and context while maintaining the same tone.',
        }),
    },
    {
      id: 'fix',
      label: 'Fix Grammar',
      icon: <Check className="h-4 w-4" />,
      action: () =>
        executeCompletion('custom', {
          systemPrompt:
            'Fix any grammar, spelling, or punctuation errors in the following text. Return only the corrected text.',
        }),
    },
    {
      id: 'simplify',
      label: 'Simplify',
      icon: <Lightbulb className="h-4 w-4" />,
      action: () =>
        executeCompletion('custom', {
          systemPrompt:
            'Simplify the following text to be easier to understand. Use simpler words and shorter sentences.',
        }),
    },
  ];

  // Render action button
  const renderAction = (action: QuickAction) => {
    const isLoading = loading === action.id;
    const isSuccess = success === action.id;

    return (
      <TooltipProvider key={action.id}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'h-7 px-2 gap-1',
                variant === 'floating' && 'bg-background/80 backdrop-blur-sm shadow-sm',
                isSuccess && 'text-green-500'
              )}
              onClick={() => executeAction(action.id, action.action)}
              disabled={isLoading || !context.content}
            >
              {isLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : isSuccess ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                action.icon
              )}
              {variant !== 'toolbar' && (
                <span className="text-xs">{action.label}</span>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p className="text-xs">
              {action.label}
              {action.shortcut && (
                <span className="ml-2 text-muted-foreground">{action.shortcut}</span>
              )}
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  if (variant === 'inline') {
    return (
      <div className={cn('flex items-center gap-1', className)}>
        <Sparkles className="h-3.5 w-3.5 text-muted-foreground mr-1" />
        {actions.slice(0, 3).map(renderAction)}
      </div>
    );
  }

  if (variant === 'floating') {
    return (
      <div
        className={cn(
          'absolute bottom-2 right-2 flex items-center gap-1 p-1 rounded-lg border bg-background/95 backdrop-blur-sm shadow-lg',
          className
        )}
      >
        <div className="flex items-center gap-1 px-2 py-1 border-r">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-medium">AI</span>
        </div>
        {actions.slice(0, 4).map(renderAction)}
      </div>
    );
  }

  // Toolbar variant
  return (
    <div className={cn('flex items-center gap-0.5 p-1 rounded-md bg-muted/50', className)}>
      <div className="flex items-center gap-1 px-2">
        <Zap className="h-3.5 w-3.5 text-primary" />
      </div>
      {actions.map(renderAction)}
    </div>
  );
}

export default AIQuickActions;
