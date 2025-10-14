"use client";

import { useState, useEffect } from 'react';
import { ActivityAction, IssueActivity } from '../types/activity';
import { filterActivities } from '../utils/activityHelpers';

interface UseIssueActivitiesOptions {
  issueId: string;
  limit?: number;
  action?: ActivityAction;
}

interface UseIssueActivitiesReturn {
  activities: IssueActivity[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useIssueActivities({ 
  issueId, 
  limit = 50,
  action
}: UseIssueActivitiesOptions): UseIssueActivitiesReturn {
  const [activities, setActivities] = useState<IssueActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchActivities = async () => {
    try {
      setLoading(true);
      setError(null);

      // Build URL without undefined values
      const url = new URL(`/api/board-items/issue/${issueId}/activities`, window.location.origin);
      url.searchParams.set('limit', String(limit));
      if (action) {
        url.searchParams.set('action', action);
      }
      const response = await fetch(url.toString());

      if (!response.ok) {
        throw new Error(`Failed to fetch activities: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Filter out redundant activities
      const filteredActivities = filterActivities(data);
      
      setActivities(filteredActivities);
    } catch (err) {
      console.error('Error fetching activities:', err);
      setError(err instanceof Error ? err.message : 'Failed to load activities');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (issueId) {
      fetchActivities();
    }
  }, [issueId, limit]);

  return {
    activities,
    loading,
    error,
    refetch: fetchActivities
  };
}
