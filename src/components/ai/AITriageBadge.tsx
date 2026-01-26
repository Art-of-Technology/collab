'use client';

import * as React from 'react';
import { useState, useCallback, useEffect } from 'react';
import {
  Sparkles,
  Tag,
  AlertCircle,
  Clock,
  Loader2,
  Check,
  X,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

// Types
interface TriageSuggestion {
  type?: { value: string; confidence: number };
  priority?: { value: string; confidence: number };
  labels?: { value: string; confidence: number }[];
  storyPoints?: { value: number; confidence: number };
  explanation?: string;
}

interface AITriageBadgeProps {
  workspaceId: string;
  issue: {
    id: string;
    title: string;
    description?: string | null;
    type?: string;
    priority?: string;
    labels?: string[];
  };
  existingLabels?: string[];
  onApply?: (field: string, value: unknown) => void;
  autoFetch?: boolean;
  className?: string;
}

export function AITriageBadge({
  workspaceId,
  issue,
  existingLabels,
  onApply,
  autoFetch = false,
  className,
}: AITriageBadgeProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<TriageSuggestion | null>(null);
  const [applied, setApplied] = useState<Set<string>>(new Set());

  // Fetch triage suggestions
  const fetchTriage = useCallback(async () => {
    if (!issue.title) return;

    setLoading(true);
    try {
      const response = await fetch('/api/ai/automation/triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          title: issue.title,
          description: issue.description || '',
          existingLabels: existingLabels || [],
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch triage');
      }

      const data = await response.json();
      setSuggestion(data.suggestion || data);
    } catch (error) {
      console.error('Triage fetch error:', error);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, issue.title, issue.description, existingLabels]);

  // Auto-fetch on mount if enabled
  useEffect(() => {
    if (autoFetch && !suggestion && !loading) {
      fetchTriage();
    }
  }, [autoFetch, suggestion, loading, fetchTriage]);

  // Fetch when popover opens
  useEffect(() => {
    if (open && !suggestion && !loading) {
      fetchTriage();
    }
  }, [open, suggestion, loading, fetchTriage]);

  // Apply a suggestion
  const handleApply = useCallback(
    (field: string, value: unknown) => {
      onApply?.(field, value);
      setApplied((prev) => new Set(prev).add(field));
    },
    [onApply]
  );

  // Get confidence color
  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-500';
    if (confidence >= 0.6) return 'text-yellow-500';
    return 'text-muted-foreground';
  };

  // Render suggestion item
  const renderSuggestionItem = (
    field: string,
    label: string,
    value: unknown,
    confidence: number,
    icon: React.ReactNode
  ) => {
    const isApplied = applied.has(field);
    const currentValue = field === 'type' ? issue.type : field === 'priority' ? issue.priority : null;
    const isDifferent = currentValue && currentValue !== value;

    return (
      <div className="flex items-center justify-between py-1.5 border-b last:border-b-0">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant={isDifferent ? 'default' : 'secondary'}
            className="text-xs"
          >
            {String(value)}
          </Badge>
          <span className={cn('text-[10px]', getConfidenceColor(confidence))}>
            {Math.round(confidence * 100)}%
          </span>
          {!isApplied && onApply && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2"
              onClick={() => handleApply(field, value)}
            >
              <ChevronRight className="h-3 w-3" />
            </Button>
          )}
          {isApplied && <Check className="h-3.5 w-3.5 text-green-500" />}
        </div>
      </div>
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'h-6 px-2 gap-1 text-xs',
            suggestion && 'text-primary',
            className
          )}
        >
          {loading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Sparkles className="h-3 w-3" />
          )}
          <span>AI Triage</span>
          {suggestion && !loading && (
            <Badge variant="secondary" className="h-4 px-1 text-[10px]">
              {
                [
                  suggestion.type,
                  suggestion.priority,
                  ...(suggestion.labels || []),
                ].filter(Boolean).length
              }
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="start">
        <div className="space-y-2">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">AI Triage Suggestions</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={fetchTriage}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <span className="text-[10px]">↻</span>
              )}
            </Button>
          </div>

          {/* Loading state */}
          {loading && !suggestion && (
            <div className="flex items-center justify-center py-4 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              <span className="text-sm">Analyzing issue...</span>
            </div>
          )}

          {/* Suggestions */}
          {suggestion && (
            <div className="space-y-1">
              {suggestion.type && (
                renderSuggestionItem(
                  'type',
                  'Type',
                  suggestion.type.value,
                  suggestion.type.confidence,
                  <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                )
              )}

              {suggestion.priority && (
                renderSuggestionItem(
                  'priority',
                  'Priority',
                  suggestion.priority.value,
                  suggestion.priority.confidence,
                  <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />
                )
              )}

              {suggestion.storyPoints && (
                renderSuggestionItem(
                  'storyPoints',
                  'Story Points',
                  suggestion.storyPoints.value,
                  suggestion.storyPoints.confidence,
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                )
              )}

              {suggestion.labels && suggestion.labels.length > 0 && (
                <div className="pt-2 border-t">
                  <div className="text-xs font-medium text-muted-foreground mb-1.5">
                    Suggested Labels
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {suggestion.labels.map((label, i) => (
                      <Badge
                        key={i}
                        variant="outline"
                        className={cn(
                          'text-[10px] cursor-pointer',
                          applied.has(`label-${label.value}`) && 'bg-primary/10'
                        )}
                        onClick={() => handleApply(`label-${label.value}`, label.value)}
                      >
                        {label.value}
                        <span className={cn('ml-1', getConfidenceColor(label.confidence))}>
                          {Math.round(label.confidence * 100)}%
                        </span>
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {suggestion.explanation && (
                <div className="pt-2 text-[10px] text-muted-foreground italic">
                  {suggestion.explanation}
                </div>
              )}
            </div>
          )}

          {/* Apply all button */}
          {suggestion && onApply && (
            <div className="pt-2 border-t">
              <Button
                size="sm"
                className="w-full h-7 text-xs"
                onClick={() => {
                  if (suggestion.type) handleApply('type', suggestion.type.value);
                  if (suggestion.priority) handleApply('priority', suggestion.priority.value);
                  if (suggestion.storyPoints) handleApply('storyPoints', suggestion.storyPoints.value);
                  suggestion.labels?.forEach((l) => handleApply(`label-${l.value}`, l.value));
                }}
              >
                <Check className="h-3 w-3 mr-1" />
                Apply All Suggestions
              </Button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default AITriageBadge;
