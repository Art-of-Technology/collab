'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  GitCommit,
  GitPullRequest,
  Tag,
  GitBranch,
  Rocket,
  TrendingUp,
  CheckCircle,
  XCircle,
} from 'lucide-react';

interface Repository {
  id: string;
  fullName: string;
  versioningStrategy: string;
  developmentBranch?: string;
  branches: Array<{
    id: string;
    name: string;
  }>;
  _count: {
    commits: number;
    pullRequests: number;
    versions: number;
    releases: number;
  };
}

interface Stats {
  recentCommits: number;
  openPRs: number;
  mergedPRs: number;
  latestRelease?: {
    tagName: string;
    publishedAt: string;
    name: string;
  };
  deployments: {
    production: { status: string; deployedAt: string } | null;
    staging: { status: string; deployedAt: string } | null;
    development: { status: string; deployedAt: string } | null;
  };
  weeklyActivity: {
    commits: number;
    prs: number;
    releases: number;
  };
}

interface GitHubOverviewStatsProps {
  repository: Repository;
  stats: Stats | null;
}

export function GitHubOverviewStats({ repository, stats }: GitHubOverviewStatsProps) {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="space-y-6">
      {/* Main Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Commits */}
        <Card className="bg-[#0d1117] border-[#21262d]">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-[#8b949e]">Total Commits</p>
                <p className="text-2xl font-bold text-[#e6edf3]">
                  {repository._count.commits.toLocaleString()}
                </p>
                {stats?.weeklyActivity && (
                  <p className="text-xs text-green-500 flex items-center mt-1">
                    <TrendingUp className="h-3 w-3 mr-1" />
                    +{stats.weeklyActivity.commits} this week
                  </p>
                )}
              </div>
              <div className="p-3 bg-blue-500/10 rounded-lg">
                <GitCommit className="h-6 w-6 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Pull Requests */}
        <Card className="bg-[#0d1117] border-[#21262d]">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-[#8b949e]">Pull Requests</p>
                <p className="text-2xl font-bold text-[#e6edf3]">
                  {repository._count.pullRequests}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  {stats?.openPRs !== undefined && (
                    <Badge variant="outline" className="text-xs bg-green-500/10 text-green-400 border-green-500/30">
                      {stats.openPRs} open
                    </Badge>
                  )}
                  {stats?.mergedPRs !== undefined && (
                    <Badge variant="outline" className="text-xs bg-purple-500/10 text-purple-400 border-purple-500/30">
                      {stats.mergedPRs} merged
                    </Badge>
                  )}
                </div>
              </div>
              <div className="p-3 bg-purple-500/10 rounded-lg">
                <GitPullRequest className="h-6 w-6 text-purple-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Releases */}
        <Card className="bg-[#0d1117] border-[#21262d]">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-[#8b949e]">Releases</p>
                <p className="text-2xl font-bold text-[#e6edf3]">
                  {repository._count.releases}
                </p>
                {stats?.latestRelease && (
                  <p className="text-xs text-[#8b949e] mt-1">
                    Latest: <span className="text-[#58a6ff]">{stats.latestRelease.tagName}</span>
                  </p>
                )}
              </div>
              <div className="p-3 bg-green-500/10 rounded-lg">
                <Tag className="h-6 w-6 text-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Branches */}
        <Card className="bg-[#0d1117] border-[#21262d]">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-[#8b949e]">Active Branches</p>
                <p className="text-2xl font-bold text-[#e6edf3]">
                  {repository.branches.length}
                </p>
                <p className="text-xs text-[#8b949e] mt-1 capitalize">
                  {repository.versioningStrategy.toLowerCase().replace('_', '-')} flow
                </p>
              </div>
              <div className="p-3 bg-orange-500/10 rounded-lg">
                <GitBranch className="h-6 w-6 text-orange-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Environment Status */}
      <Card className="bg-[#0d1117] border-[#21262d]">
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 mb-4">
            <Rocket className="h-4 w-4 text-[#8b949e]" />
            <span className="text-sm font-medium text-[#e6edf3]">Environment Status</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Production */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-[#161b22] border border-[#21262d]">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${
                  stats?.deployments?.production?.status === 'SUCCESS' ? 'bg-green-500' :
                  stats?.deployments?.production?.status === 'FAILURE' ? 'bg-red-500' :
                  stats?.deployments?.production ? 'bg-yellow-500' : 'bg-gray-500'
                }`} />
                <div>
                  <p className="text-sm font-medium text-[#e6edf3]">Production</p>
                  <p className="text-xs text-[#8b949e]">
                    {stats?.deployments?.production
                      ? formatDate(stats.deployments.production.deployedAt)
                      : 'Not deployed'}
                  </p>
                </div>
              </div>
              {stats?.deployments?.production?.status === 'SUCCESS' && (
                <CheckCircle className="h-4 w-4 text-green-500" />
              )}
              {stats?.deployments?.production?.status === 'FAILURE' && (
                <XCircle className="h-4 w-4 text-red-500" />
              )}
            </div>

            {/* Staging */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-[#161b22] border border-[#21262d]">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${
                  stats?.deployments?.staging?.status === 'SUCCESS' ? 'bg-green-500' :
                  stats?.deployments?.staging?.status === 'FAILURE' ? 'bg-red-500' :
                  stats?.deployments?.staging ? 'bg-yellow-500' : 'bg-gray-500'
                }`} />
                <div>
                  <p className="text-sm font-medium text-[#e6edf3]">Staging</p>
                  <p className="text-xs text-[#8b949e]">
                    {stats?.deployments?.staging
                      ? formatDate(stats.deployments.staging.deployedAt)
                      : 'Not deployed'}
                  </p>
                </div>
              </div>
              {stats?.deployments?.staging?.status === 'SUCCESS' && (
                <CheckCircle className="h-4 w-4 text-green-500" />
              )}
            </div>

            {/* Development */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-[#161b22] border border-[#21262d]">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${
                  stats?.deployments?.development?.status === 'SUCCESS' ? 'bg-green-500' :
                  stats?.deployments?.development?.status === 'FAILURE' ? 'bg-red-500' :
                  stats?.deployments?.development ? 'bg-yellow-500' : 'bg-gray-500'
                }`} />
                <div>
                  <p className="text-sm font-medium text-[#e6edf3]">Development</p>
                  <p className="text-xs text-[#8b949e]">
                    {stats?.deployments?.development
                      ? formatDate(stats.deployments.development.deployedAt)
                      : 'Not deployed'}
                  </p>
                </div>
              </div>
              {stats?.deployments?.development?.status === 'SUCCESS' && (
                <CheckCircle className="h-4 w-4 text-green-500" />
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
