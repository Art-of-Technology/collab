"use client";

import React from 'react';
import { Github, GitCommit, GitPullRequest, GitMerge, Tag, Rocket, MessageSquare } from 'lucide-react';
import { Widget, WidgetFooterLink } from './Widget';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatDistanceToNow } from 'date-fns';

interface ActivityItem {
  id: string;
  type: 'commit' | 'pull_request' | 'review' | 'release' | 'branch' | 'deployment';
  title: string;
  description?: string;
  timestamp: string;
  author: {
    name: string;
    avatar?: string;
    login?: string;
  };
  metadata?: {
    sha?: string;
    prNumber?: number;
    prState?: string;
    reviewState?: string;
    tagName?: string;
    branchName?: string;
    environment?: string;
    status?: string;
    githubUrl?: string;
  };
}

interface GitHubActivityWidgetProps {
  activities: ActivityItem[];
  isLoading?: boolean;
  workspaceId: string;
  projectSlug: string;
  repositoryConnected?: boolean;
}

const activityIcons: Record<string, React.ReactNode> = {
  commit: <GitCommit className="h-3.5 w-3.5" />,
  pull_request: <GitPullRequest className="h-3.5 w-3.5" />,
  review: <MessageSquare className="h-3.5 w-3.5" />,
  release: <Tag className="h-3.5 w-3.5" />,
  deployment: <Rocket className="h-3.5 w-3.5" />,
  branch: <GitMerge className="h-3.5 w-3.5" />,
};

const activityColors: Record<string, string> = {
  commit: 'text-blue-400',
  pull_request: 'text-purple-400',
  review: 'text-amber-400',
  release: 'text-emerald-400',
  deployment: 'text-cyan-400',
  branch: 'text-pink-400',
};

function ActivityRow({ activity }: { activity: ActivityItem }) {
  const timeAgo = formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true });

  return (
    <div className="flex items-start gap-3 py-2 px-2 rounded hover:bg-[#161616] transition-colors">
      {/* Icon */}
      <div className={cn("flex-shrink-0 mt-0.5", activityColors[activity.type] || 'text-[#666]')}>
        {activityIcons[activity.type] || <Github className="h-3.5 w-3.5" />}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#e6edf3]">{activity.author.name}</span>
          <span className="text-xs text-[#666]">{activity.title}</span>
        </div>
        {activity.description && (
          <p className="text-xs text-[#8b949e] truncate mt-0.5">
            {activity.description}
          </p>
        )}
        {activity.metadata?.prNumber && (
          <span className="text-[10px] text-[#666]">
            #{activity.metadata.prNumber}
          </span>
        )}
        {activity.metadata?.sha && (
          <span className="text-[10px] text-[#666] font-mono">
            {activity.metadata.sha.substring(0, 7)}
          </span>
        )}
      </div>

      {/* Timestamp */}
      <span className="text-[10px] text-[#666] flex-shrink-0">
        {timeAgo}
      </span>
    </div>
  );
}

function NoRepositoryState({ workspaceId, projectSlug }: { workspaceId: string; projectSlug: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-6 text-center">
      <Github className="h-10 w-10 text-[#333] mb-3" />
      <p className="text-sm text-[#666] mb-1">No repository connected</p>
      <p className="text-xs text-[#555] mb-3">
        Connect a GitHub repository to see activity
      </p>
      <a
        href={`/${workspaceId}/projects/${projectSlug}/github/settings`}
        className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
      >
        Connect Repository →
      </a>
    </div>
  );
}

export function GitHubActivityWidget({
  activities,
  isLoading = false,
  workspaceId,
  projectSlug,
  repositoryConnected = true,
}: GitHubActivityWidgetProps) {
  const isEmpty = activities.length === 0;

  // If no repository connected, show different state
  if (!repositoryConnected && !isLoading) {
    return (
      <Widget
        title="GitHub Activity"
        icon={<Github className="h-4 w-4" />}
        isLoading={false}
        isEmpty={false}
      >
        <NoRepositoryState workspaceId={workspaceId} projectSlug={projectSlug} />
      </Widget>
    );
  }

  return (
    <Widget
      title="GitHub Activity"
      icon={<Github className="h-4 w-4" />}
      isLoading={isLoading}
      isEmpty={isEmpty}
      emptyMessage="No recent GitHub activity"
      emptyIcon={<Github className="h-8 w-8" />}
    >
      <div className="space-y-0.5">
        {activities.slice(0, 8).map(activity => (
          <ActivityRow key={activity.id} activity={activity} />
        ))}

        {activities.length > 0 && (
          <WidgetFooterLink
            href={`/${workspaceId}/projects/${projectSlug}/github`}
            label="View all activity"
          />
        )}
      </div>
    </Widget>
  );
}

export default GitHubActivityWidget;
