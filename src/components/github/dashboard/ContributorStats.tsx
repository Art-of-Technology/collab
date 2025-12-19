'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Users,
  GitCommit,
  GitPullRequest,
  Loader2,
  MessageSquare,
  Award,
} from 'lucide-react';

interface Contributor {
  id: string;
  name: string;
  login: string;
  avatar?: string;
  email?: string;
  stats: {
    commits: number;
    pullRequests: number;
    reviews: number;
    linesAdded: number;
    linesRemoved: number;
  };
  recentActivity?: string;
}

interface ContributorStatsProps {
  repositoryId: string;
  compact?: boolean;
  limit?: number;
  showDetails?: boolean;
}

export function ContributorStats({
  repositoryId,
  compact = false,
  limit = 10,
  showDetails = false,
}: ContributorStatsProps) {
  const [contributors, setContributors] = useState<Contributor[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('all');

  useEffect(() => {
    fetchContributors();
  }, [repositoryId, timeRange]);

  const fetchContributors = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        limit: limit.toString(),
        timeRange,
      });
      const response = await fetch(
        `/api/github/repositories/${repositoryId}/contributors?${params}`
      );
      if (response.ok) {
        const data = await response.json();
        setContributors(data.contributors || []);
      }
    } catch (error) {
      console.error('Error fetching contributors:', error);
    } finally {
      setLoading(false);
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  const getTotalCommits = () => {
    return contributors.reduce((acc, c) => acc + c.stats.commits, 0);
  };

  const getContributionPercentage = (commits: number) => {
    const total = getTotalCommits();
    return total > 0 ? Math.round((commits / total) * 100) : 0;
  };

  const formatNumber = (num: number) => {
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}k`;
    }
    return num.toString();
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
            <Users className="h-5 w-5 text-purple-500" />
            <CardTitle className="text-lg text-[#e6edf3]">Contributors</CardTitle>
            <Badge variant="secondary" className="ml-2">
              {contributors.length}
            </Badge>
          </div>
          {showDetails && (
            <Tabs value={timeRange} onValueChange={setTimeRange} className="w-auto">
              <TabsList className="h-8 bg-[#21262d]">
                <TabsTrigger value="week" className="text-xs h-6 px-2">Week</TabsTrigger>
                <TabsTrigger value="month" className="text-xs h-6 px-2">Month</TabsTrigger>
                <TabsTrigger value="all" className="text-xs h-6 px-2">All Time</TabsTrigger>
              </TabsList>
            </Tabs>
          )}
        </div>
        {!compact && (
          <CardDescription>
            Team members contributing to this repository
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        {contributors.length === 0 ? (
          <div className="text-center py-8">
            <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-sm text-muted-foreground">No contributors found</p>
          </div>
        ) : (
          <ScrollArea className={compact ? 'h-[250px]' : 'h-[400px]'}>
            <div className="space-y-4">
              {contributors.map((contributor, index) => (
                <div
                  key={contributor.id}
                  className="flex items-start gap-3 p-3 rounded-lg hover:bg-[#161b22] transition-colors"
                >
                  {/* Rank */}
                  {showDetails && (
                    <div className="flex items-center justify-center w-6 h-6">
                      {index < 3 ? (
                        <Award
                          className={`h-5 w-5 ${
                            index === 0 ? 'text-yellow-500' :
                            index === 1 ? 'text-gray-400' :
                            'text-amber-600'
                          }`}
                        />
                      ) : (
                        <span className="text-xs text-[#8b949e]">#{index + 1}</span>
                      )}
                    </div>
                  )}

                  {/* Avatar */}
                  <Avatar className="h-10 w-10">
                    {contributor.avatar && (
                      <AvatarImage src={contributor.avatar} alt={contributor.name} />
                    )}
                    <AvatarFallback className="bg-[#21262d] text-[#e6edf3]">
                      {getInitials(contributor.name)}
                    </AvatarFallback>
                  </Avatar>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm text-[#e6edf3]">
                          {contributor.name}
                        </p>
                        <p className="text-xs text-[#8b949e]">@{contributor.login}</p>
                      </div>
                      {showDetails && (
                        <Badge variant="outline" className="text-xs">
                          {getContributionPercentage(contributor.stats.commits)}%
                        </Badge>
                      )}
                    </div>

                    {/* Stats */}
                    <div className="flex items-center gap-4 mt-2">
                      <div className="flex items-center gap-1 text-xs text-[#8b949e]">
                        <GitCommit className="h-3 w-3" />
                        <span>{formatNumber(contributor.stats.commits)}</span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-[#8b949e]">
                        <GitPullRequest className="h-3 w-3" />
                        <span>{contributor.stats.pullRequests}</span>
                      </div>
                      {showDetails && (
                        <>
                          <div className="flex items-center gap-1 text-xs text-[#8b949e]">
                            <MessageSquare className="h-3 w-3" />
                            <span>{contributor.stats.reviews}</span>
                          </div>
                          <div className="flex items-center gap-1 text-xs">
                            <span className="text-green-500">
                              +{formatNumber(contributor.stats.linesAdded)}
                            </span>
                            <span className="text-red-500">
                              -{formatNumber(contributor.stats.linesRemoved)}
                            </span>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Progress bar */}
                    {showDetails && (
                      <Progress
                        value={getContributionPercentage(contributor.stats.commits)}
                        className="h-1 mt-2 bg-[#21262d]"
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        {/* Summary Stats */}
        {showDetails && contributors.length > 0 && (
          <div className="mt-4 pt-4 border-t border-[#21262d]">
            <div className="grid grid-cols-4 gap-4">
              <div className="text-center">
                <p className="text-lg font-bold text-[#e6edf3]">
                  {formatNumber(getTotalCommits())}
                </p>
                <p className="text-xs text-[#8b949e]">Total Commits</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-[#e6edf3]">
                  {formatNumber(contributors.reduce((acc, c) => acc + c.stats.pullRequests, 0))}
                </p>
                <p className="text-xs text-[#8b949e]">Pull Requests</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-[#e6edf3]">
                  {formatNumber(contributors.reduce((acc, c) => acc + c.stats.reviews, 0))}
                </p>
                <p className="text-xs text-[#8b949e]">Reviews</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-green-500">
                  +{formatNumber(contributors.reduce((acc, c) => acc + c.stats.linesAdded, 0))}
                </p>
                <p className="text-xs text-[#8b949e]">Lines Added</p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
