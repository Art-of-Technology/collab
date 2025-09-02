import { useState, useEffect, useMemo } from 'react';
import type { ActionFilter } from '@/components/views/selectors/ActionFiltersSelector';

interface UseActionFilteredIssuesOptions {
  issues: any[];
  actionFilters: ActionFilter[];
  workspaceId: string;
}

export function useActionFilteredIssues({ 
  issues, 
  actionFilters, 
  workspaceId 
}: UseActionFilteredIssuesOptions) {
  const [filteredIssueIds, setFilteredIssueIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if we have action filters to apply
  const hasActionFilters = actionFilters.length > 0;

  // Memoize the serialized action filters to prevent unnecessary API calls
  const serializedActionFilters = useMemo(() => {
    return JSON.stringify(actionFilters);
  }, [actionFilters]);

  // Fetch matching issue IDs when action filters change
  useEffect(() => {
    if (!hasActionFilters) {
      setFilteredIssueIds([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    let isCancelled = false;
    setIsLoading(true);
    setError(null);

    const fetchFilteredIds = async () => {
      try {
        const response = await fetch(`/api/workspaces/${workspaceId}/action-filter-issues`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ actionFilters })
        });

        if (!response.ok) {
          throw new Error(`Failed to filter by actions: ${response.statusText}`);
        }

        const data = await response.json();
        const matchingIds = data.issueIds || [];

        if (!isCancelled) {
          setFilteredIssueIds(matchingIds);
        }
      } catch (err) {
        if (!isCancelled) {
          setError(err instanceof Error ? err.message : 'Failed to filter by actions');
          console.error('Error filtering issues by actions:', err);
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchFilteredIds();

    return () => {
      isCancelled = true;
    };
  }, [serializedActionFilters, workspaceId, hasActionFilters]);

  // Apply the action filtering to the issues
  const filteredIssues = useMemo(() => {
    if (!hasActionFilters) {
      return issues; // No action filters, return all issues
    }

    if (isLoading) {
      return []; // Still loading, return empty array
    }

    if (error) {
      console.warn('Action filtering error, returning all issues:', error);
      return issues; // Error occurred, fallback to showing all issues
    }

    // Filter issues to only include those that match the action filters
    return issues.filter(issue => filteredIssueIds.includes(issue.id));
  }, [issues, hasActionFilters, isLoading, error, filteredIssueIds]);

  return {
    filteredIssues,
    isLoading,
    error,
    hasActionFilters
  };
}
