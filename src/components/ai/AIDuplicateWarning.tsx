'use client';

import * as React from 'react';
import { useState, useCallback, useEffect } from 'react';
import {
  AlertTriangle,
  Copy,
  ExternalLink,
  Loader2,
  ChevronDown,
  ChevronUp,
  Link2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

// Types
interface DuplicateCandidate {
  id: string;
  identifier?: string;
  title: string;
  status?: string;
  similarity: number;
  explanation?: string;
}

interface AIDuplicateWarningProps {
  workspaceId: string;
  projectId?: string;
  title: string;
  description?: string;
  excludeIssueId?: string;
  onLink?: (issueId: string) => void;
  onNavigate?: (issueId: string) => void;
  autoCheck?: boolean;
  minSimilarity?: number;
  className?: string;
}

export function AIDuplicateWarning({
  workspaceId,
  projectId,
  title,
  description,
  excludeIssueId,
  onLink,
  onNavigate,
  autoCheck = true,
  minSimilarity = 0.7,
  className,
}: AIDuplicateWarningProps) {
  const [loading, setLoading] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [lastChecked, setLastChecked] = useState<string | null>(null);

  // Check for duplicates
  const checkDuplicates = useCallback(async () => {
    if (!title || title.length < 5) {
      setDuplicates([]);
      return;
    }

    // Skip if already checked for this title
    const checkKey = `${title}:${description || ''}`;
    if (checkKey === lastChecked) return;

    setLoading(true);
    try {
      const response = await fetch('/api/ai/automation/duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          projectId,
          title,
          description: description || '',
          excludeIssueId,
          maxCandidates: 5,
          threshold: minSimilarity,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to check duplicates');
      }

      const data = await response.json();
      setDuplicates(data.candidates || []);
      setLastChecked(checkKey);
    } catch (error) {
      console.error('Duplicate check error:', error);
      setDuplicates([]);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, projectId, title, description, excludeIssueId, minSimilarity, lastChecked]);

  // Auto-check with debounce
  useEffect(() => {
    if (!autoCheck) return;

    const timer = setTimeout(() => {
      checkDuplicates();
    }, 1000);

    return () => clearTimeout(timer);
  }, [autoCheck, title, description, checkDuplicates]);

  // Get similarity badge color
  const getSimilarityColor = (similarity: number) => {
    if (similarity >= 0.9) return 'destructive';
    if (similarity >= 0.8) return 'default';
    return 'secondary';
  };

  // Don't render if no duplicates and not loading
  if (!loading && duplicates.length === 0) {
    return null;
  }

  return (
    <Alert
      variant={duplicates.some((d) => d.similarity >= 0.9) ? 'destructive' : 'default'}
      className={cn('border-dashed', className)}
    >
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle className="flex items-center justify-between">
        <span>
          {loading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Checking for duplicates...
            </span>
          ) : (
            `${duplicates.length} potential duplicate${duplicates.length !== 1 ? 's' : ''} found`
          )}
        </span>
        {!loading && duplicates.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 -mr-2"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        )}
      </AlertTitle>

      {!loading && duplicates.length > 0 && (
        <AlertDescription className="mt-2">
          <Collapsible open={expanded} onOpenChange={setExpanded}>
            {/* Preview of top duplicate */}
            {!expanded && (
              <div className="flex items-center justify-between py-1 text-sm">
                <span className="truncate flex-1 mr-2">
                  {duplicates[0].identifier && (
                    <span className="text-muted-foreground mr-1">
                      {duplicates[0].identifier}:
                    </span>
                  )}
                  {duplicates[0].title}
                </span>
                <Badge variant={getSimilarityColor(duplicates[0].similarity)}>
                  {Math.round(duplicates[0].similarity * 100)}% match
                </Badge>
              </div>
            )}

            <CollapsibleContent>
              <div className="space-y-2 mt-2">
                {duplicates.map((duplicate, index) => (
                  <div
                    key={duplicate.id}
                    className={cn(
                      'p-2 rounded-md bg-background/50 border',
                      duplicate.similarity >= 0.9 && 'border-destructive/50'
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {duplicate.identifier && (
                            <span className="text-xs font-mono text-muted-foreground">
                              {duplicate.identifier}
                            </span>
                          )}
                          <Badge variant={getSimilarityColor(duplicate.similarity)} className="text-[10px]">
                            {Math.round(duplicate.similarity * 100)}%
                          </Badge>
                          {duplicate.status && (
                            <Badge variant="outline" className="text-[10px]">
                              {duplicate.status}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm mt-1 truncate">{duplicate.title}</p>
                        {duplicate.explanation && (
                          <p className="text-[10px] text-muted-foreground mt-1 italic">
                            {duplicate.explanation}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {onLink && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2"
                            onClick={() => onLink(duplicate.id)}
                            title="Link as duplicate"
                          >
                            <Link2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {onNavigate && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2"
                            onClick={() => onNavigate(duplicate.id)}
                            title="View issue"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>

          {!expanded && duplicates.length > 1 && (
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-[10px]"
              onClick={() => setExpanded(true)}
            >
              Show {duplicates.length - 1} more
            </Button>
          )}
        </AlertDescription>
      )}
    </Alert>
  );
}

export default AIDuplicateWarning;
