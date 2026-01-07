'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Activity,
  GitCommit,
  GitPullRequest,
  GitBranch,
  Tag,
  CheckCircle,
  XCircle,
  AlertCircle,
  Eye,
  ThumbsUp,
  ThumbsDown,
  Loader2,
  Filter,
  ExternalLink,
} from 'lucide-react';

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

interface ActivityFeedProps {
  repositoryId: string;
  compact?: boolean;
  limit?: number;
  showFilters?: boolean;
}

export function ActivityFeed({
  repositoryId,
  compact = false,
  limit = 20,
  showFilters = false,
}: ActivityFeedProps) {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetchActivity();
  }, [repositoryId, filter]);

  const fetchActivity = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        limit: limit.toString(),
        ...(filter !== 'all' && { type: filter }),
      });
      const response = await fetch(
        `/api/github/repositories/${repositoryId}/activity?${params}`
      );
      if (response.ok) {
        const data = await response.json();
        setActivities(data.activities || []);
      }
    } catch (error) {
      console.error('Error fetching activity:', error);
    } finally {
      setLoading(false);
    }
  };

  const getActivityIcon = (type: string, metadata?: any) => {
    switch (type) {
      case 'commit':
        return <GitCommit className="h-4 w-4 text-blue-400" />;
      case 'pull_request':
        const prColor = metadata?.prState === 'MERGED' ? 'text-purple-400' :
          metadata?.prState === 'OPEN' ? 'text-green-400' : 'text-red-400';
        return <GitPullRequest className={`h-4 w-4 ${prColor}`} />;
      case 'review':
        const reviewColor = metadata?.reviewState === 'APPROVED' ? 'text-green-400' :
          metadata?.reviewState === 'CHANGES_REQUESTED' ? 'text-red-400' : 'text-yellow-400';
        return metadata?.reviewState === 'APPROVED' ? (
          <ThumbsUp className={`h-4 w-4 ${reviewColor}`} />
        ) : metadata?.reviewState === 'CHANGES_REQUESTED' ? (
          <ThumbsDown className={`h-4 w-4 ${reviewColor}`} />
        ) : (
          <Eye className={`h-4 w-4 ${reviewColor}`} />
        );
      case 'release':
        return <Tag className="h-4 w-4 text-green-400" />;
      case 'branch':
        return <GitBranch className="h-4 w-4 text-orange-400" />;
      case 'deployment':
        const deployColor = metadata?.status === 'SUCCESS' ? 'text-green-400' :
          metadata?.status === 'FAILURE' ? 'text-red-400' : 'text-yellow-400';
        return metadata?.status === 'SUCCESS' ? (
          <CheckCircle className={`h-4 w-4 ${deployColor}`} />
        ) : metadata?.status === 'FAILURE' ? (
          <XCircle className={`h-4 w-4 ${deployColor}`} />
        ) : (
          <AlertCircle className={`h-4 w-4 ${deployColor}`} />
        );
      default:
        return <Activity className="h-4 w-4 text-gray-400" />;
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getActivityBadge = (type: string, metadata?: any) => {
    switch (type) {
      case 'pull_request':
        return (
          <Badge
            variant="outline"
            className={
              metadata?.prState === 'MERGED' ? 'border-purple-500/30 text-purple-400' :
              metadata?.prState === 'OPEN' ? 'border-green-500/30 text-green-400' :
              'border-red-500/30 text-red-400'
            }
          >
            {metadata?.prState?.toLowerCase() || 'pr'}
          </Badge>
        );
      case 'review':
        return (
          <Badge
            variant="outline"
            className={
              metadata?.reviewState === 'APPROVED' ? 'border-green-500/30 text-green-400' :
              metadata?.reviewState === 'CHANGES_REQUESTED' ? 'border-red-500/30 text-red-400' :
              'border-yellow-500/30 text-yellow-400'
            }
          >
            {metadata?.reviewState?.toLowerCase().replace('_', ' ') || 'review'}
          </Badge>
        );
      case 'deployment':
        return (
          <Badge
            variant="outline"
            className={
              metadata?.status === 'SUCCESS' ? 'border-green-500/30 text-green-400' :
              metadata?.status === 'FAILURE' ? 'border-red-500/30 text-red-400' :
              'border-yellow-500/30 text-yellow-400'
            }
          >
            {metadata?.environment || 'deploy'}
          </Badge>
        );
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <Card className="bg-[#0d1117] border-[#21262d]">
        <CardContent className="pt-6">
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-[#0d1117] border-[#21262d]">
      <CardHeader className={compact ? 'pb-2' : ''}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-500" />
            <CardTitle className="text-lg text-[#e6edf3]">Activity</CardTitle>
          </div>
          {showFilters && (
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-[150px] bg-transparent border-[#30363d]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent className="bg-[#161b22] border-[#30363d]">
                <SelectItem value="all">All Activity</SelectItem>
                <SelectItem value="commit">Commits</SelectItem>
                <SelectItem value="pull_request">Pull Requests</SelectItem>
                <SelectItem value="review">Reviews</SelectItem>
                <SelectItem value="release">Releases</SelectItem>
                <SelectItem value="deployment">Deployments</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
        {!compact && (
          <CardDescription>
            Recent commits, PRs, reviews, and deployments
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <div className="text-center py-8">
            <Activity className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-sm text-muted-foreground">No recent activity</p>
          </div>
        ) : (
          <ScrollArea className={compact ? 'h-[300px]' : 'h-[500px]'}>
            <div className="space-y-1">
              {activities.map((activity, index) => (
                <div
                  key={activity.id}
                  className="flex items-start gap-3 p-3 rounded-lg hover:bg-[#161b22] transition-colors"
                >
                  {/* Timeline connector */}
                  <div className="flex flex-col items-center">
                    <div className="p-2 bg-[#21262d] rounded-full">
                      {getActivityIcon(activity.type, activity.metadata)}
                    </div>
                    {index < activities.length - 1 && (
                      <div className="w-px h-full bg-[#21262d] mt-2" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm text-[#e6edf3]">
                            {activity.author.name}
                          </span>
                          <span className="text-sm text-[#8b949e]">
                            {activity.title}
                          </span>
                          {getActivityBadge(activity.type, activity.metadata)}
                        </div>
                        {activity.description && (
                          <p className="text-sm text-[#8b949e] mt-1 truncate">
                            {activity.description}
                          </p>
                        )}
                        {activity.metadata?.sha && (
                          <code className="text-xs text-[#58a6ff] font-mono mt-1 inline-block">
                            {activity.metadata.sha.substring(0, 7)}
                          </code>
                        )}
                      </div>
                      <div className="flex items-center gap-2 ml-2">
                        <span className="text-xs text-[#8b949e] whitespace-nowrap">
                          {formatTimestamp(activity.timestamp)}
                        </span>
                        {activity.metadata?.githubUrl && (
                          <a
                            href={activity.metadata.githubUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#8b949e] hover:text-[#58a6ff]"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
