'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import {
  GitBranch,
  GitCommit,
  GitPullRequest,
  Tag,
  ExternalLink,
  RefreshCw,
  Settings,
  Sparkles,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Github,
  GitMerge,
  Circle,
  Rocket,
  Search,
  XCircle,
  MessageSquare,
  User,
  Calendar,
  FileCode,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatDistanceToNow, format } from 'date-fns';

interface Repository {
  id: string;
  fullName: string;
  owner: string;
  name: string;
  defaultBranch?: string;
  versioningStrategy: string;
  developmentBranch?: string;
  branches: Array<{
    id: string;
    name: string;
    headSha: string;
    createdAt: string;
  }>;
  _count: {
    commits: number;
    pullRequests: number;
    versions: number;
    releases: number;
  };
}

interface Project {
  id: string;
  name: string;
  slug: string;
  issuePrefix: string;
}

interface GitHubDashboardClientProps {
  project: Project;
  repository: Repository | null;
  workspaceSlug: string;
}

interface DashboardStats {
  commits: { total: number; thisWeek: number };
  pullRequests: { open: number; merged: number; total: number };
  releases: { total: number; latest?: { tagName: string; publishedAt: string } };
  branches: { total: number; active: number };
}

interface Commit {
  id: string;
  sha: string;
  message: string;
  authorName: string;
  authorEmail?: string;
  commitDate: string;
}

interface PullRequest {
  id: string;
  githubPrId: number;
  title: string;
  state: string;
  createdAt: string;
  mergedAt?: string;
  closedAt?: string;
  authorName?: string;
}

interface Release {
  id: string;
  tagName: string;
  name: string;
  description?: string;
  publishedAt?: string;
  isDraft: boolean;
  isPrerelease: boolean;
  githubUrl?: string;
}

interface Branch {
  id: string;
  name: string;
  headSha: string;
  isDefault: boolean;
  isProtected: boolean;
  createdAt: string;
  updatedAt: string;
}

type ViewType = 'overview' | 'commits' | 'pullrequests' | 'releases' | 'branches';

