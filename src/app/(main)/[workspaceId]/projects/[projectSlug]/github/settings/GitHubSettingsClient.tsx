'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ArrowLeft,
  Github,
  GitBranch,
  GitCommit,
  GitPullRequest,
  Tag,
  Settings,
  ExternalLink,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Link2,
  Unlink,
  Clock,
  Webhook,
  Code,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { GitHubOAuthConnection } from '@/components/github/GitHubOAuthConnection';
import { VisualBranchMapper } from '@/components/github/settings/VisualBranchMapper';
import { WebhookStatus } from '@/components/github/settings/WebhookStatus';
import { VersioningConfig } from '@/components/github/settings/VersioningConfig';

interface Branch {
  id: string;
  name: string;
  headSha: string;
  isDefault?: boolean;
  isProtected?: boolean;
  createdAt: string;
}

interface Repository {
  id: string;
  fullName: string;
  owner: string;
  name: string;
  defaultBranch?: string;
  developmentBranch?: string;
  versioningStrategy: string;
  branchEnvironmentMap?: Record<string, string>;
  issueTypeMapping?: Record<string, string>;
  webhookId?: string | null;
  webhookSecret?: string;
  syncedAt?: string | null;
  branches: Branch[];
  _count: {
    commits: number;
    pullRequests: number;
    versions: number;
    releases: number;
    branches: number;
  };
}

interface ProjectStatus {
  id: string;
  name: string;
  color: string;
  order: number;
  isDefault?: boolean;
}

interface Project {
  id: string;
  name: string;
  slug: string;
  issuePrefix: string;
  statuses: ProjectStatus[];
}

interface GitHubSettingsClientProps {
  project: Project;
  repository: Repository | null;
  workspaceSlug: string;
}

type TabType = 'connection' | 'branches' | 'versioning' | 'webhooks';

