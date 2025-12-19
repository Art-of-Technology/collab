'use client';

import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Github,
  GitBranch,
  GitCommit,
  GitPullRequest,
  Tag,
  ExternalLink,
  ArrowRight,
  Settings,
  Zap,
  CheckCircle,
} from 'lucide-react';
import { GitHubOAuthConnection } from './GitHubOAuthConnection';

interface Repository {
  id: string;
  fullName: string;
  isActive: boolean;
  syncedAt: Date | null;
  _count?: {
    branches: number;
    pullRequests: number;
    commits: number;
    versions: number;
    releases: number;
  };
}

interface GitHubConnectionCardProps {
  projectId: string;
  projectSlug: string;
  workspaceSlug: string;
  repository?: Repository | null;
  onUpdate?: () => void;
}

export function GitHubConnectionCard({
  projectId,
  projectSlug,
  workspaceSlug,
  repository,
  onUpdate,
}: GitHubConnectionCardProps) {
  const router = useRouter();

  const handleNavigateToDashboard = () => {
    router.push(`/${workspaceSlug}/projects/${projectSlug}/github`);
  };

  const handleNavigateToSettings = () => {
    router.push(`/${workspaceSlug}/projects/${projectSlug}/github/settings`);
  };

  // Not connected - show compact connection prompt
  if (!repository) {
    return (
      <Card className="bg-[#0d1117] border-[#21262d]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-[#e6edf3]">
            <Github className="h-5 w-5" />
            GitHub Integration
          </CardTitle>
          <CardDescription>
            Connect a GitHub repository to enable version tracking, automated changelogs, and deployment monitoring.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GitHubOAuthConnection
            projectId={projectId}
            onSuccess={onUpdate}
            compact={true}
          />
        </CardContent>
      </Card>
    );
  }

  // Connected - show summary with links to dedicated pages
  return (
    <Card className="bg-[#0d1117] border-[#21262d]">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#21262d] rounded-lg">
              <Github className="h-5 w-5 text-[#e6edf3]" />
            </div>
            <div>
              <CardTitle className="text-[#e6edf3] flex items-center gap-2">
                {repository.fullName}
                <Badge className="bg-green-500/10 text-green-400 border-green-500/30">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Connected
                </Badge>
              </CardTitle>
              <CardDescription>
                GitHub integration is active
              </CardDescription>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="border-[#30363d] bg-transparent hover:bg-[#21262d]"
            asChild
          >
            <a
              href={`https://github.com/${repository.fullName}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              View on GitHub
            </a>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Quick Stats */}
        <div className="grid grid-cols-4 gap-3">
          <div className="text-center p-3 bg-[#161b22] rounded-lg border border-[#21262d]">
            <div className="text-xl font-bold text-[#e6edf3]">{repository._count?.branches || 0}</div>
            <p className="text-xs text-[#8b949e] flex items-center justify-center gap-1">
              <GitBranch className="h-3 w-3" />
              Branches
            </p>
          </div>
          <div className="text-center p-3 bg-[#161b22] rounded-lg border border-[#21262d]">
            <div className="text-xl font-bold text-[#e6edf3]">{repository._count?.commits || 0}</div>
            <p className="text-xs text-[#8b949e] flex items-center justify-center gap-1">
              <GitCommit className="h-3 w-3" />
              Commits
            </p>
          </div>
          <div className="text-center p-3 bg-[#161b22] rounded-lg border border-[#21262d]">
            <div className="text-xl font-bold text-[#e6edf3]">{repository._count?.pullRequests || 0}</div>
            <p className="text-xs text-[#8b949e] flex items-center justify-center gap-1">
              <GitPullRequest className="h-3 w-3" />
              PRs
            </p>
          </div>
          <div className="text-center p-3 bg-[#161b22] rounded-lg border border-[#21262d]">
            <div className="text-xl font-bold text-[#e6edf3]">{repository._count?.releases || 0}</div>
            <p className="text-xs text-[#8b949e] flex items-center justify-center gap-1">
              <Tag className="h-3 w-3" />
              Releases
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button
            onClick={handleNavigateToDashboard}
            className="flex-1 bg-[#238636] hover:bg-[#2ea043] text-white"
          >
            <Zap className="h-4 w-4 mr-2" />
            Open Dashboard
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
          <Button
            onClick={handleNavigateToSettings}
            variant="outline"
            className="border-[#30363d] bg-transparent hover:bg-[#21262d]"
          >
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