export function GitHubDashboardClient({
  project,
  repository,
  workspaceSlug,
}: GitHubDashboardClientProps) {
  const router = useRouter();
  const [activeView, setActiveView] = useState<ViewType>('overview');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [pullRequests, setPullRequests] = useState<PullRequest[]>([]);
  const [releases, setReleases] = useState<Release[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Auto-sync on mount
  const syncAndFetch = useCallback(async (showToast = false) => {
    if (!repository?.id) return;

    setIsSyncing(true);
    try {
      // Sync from GitHub
      const syncResponse = await fetch(`/api/github/repositories/${repository.id}/sync`, {
        method: 'POST',
      });

      if (syncResponse.ok) {
        const syncData = await syncResponse.json();
        setLastSynced(new Date());

        if (showToast) {
          const { results } = syncData;
          toast.success(`Synced ${results.branches} branches, ${results.commits} commits`);
        }
      }

      // Fetch all data
      await fetchAllData();
    } catch (error) {
      console.error('Error syncing:', error);
      if (showToast) {
        toast.error('Failed to sync with GitHub');
      }
    } finally {
      setIsSyncing(false);
      setLoading(false);
    }
  }, [repository?.id]);

  const fetchAllData = async () => {
    if (!repository?.id) return;

    try {
      const [dashboardRes, commitsRes, prsRes, releasesRes, branchesRes] = await Promise.all([
        fetch(`/api/github/repositories/${repository.id}/dashboard`),
        fetch(`/api/github/repositories/${repository.id}/commits?limit=50`),
        fetch(`/api/github/repositories/${repository.id}/pull-requests?limit=50`),
        fetch(`/api/github/repositories/${repository.id}/releases?limit=30`),
        fetch(`/api/github/repositories/${repository.id}/github-branches`),
      ]);

      if (dashboardRes.ok) {
        const data = await dashboardRes.json();
        setStats(data);
      }

      if (commitsRes.ok) {
        const data = await commitsRes.json();
        setCommits(data.commits || []);
      }

      if (prsRes.ok) {
        const data = await prsRes.json();
        setPullRequests(data.pullRequests || []);
      }

      if (releasesRes.ok) {
        const data = await releasesRes.json();
        setReleases(data.releases || []);
      }

      if (branchesRes.ok) {
        const data = await branchesRes.json();
        setBranches(data.branches || []);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  };

  useEffect(() => {
    if (repository?.id) {
      syncAndFetch(false);
    } else {
      setLoading(false);
    }
  }, [repository?.id, syncAndFetch]);

  const handleManualRefresh = () => {
    setIsRefreshing(true);
    syncAndFetch(true).finally(() => setIsRefreshing(false));
  };

  // Filter data based on search
  const filteredCommits = commits.filter(c =>
    c.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.authorName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredPRs = pullRequests.filter(pr =>
    pr.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredReleases = releases.filter(r =>
    r.tagName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredBranches = branches.filter(b =>
    b.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // No repository connected
  if (!repository) {
    return (
      <div className="h-full flex flex-col bg-[#0a0a0b]">
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center max-w-sm">
            <div className="w-12 h-12 rounded-full bg-[#1a1a1b] flex items-center justify-center mx-auto mb-4">
              <Github className="h-6 w-6 text-[#6e7681]" />
            </div>
            <h2 className="text-lg font-medium text-[#e6edf3] mb-2">Connect a Repository</h2>
            <p className="text-sm text-[#8b949e] mb-6">
              Link a GitHub repository to track commits, releases, and deployments.
            </p>
            <Button
              onClick={() => router.push(`/${workspaceSlug}/projects/${project.slug}/github/settings`)}
              className="bg-[#238636] hover:bg-[#2ea043] text-white"
            >
              Connect Repository
            </Button>
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
              <Github className="h-4 w-4 text-[#e6edf3]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-medium text-[#e6edf3]">{repository.fullName}</h1>
                <a
                  href={`https://github.com/${repository.fullName}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#8b949e] hover:text-[#e6edf3] transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
              <div className="flex items-center gap-2 text-xs text-[#6e7681]">
                <span className="flex items-center gap-1">
                  <GitBranch className="h-3 w-3" />
                  {repository.defaultBranch || 'main'}
                </span>
                {lastSynced && (
                  <>
                    <span>·</span>
                    <span>Synced {formatDistanceToNow(lastSynced, { addSuffix: true })}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleManualRefresh}
              variant="ghost"
              size="sm"
              disabled={isRefreshing || isSyncing}
              className="h-8 px-3 text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#1a1a1b]"
            >
              <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", (isRefreshing || isSyncing) && "animate-spin")} />
              {isSyncing ? 'Syncing' : 'Refresh'}
            </Button>
            <Button
              onClick={() => router.push(`/${workspaceSlug}/projects/${project.slug}/github/settings`)}
              variant="ghost"
              size="sm"
              className="h-8 px-3 text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#1a1a1b]"
            >
              <Settings className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6">
          {loading ? (
            <LoadingSkeleton />
          ) : (
            <>
              {/* Stats Grid - Clickable */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard
                  label="Commits"
                  value={stats?.commits?.total ?? commits.length}
                  subValue={stats?.commits?.thisWeek ? `+${stats.commits.thisWeek} this week` : undefined}
                  icon={GitCommit}
                  active={activeView === 'commits'}
                  onClick={() => setActiveView(activeView === 'commits' ? 'overview' : 'commits')}
                />
                <StatCard
                  label="Pull Requests"
                  value={stats?.pullRequests?.total ?? pullRequests.length}
                  subValue={stats?.pullRequests?.open ? `${stats.pullRequests.open} open` : undefined}
                  icon={GitPullRequest}
                  iconColor="text-[#a371f7]"
                  active={activeView === 'pullrequests'}
                  onClick={() => setActiveView(activeView === 'pullrequests' ? 'overview' : 'pullrequests')}
                />
                <StatCard
                  label="Releases"
                  value={stats?.releases?.total ?? releases.length}
                  subValue={stats?.releases?.latest?.tagName}
                  icon={Tag}
                  iconColor="text-[#3fb950]"
                  active={activeView === 'releases'}
                  onClick={() => setActiveView(activeView === 'releases' ? 'overview' : 'releases')}
                />
                <StatCard
                  label="Branches"
                  value={stats?.branches?.total ?? branches.length}
                  subValue={stats?.branches?.active ? `${stats.branches.active} active` : undefined}
                  icon={GitBranch}
                  iconColor="text-[#58a6ff]"
                  active={activeView === 'branches'}
                  onClick={() => setActiveView(activeView === 'branches' ? 'overview' : 'branches')}
                />
              </div>

              {/* Active View */}
              {activeView !== 'overview' && (
                <div className="space-y-4">
                  {/* Back button and search */}
                  <div className="flex items-center justify-between">
                    <Button
                      onClick={() => setActiveView('overview')}
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#1a1a1b]"
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Back to Overview
                    </Button>
                    <div className="relative w-64">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6e7681]" />
                      <Input
                        placeholder="Search..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9 h-8 bg-[#0d0d0e] border-[#1f1f1f] text-[#e6edf3] placeholder:text-[#6e7681]"
                      />
                    </div>
                  </div>

                  {/* Detail View */}
                  {activeView === 'commits' && (
                    <CommitsView commits={filteredCommits} repoFullName={repository.fullName} />
                  )}
                  {activeView === 'pullrequests' && (
                    <PullRequestsView pullRequests={filteredPRs} repoFullName={repository.fullName} />
                  )}
                  {activeView === 'releases' && (
                    <ReleasesView releases={filteredReleases} />
                  )}
                  {activeView === 'branches' && (
                    <BranchesView branches={filteredBranches} repoFullName={repository.fullName} defaultBranch={repository.defaultBranch} />
                  )}
                </div>
              )}

              {/* Overview Content */}
              {activeView === 'overview' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Recent Commits */}
                  <div className="space-y-3">
                    <SectionHeader
                      title="Recent Commits"
                      icon={GitCommit}
                      count={commits.length}
                      onViewAll={() => setActiveView('commits')}
                    />
                    <div className="rounded-lg border border-[#1f1f1f] bg-[#0d0d0e] overflow-hidden">
                      {commits.length === 0 ? (
                        <EmptyState message="No commits yet" />
                      ) : (
                        <div className="divide-y divide-[#1f1f1f]">
                          {commits.slice(0, 5).map((commit) => (
                            <CommitRow key={commit.id} commit={commit} repoFullName={repository.fullName} />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Recent Pull Requests */}
                  <div className="space-y-3">
                    <SectionHeader
                      title="Pull Requests"
                      icon={GitPullRequest}
                      count={pullRequests.length}
                      onViewAll={() => setActiveView('pullrequests')}
                    />
                    <div className="rounded-lg border border-[#1f1f1f] bg-[#0d0d0e] overflow-hidden">
                      {pullRequests.length === 0 ? (
                        <EmptyState message="No pull requests yet" />
                      ) : (
                        <div className="divide-y divide-[#1f1f1f]">
                          {pullRequests.slice(0, 5).map((pr) => (
                            <PullRequestRow key={pr.id} pr={pr} repoFullName={repository.fullName} />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Releases */}
                  <div className="space-y-3">
                    <SectionHeader
                      title="Releases"
                      icon={Tag}
                      count={releases.length}
                      onViewAll={() => setActiveView('releases')}
                    />
                    <div className="rounded-lg border border-[#1f1f1f] bg-[#0d0d0e] overflow-hidden">
                      {releases.length === 0 ? (
                        <EmptyState message="No releases yet" />
                      ) : (
                        <div className="divide-y divide-[#1f1f1f]">
                          {releases.slice(0, 5).map((release) => (
                            <ReleaseRow key={release.id} release={release} />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Branches */}
                  <div className="space-y-3">
                    <SectionHeader
                      title="Branches"
                      icon={GitBranch}
                      count={branches.length}
                      onViewAll={() => setActiveView('branches')}
                    />
                    <div className="rounded-lg border border-[#1f1f1f] bg-[#0d0d0e] overflow-hidden">
                      {branches.length === 0 ? (
                        <EmptyState message="No branches synced" />
                      ) : (
                        <div className="divide-y divide-[#1f1f1f]">
                          {branches.slice(0, 5).map((branch) => (
                            <BranchRow
                              key={branch.id || branch.name}
                              branch={branch}
                              isDefault={branch.name === repository.defaultBranch || branch.isDefault}
                              repoFullName={repository.fullName}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Quick Actions */}
              {activeView === 'overview' && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-[#e6edf3]">Quick Actions</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <QuickActionButton
                      icon={GitPullRequest}
                      label="New Pull Request"
                      href={`https://github.com/${repository.fullName}/compare`}
                    />
                    <QuickActionButton
                      icon={Tag}
                      label="Create Release"
                      href={`https://github.com/${repository.fullName}/releases/new`}
                    />
                    <QuickActionButton
                      icon={Sparkles}
                      label="View Changelog"
                      onClick={() => router.push(`/${workspaceSlug}/projects/${project.slug}/changelog`)}
                    />
                    <QuickActionButton
                      icon={FileCode}
                      label="View Code"
                      href={`https://github.com/${repository.fullName}`}
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// Sub-components
function StatCard({
  label,
  value,
  subValue,
  icon: Icon,
  iconColor = 'text-[#8b949e]',
  active,
  onClick,
}: {
  label: string;
  value: number;
  subValue?: string;
  icon: React.ElementType;
  iconColor?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-lg border p-4 text-left transition-all",
        active
          ? "border-[#58a6ff] bg-[#58a6ff]/10"
          : "border-[#1f1f1f] bg-[#0d0d0e] hover:border-[#30363d] hover:bg-[#161617]"
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-[#8b949e]">{label}</span>
        <Icon className={cn("h-4 w-4", active ? "text-[#58a6ff]" : iconColor)} />
      </div>
      <div className="text-2xl font-semibold text-[#e6edf3]">{value}</div>
      {subValue && (
        <div className="text-xs text-[#6e7681] mt-1">{subValue}</div>
      )}
    </button>
  );
}

function SectionHeader({
  title,
  icon: Icon,
  count,
  onViewAll,
}: {
  title: string;
  icon: React.ElementType;
  count: number;
  onViewAll: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-[#8b949e]" />
        <h3 className="text-sm font-medium text-[#e6edf3]">{title}</h3>
        <Badge variant="secondary" className="h-5 px-1.5 text-[10px] bg-[#1f1f1f] text-[#8b949e]">
          {count}
        </Badge>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={onViewAll}
        className="h-6 px-2 text-xs text-[#8b949e] hover:text-[#e6edf3]"
      >
        View all
        <ChevronRight className="h-3 w-3 ml-1" />
      </Button>
    </div>
  );
}

// Detail Views
function CommitsView({ commits, repoFullName }: { commits: Commit[]; repoFullName: string }) {
  return (
    <div className="rounded-lg border border-[#1f1f1f] bg-[#0d0d0e] overflow-hidden">
      {commits.length === 0 ? (
        <EmptyState message="No commits found" />
      ) : (
        <div className="divide-y divide-[#1f1f1f]">
          {commits.map((commit) => (
            <CommitRow key={commit.id} commit={commit} repoFullName={repoFullName} detailed />
          ))}
        </div>
      )}
    </div>
  );
}

function PullRequestsView({ pullRequests, repoFullName }: { pullRequests: PullRequest[]; repoFullName: string }) {
  return (
    <div className="rounded-lg border border-[#1f1f1f] bg-[#0d0d0e] overflow-hidden">
      {pullRequests.length === 0 ? (
        <EmptyState message="No pull requests found" />
      ) : (
        <div className="divide-y divide-[#1f1f1f]">
          {pullRequests.map((pr) => (
            <PullRequestRow key={pr.id} pr={pr} repoFullName={repoFullName} detailed />
          ))}
        </div>
      )}
    </div>
  );
}

function ReleasesView({ releases }: { releases: Release[] }) {
  return (
    <div className="rounded-lg border border-[#1f1f1f] bg-[#0d0d0e] overflow-hidden">
      {releases.length === 0 ? (
        <EmptyState message="No releases found" />
      ) : (
        <div className="divide-y divide-[#1f1f1f]">
          {releases.map((release) => (
            <ReleaseRow key={release.id} release={release} detailed />
          ))}
        </div>
      )}
    </div>
  );
}

function BranchesView({ branches, repoFullName, defaultBranch }: { branches: Branch[]; repoFullName: string; defaultBranch?: string }) {
  return (
    <div className="rounded-lg border border-[#1f1f1f] bg-[#0d0d0e] overflow-hidden">
      {branches.length === 0 ? (
        <EmptyState message="No branches found" />
      ) : (
        <div className="divide-y divide-[#1f1f1f]">
          {branches.map((branch) => (
            <BranchRow
              key={branch.id || branch.name}
              branch={branch}
              isDefault={branch.name === defaultBranch || branch.isDefault}
              repoFullName={repoFullName}
              detailed
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Row Components
function CommitRow({ commit, repoFullName, detailed }: { commit: Commit; repoFullName: string; detailed?: boolean }) {
  const firstLine = commit.message.split('\n')[0];
  return (
    <a
      href={`https://github.com/${repoFullName}/commit/${commit.sha}`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start gap-3 px-4 py-3 hover:bg-[#161617] transition-colors group"
    >
      <GitCommit className="h-4 w-4 text-[#8b949e] mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm text-[#e6edf3]", !detailed && "truncate")}>{firstLine}</p>
        <div className="flex items-center gap-2 mt-1 text-xs text-[#6e7681]">
          <span className="font-mono">{commit.sha.substring(0, 7)}</span>
          <span>·</span>
          <span>{commit.authorName}</span>
          <span>·</span>
          <span>{formatDistanceToNow(new Date(commit.commitDate), { addSuffix: true })}</span>
        </div>
      </div>
      <ArrowUpRight className="h-3.5 w-3.5 text-[#6e7681] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
    </a>
  );
}

function PullRequestRow({ pr, repoFullName, detailed }: { pr: PullRequest; repoFullName: string; detailed?: boolean }) {
  const getStateColor = (state: string) => {
    switch (state.toUpperCase()) {
      case 'OPEN': return 'text-[#3fb950]';
      case 'MERGED': return 'text-[#a371f7]';
      case 'CLOSED': return 'text-[#f85149]';
      default: return 'text-[#8b949e]';
    }
  };

  const getStateIcon = (state: string) => {
    switch (state.toUpperCase()) {
      case 'OPEN': return <GitPullRequest className={cn("h-4 w-4", getStateColor(state))} />;
      case 'MERGED': return <GitMerge className={cn("h-4 w-4", getStateColor(state))} />;
      case 'CLOSED': return <XCircle className={cn("h-4 w-4", getStateColor(state))} />;
      default: return <GitPullRequest className="h-4 w-4 text-[#8b949e]" />;
    }
  };

  return (
    <a
      href={`https://github.com/${repoFullName}/pull/${pr.githubPrId}`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start gap-3 px-4 py-3 hover:bg-[#161617] transition-colors group"
    >
      {getStateIcon(pr.state)}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn("text-sm text-[#e6edf3]", !detailed && "truncate")}>{pr.title}</span>
          <span className="text-xs text-[#6e7681]">#{pr.githubPrId}</span>
        </div>
        <div className="flex items-center gap-2 mt-1 text-xs text-[#6e7681]">
          <Badge variant="secondary" className={cn("h-4 px-1 text-[10px] bg-transparent border", getStateColor(pr.state))}>
            {pr.state.toLowerCase()}
          </Badge>
          {pr.authorName && (
            <>
              <span>·</span>
              <span>{pr.authorName}</span>
            </>
          )}
          <span>·</span>
          <span>{formatDistanceToNow(new Date(pr.mergedAt || pr.closedAt || pr.createdAt), { addSuffix: true })}</span>
        </div>
      </div>
      <ArrowUpRight className="h-3.5 w-3.5 text-[#6e7681] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
    </a>
  );
}

function ReleaseRow({ release, detailed }: { release: Release; detailed?: boolean }) {
  return (
    <a
      href={release.githubUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start gap-3 px-4 py-3 hover:bg-[#161617] transition-colors group"
    >
      <Tag className="h-4 w-4 text-[#3fb950] mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[#e6edf3]">{release.tagName}</span>
          {release.isPrerelease && (
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px] bg-[#1f1f1f] text-[#f0883e]">
              Pre-release
            </Badge>
          )}
          {release.isDraft && (
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px] bg-[#1f1f1f] text-[#8b949e]">
              Draft
            </Badge>
          )}
        </div>
        {release.name && release.name !== release.tagName && (
          <p className={cn("text-xs text-[#6e7681] mt-0.5", !detailed && "truncate")}>{release.name}</p>
        )}
        {detailed && release.description && (
          <p className="text-xs text-[#6e7681] mt-1 line-clamp-2">{release.description}</p>
        )}
        {release.publishedAt && (
          <div className="text-xs text-[#6e7681] mt-1">
            {formatDistanceToNow(new Date(release.publishedAt), { addSuffix: true })}
          </div>
        )}
      </div>
      <ArrowUpRight className="h-3.5 w-3.5 text-[#6e7681] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
    </a>
  );
}

function BranchRow({
  branch,
  isDefault,
  repoFullName,
  detailed,
}: {
  branch: Branch | { name: string; sha?: string; isDefault?: boolean; isProtected?: boolean };
  isDefault: boolean;
  repoFullName: string;
  detailed?: boolean;
}) {
  const sha = 'headSha' in branch ? branch.headSha : ('sha' in branch ? branch.sha : undefined);
  return (
    <a
      href={`https://github.com/${repoFullName}/tree/${branch.name}`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 px-4 py-3 hover:bg-[#161617] transition-colors group"
    >
      <GitBranch className="h-4 w-4 text-[#58a6ff]" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono text-[#e6edf3]">{branch.name}</span>
          {isDefault && (
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px] bg-[#1f1f1f] text-[#8b949e]">
              default
            </Badge>
          )}
          {branch.isProtected && (
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px] bg-[#1f1f1f] text-[#f0883e]">
              protected
            </Badge>
          )}
        </div>
        {sha && (
          <p className="text-xs text-[#6e7681] font-mono mt-0.5">{sha.substring(0, 7)}</p>
        )}
      </div>
      <ArrowUpRight className="h-3.5 w-3.5 text-[#6e7681] opacity-0 group-hover:opacity-100 transition-opacity" />
    </a>
  );
}

function QuickActionButton({
  icon: Icon,
  label,
  href,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  href?: string;
  onClick?: () => void;
}) {
  const className = "flex items-center gap-2 px-3 py-2.5 rounded-lg border border-[#1f1f1f] bg-[#0d0d0e] hover:bg-[#161617] hover:border-[#30363d] transition-all text-sm text-[#e6edf3]";

  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        <Icon className="h-4 w-4 text-[#8b949e]" />
        {label}
      </a>
    );
  }

  return (
    <button onClick={onClick} className={className}>
      <Icon className="h-4 w-4 text-[#8b949e]" />
      {label}
    </button>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="px-4 py-8 text-center">
      <p className="text-sm text-[#6e7681]">{message}</p>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg bg-[#1f1f1f]" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-64 rounded-lg bg-[#1f1f1f]" />
        ))}
      </div>
    </div>
  );
}