export function GitHubSettingsClient({
  project,
  repository,
  workspaceSlug,
}: GitHubSettingsClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>('connection');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [repoData, setRepoData] = useState(repository);
  const [githubBranches, setGithubBranches] = useState<string[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);

  useEffect(() => {
    if (repoData?.id) {
      fetchGitHubBranches();
    }
  }, [repoData?.id]);

  const fetchGitHubBranches = async () => {
    if (!repoData?.id) return;

    try {
      setLoadingBranches(true);
      const response = await fetch(`/api/github/repositories/${repoData.id}/github-branches`);
      if (response.ok) {
        const data = await response.json();
        const branchNames = (data.branches || []).map((b: { name: string }) => b.name);
        setGithubBranches(branchNames);
      }
    } catch (error) {
      console.error('Error fetching GitHub branches:', error);
    } finally {
      setLoadingBranches(false);
    }
  };

  const handleSync = async () => {
    if (!repoData?.id) return;

    setIsSyncing(true);
    try {
      const response = await fetch(`/api/github/repositories/${repoData.id}/sync`, {
        method: 'POST',
      });

      const data = await response.json();

      if (response.ok) {
        const { results, errors } = data;
        if (errors && errors.length > 0) {
          toast.warning(`Synced with warnings: ${results.branches} branches, ${results.commits} commits`);
        } else {
          toast.success(`Synced: ${results.branches} branches, ${results.commits} commits, ${results.releases} releases`);
        }
        router.refresh();
        fetchGitHubBranches();
      } else {
        toast.error(data.error || 'Failed to sync with GitHub');
      }
    } catch (error) {
      toast.error('Failed to sync with GitHub');
      console.error('Sync error:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    if (!repoData?.id) return;

    if (!confirm('Are you sure you want to disconnect this repository? This will remove all webhook configurations.')) {
      return;
    }

    setIsDisconnecting(true);
    try {
      const response = await fetch(`/api/github/repositories/${repoData.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast.success('Repository disconnected');
        setRepoData(null);
        router.refresh();
      } else {
        toast.error('Failed to disconnect repository');
      }
    } catch (error) {
      toast.error('Failed to disconnect repository');
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleConnectionSuccess = () => {
    router.refresh();
  };

  const handleBack = () => {
    router.push(`/${workspaceSlug}/projects/${project.slug}/github`);
  };

  const tabs = [
    { id: 'connection' as const, label: 'Connection', icon: Link2 },
    { id: 'branches' as const, label: 'Branches', icon: GitBranch },
    { id: 'versioning' as const, label: 'Versioning', icon: Tag },
    { id: 'webhooks' as const, label: 'Webhooks', icon: Webhook },
  ];

  // No repository connected
  if (!repoData) {
    return (
      <div className="h-full flex flex-col bg-[#0a0a0b]">
        {/* Header */}
        <div className="flex-none border-b border-[#1f1f1f]">
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#1a1a1b] flex items-center justify-center">
                <Settings className="h-4 w-4 text-[#e6edf3]" />
              </div>
              <div>
                <h1 className="text-sm font-medium text-[#e6edf3]">GitHub Settings</h1>
                <p className="text-xs text-[#6e7681]">{project.name} - Connect your repository</p>
              </div>
            </div>
            <Button
              onClick={handleBack}
              variant="ghost"
              size="sm"
              className="h-8 px-3 text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#1a1a1b]"
            >
              <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
              Back
            </Button>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md w-full">
            <GitHubOAuthConnection
              projectId={project.id}
              onSuccess={handleConnectionSuccess}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#0a0a0b]">
      {/* Header */}
      <div className="flex-none border-b border-[#1f1f1f]">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#1a1a1b] flex items-center justify-center">
              <Settings className="h-4 w-4 text-[#e6edf3]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-medium text-[#e6edf3]">GitHub Settings</h1>
                <a
                  href={`https://github.com/${repoData.fullName}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[#58a6ff] hover:underline flex items-center gap-1"
                >
                  {repoData.fullName}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <p className="text-xs text-[#6e7681]">{project.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleBack}
              variant="ghost"
              size="sm"
              className="h-8 px-3 text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#1a1a1b]"
            >
              <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
              Back
            </Button>
            <Button
              onClick={handleSync}
              variant="ghost"
              size="sm"
              disabled={isSyncing}
              className="h-8 px-3 text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#1a1a1b]"
            >
              <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", isSyncing && "animate-spin")} />
              {isSyncing ? 'Syncing' : 'Sync'}
            </Button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 px-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-t-md transition-colors relative",
                activeTab === tab.id
                  ? "text-[#e6edf3] bg-[#0d0d0e]"
                  : "text-[#8b949e] hover:text-[#e6edf3]"
              )}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#58a6ff]" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-6">
          {/* Connection Tab */}
          {activeTab === 'connection' && (
            <div className="space-y-6 max-w-4xl">
              {/* Repository Status */}
              <div className="rounded-lg border border-[#1f1f1f] bg-[#0d0d0e] overflow-hidden">
                <div className="px-4 py-3 border-b border-[#1f1f1f] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Github className="h-5 w-5 text-[#e6edf3]" />
                    <div>
                      <h3 className="text-sm font-medium text-[#e6edf3]">{repoData.fullName}</h3>
                      <p className="text-xs text-[#6e7681]">Connected repository</p>
                    </div>
                  </div>
                  <Badge className="bg-green-500/10 text-green-400 border-green-500/30">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Connected
                  </Badge>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-5 divide-x divide-[#1f1f1f]">
                  <StatItem icon={GitBranch} label="Branches" value={repoData._count.branches} />
                  <StatItem icon={GitCommit} label="Commits" value={repoData._count.commits} />
                  <StatItem icon={GitPullRequest} label="PRs" value={repoData._count.pullRequests} />
                  <StatItem icon={Tag} label="Releases" value={repoData._count.releases} />
                  <StatItem icon={Code} label="Versions" value={repoData._count.versions} />
                </div>

                {/* Last Sync */}
                <div className="px-4 py-3 border-t border-[#1f1f1f] flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-[#6e7681]">
                    <Clock className="h-3.5 w-3.5" />
                    {repoData.syncedAt
                      ? `Last synced ${formatDistanceToNow(new Date(repoData.syncedAt), { addSuffix: true })}`
                      : 'Never synced'}
                  </div>
                  <Button
                    onClick={handleSync}
                    variant="ghost"
                    size="sm"
                    disabled={isSyncing}
                    className="h-7 px-2 text-xs text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#161617]"
                  >
                    {isSyncing ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : (
                      <RefreshCw className="h-3 w-3 mr-1" />
                    )}
                    Sync Now
                  </Button>
                </div>
              </div>

              {/* No data hint */}
              {repoData._count.commits === 0 && repoData._count.branches === 0 && (
                <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-4 py-3 flex items-start gap-3">
                  <AlertCircle className="h-4 w-4 text-yellow-500 mt-0.5" />
                  <div>
                    <p className="text-sm text-yellow-200">No data synced yet</p>
                    <p className="text-xs text-yellow-200/70 mt-0.5">
                      Click "Sync Now" to fetch branches, commits, and releases from GitHub.
                    </p>
                  </div>
                </div>
              )}

              {/* Danger Zone */}
              <div className="rounded-lg border border-red-500/30 bg-[#0d0d0e] overflow-hidden">
                <div className="px-4 py-3 border-b border-red-500/20">
                  <h3 className="text-sm font-medium text-red-400">Danger Zone</h3>
                </div>
                <div className="px-4 py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-[#e6edf3]">Disconnect Repository</p>
                      <p className="text-xs text-[#6e7681] mt-0.5">
                        Remove this repository connection and all webhooks.
                      </p>
                    </div>
                    <Button
                      onClick={handleDisconnect}
                      variant="destructive"
                      size="sm"
                      disabled={isDisconnecting}
                      className="h-8"
                    >
                      {isDisconnecting ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                      ) : (
                        <Unlink className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      Disconnect
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Branches Tab */}
          {activeTab === 'branches' && (
            <VisualBranchMapper
              repositoryId={repoData.id}
              repositoryBranches={repoData.branches}
              githubBranches={githubBranches}
              loadingBranches={loadingBranches}
              projectStatuses={project.statuses}
              currentMapping={repoData.branchEnvironmentMap || {}}
              onRefreshBranches={fetchGitHubBranches}
            />
          )}

          {/* Versioning Tab */}
          {activeTab === 'versioning' && (
            <VersioningConfig
              repositoryId={repoData.id}
              currentConfig={{
                versioningStrategy: (repoData.versioningStrategy as 'SEMANTIC' | 'CALVER' | 'CUSTOM') || 'SEMANTIC',
                autoVersioning: true,
                versionPrefix: 'v',
                releaseBranch: repoData.defaultBranch || 'main',
                autoGenerateChangelog: true,
                includeCommitsInChangelog: true,
                includePRsInChangelog: true,
              }}
              branches={githubBranches}
            />
          )}

          {/* Webhooks Tab */}
          {activeTab === 'webhooks' && (
            <WebhookStatus
              repositoryId={repoData.id}
              repositoryUrl={`https://github.com/${repoData.fullName}`}
              webhookSecret={repoData.webhookSecret}
              isConnected={true}
            />
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// Stat Item Component
function StatItem({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: number }) {
  return (
    <div className="px-4 py-3 text-center">
      <div className="text-lg font-semibold text-[#e6edf3]">{value}</div>
      <div className="text-xs text-[#6e7681] flex items-center justify-center gap-1 mt-0.5">
        <Icon className="h-3 w-3" />
        {label}
      </div>
    </div>
  );
}
