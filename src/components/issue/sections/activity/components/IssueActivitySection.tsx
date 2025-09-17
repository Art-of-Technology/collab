"use client";

import { IssueActivitySectionProps } from '../types/activity';
import { useIssueActivities } from '../hooks/useIssueActivities';
import { ActivityItem } from './ActivityItem';
import { LoadingState } from './LoadingState';
import { EmptyActivityState } from './EmptyActivityState';

export function IssueActivitySection({ issueId, limit = 50 }: IssueActivitySectionProps) {
  const { activities, loading, error } = useIssueActivities({ issueId, limit });

  if (loading) {
    return <LoadingState />;
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-400 mb-2">Failed to load activity history</p>
        <p className="text-sm text-[#666]">{error}</p>
      </div>
    );
  }

  if (activities.length === 0) {
    return <EmptyActivityState />;
  }

  return (
    <div className="space-y-0.5">
      {activities.map((activity) => (
        <ActivityItem
          key={activity.id}
          activity={activity}
          itemType="issue"
        />
      ))}
    </div>
  );
}
