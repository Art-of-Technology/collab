'use client';

import * as React from 'react';
import { useState, useCallback, useEffect } from 'react';
import {
  Users,
  User,
  Sparkles,
  Loader2,
  Check,
  ChevronDown,
  Award,
  Briefcase,
  Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

// Types
interface AssigneeSuggestion {
  memberId: string;
  memberName: string;
  memberEmail?: string;
  avatarUrl?: string;
  score: number;
  reasons: Array<{
    factor: string;
    description: string;
    contribution: number;
  }>;
}

interface AIAssigneeSuggestionProps {
  workspaceId: string;
  projectId: string;
  issue: {
    id: string;
    title: string;
    description?: string | null;
    type?: string;
    priority?: string;
    labels?: string[];
  };
  onAssign?: (memberId: string, memberName: string) => void;
  showTrigger?: boolean;
  autoFetch?: boolean;
  className?: string;
}

export function AIAssigneeSuggestion({
  workspaceId,
  projectId,
  issue,
  onAssign,
  showTrigger = true,
  autoFetch = false,
  className,
}: AIAssigneeSuggestionProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<AssigneeSuggestion[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Fetch suggestions
  const fetchSuggestions = useCallback(async () => {
    if (!issue.title) return;

    setLoading(true);
    try {
      const response = await fetch('/api/ai/automation/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          projectId,
          issue: {
            id: issue.id,
            title: issue.title,
            description: issue.description || '',
            type: issue.type,
            priority: issue.priority,
            labels: issue.labels || [],
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch suggestions');
      }

      const data = await response.json();
      setSuggestions(data.suggestions || []);
    } catch (error) {
      console.error('Assign suggestion error:', error);
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, projectId, issue]);

  // Auto-fetch on mount if enabled
  useEffect(() => {
    if (autoFetch && !suggestions.length && !loading) {
      fetchSuggestions();
    }
  }, [autoFetch, suggestions.length, loading, fetchSuggestions]);

  // Fetch when popover opens
  useEffect(() => {
    if (open && !suggestions.length && !loading) {
      fetchSuggestions();
    }
  }, [open, suggestions.length, loading, fetchSuggestions]);

  // Handle assign
  const handleAssign = useCallback(
    (suggestion: AssigneeSuggestion) => {
      setSelectedId(suggestion.memberId);
      onAssign?.(suggestion.memberId, suggestion.memberName);
      setTimeout(() => setOpen(false), 500);
    },
    [onAssign]
  );

  // Get score color
  const getScoreColor = (score: number) => {
    if (score >= 0.8) return 'text-green-500';
    if (score >= 0.6) return 'text-yellow-500';
    return 'text-muted-foreground';
  };

  // Get reason icon
  const getReasonIcon = (factor: string) => {
    switch (factor.toLowerCase()) {
      case 'expertise':
        return <Award className="h-3 w-3" />;
      case 'workload':
        return <Briefcase className="h-3 w-3" />;
      case 'availability':
        return <Clock className="h-3 w-3" />;
      default:
        return <Check className="h-3 w-3" />;
    }
  };

  // Get initials
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // If not showing trigger, return inline list
  if (!showTrigger) {
    if (loading) {
      return (
        <div className={cn('flex items-center gap-2 text-muted-foreground', className)}>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span className="text-xs">Finding best assignee...</span>
        </div>
      );
    }

    if (suggestions.length === 0) {
      return null;
    }

    return (
      <div className={cn('space-y-2', className)}>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Sparkles className="h-3 w-3 text-primary" />
          <span>AI Suggestions</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {suggestions.slice(0, 3).map((suggestion) => (
            <Button
              key={suggestion.memberId}
              variant="outline"
              size="sm"
              className="h-7 gap-2"
              onClick={() => handleAssign(suggestion)}
            >
              <Avatar className="h-4 w-4">
                {suggestion.avatarUrl && <AvatarImage src={suggestion.avatarUrl} />}
                <AvatarFallback className="text-[8px]">
                  {getInitials(suggestion.memberName)}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs">{suggestion.memberName}</span>
              <span className={cn('text-[10px]', getScoreColor(suggestion.score))}>
                {Math.round(suggestion.score * 100)}%
              </span>
            </Button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn('h-7 px-2 gap-1.5', className)}
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5 text-primary" />
          )}
          <span className="text-xs">Suggest Assignee</span>
          <ChevronDown className="h-3 w-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="start">
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">AI Assignee Suggestions</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={fetchSuggestions}
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
          {loading && suggestions.length === 0 && (
            <div className="flex items-center justify-center py-6 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              <span className="text-sm">Analyzing team capabilities...</span>
            </div>
          )}

          {/* No suggestions */}
          {!loading && suggestions.length === 0 && (
            <div className="text-center py-4 text-muted-foreground text-sm">
              No suggestions available. Try adding more issue details.
            </div>
          )}

          {/* Suggestions list */}
          {suggestions.length > 0 && (
            <div className="space-y-2">
              {suggestions.map((suggestion, index) => (
                <div
                  key={suggestion.memberId}
                  className={cn(
                    'p-2 rounded-lg border cursor-pointer transition-colors',
                    'hover:bg-muted/50',
                    selectedId === suggestion.memberId && 'bg-primary/10 border-primary'
                  )}
                  onClick={() => handleAssign(suggestion)}
                >
                  <div className="flex items-center gap-3">
                    {/* Rank */}
                    <div className="text-lg font-bold text-muted-foreground w-5 text-center">
                      {index + 1}
                    </div>

                    {/* Avatar */}
                    <Avatar className="h-9 w-9">
                      {suggestion.avatarUrl && <AvatarImage src={suggestion.avatarUrl} />}
                      <AvatarFallback>
                        {getInitials(suggestion.memberName)}
                      </AvatarFallback>
                    </Avatar>

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">
                          {suggestion.memberName}
                        </span>
                        {selectedId === suggestion.memberId && (
                          <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                        )}
                      </div>
                      {suggestion.memberEmail && (
                        <p className="text-[10px] text-muted-foreground truncate">
                          {suggestion.memberEmail}
                        </p>
                      )}
                    </div>

                    {/* Score */}
                    <div className="text-right shrink-0">
                      <span className={cn('text-lg font-bold', getScoreColor(suggestion.score))}>
                        {Math.round(suggestion.score * 100)}
                      </span>
                      <span className="text-[10px] text-muted-foreground">%</span>
                    </div>
                  </div>

                  {/* Reasons */}
                  {suggestion.reasons.length > 0 && (
                    <div className="mt-2 pt-2 border-t space-y-1.5">
                      {suggestion.reasons.slice(0, 3).map((reason, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <div className="text-muted-foreground">
                            {getReasonIcon(reason.factor)}
                          </div>
                          <span className="text-[10px] flex-1 truncate">
                            {reason.description}
                          </span>
                          <Progress
                            value={reason.contribution * 100}
                            className="w-12 h-1"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Footer */}
          <div className="text-[10px] text-muted-foreground text-center pt-2 border-t">
            Based on expertise, workload & availability
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default AIAssigneeSuggestion;
