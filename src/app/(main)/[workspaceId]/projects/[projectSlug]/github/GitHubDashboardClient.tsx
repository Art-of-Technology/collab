'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  GitBranch,
  GitCommit,
  GitPullRequest,
  Tag,
  ExternalLink,
  RefreshCw,
  Settings,
  CheckCircle2,
  ArrowUpRight,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Github,
  GitMerge,
  Search,
  XCircle,
  ArrowLeft,
  FileCode,
  Sparkles,
  Activity,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

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

  const syncAndFetch = useCallback(async (showToast = false) => {
    if (!repository?.id) return;

    setIsSyncing(true);
    try {
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

      if (dashboardRes.ok) setStats(await dashboardRes.json());
      if (commitsRes.ok) setCommits((await commitsRes.json()).commits || []);
      if (prsRes.ok) setPullRequests((await prsRes.json()).pullRequests || []);
      if (releasesRes.ok) setReleases((await releasesRes.json()).releases || []);
      if (branchesRes.ok) setBranches((await branchesRes.json()).branches || []);
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
      <div className="h-full w-full overflow-y-auto bg-collab-900">
        <div className="flex flex-col gap-6 p-8 max-w-[1400px] mx-auto">
          <div className="rounded-2xl bg-collab-800 border border-collab-700 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-5">
              <div className="flex items-center gap-4">
                <div className="p-2.5 rounded-xl bg-collab-700">
                  <Github className="h-5 w-5 text-collab-500" />
                </div>
                <div>
                  <h1 className="text-xl font-medium text-collab-50">GitHub Integration</h1>
                  <p className="text-sm text-collab-500">Connect a repository to get started</p>
                </div>
              </div>
              <Link
                href={`/${workspaceSlug}/projects/${project.slug}`}
                className="flex items-center gap-2 h-9 px-4 rounded-lg text-sm text-collab-500 hover:text-collab-50 hover:bg-collab-700 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Link>
            </div>
          </div>

          <div className="flex items-center justify-center py-20">
            <div className="text-center max-w-sm">
              <div className="w-16 h-16 rounded-2xl bg-collab-800 border border-collab-700 flex items-center justify-center mx-auto mb-5">
                <Github className="h-8 w-8 text-collab-500/60" />
              </div>
              <h2 className="text-lg font-medium text-collab-50 mb-2">No Repository Connected</h2>
              <p className="text-sm text-collab-500 mb-6">
                Link a GitHub repository to track commits, pull requests, releases, and branches.
              </p>
              <Button
                onClick={() => router.push(`/${workspaceSlug}/projects/${project.slug}/settings?tab=github`)}
                className="h-10 px-5 bg-blue-500 hover:bg-blue-400 text-white"
              >
                Connect Repository
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-y-auto bg-collab-900">
      <div className="flex flex-col gap-6 p-8 max-w-[1400px] mx-auto">

        {/* Header Card */}
        <div className="rounded-2xl bg-collab-800 border border-collab-700 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-5">
            <div className="flex items-center gap-4">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-collab-700 to-collab-600">
                <Github className="h-5 w-5 text-collab-50" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-medium text-collab-50">{repository.fullName}</h1>
                  <a
                    href={`https://github.com/${repository.fullName}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-collab-500/60 hover:text-collab-400 transition-colors"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
                <div className="flex items-center gap-3 text-sm text-collab-500">
                  <span className="flex items-center gap-1">
                    <GitBranch className="h-3.5 w-3.5" />
                    {repository.defaultBranch || 'main'}
                  </span>
                  {lastSynced && (
                    <>
                      <span className="text-collab-500/50">•</span>
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
                className="h-9 px-3 text-collab-500 hover:text-collab-50 hover:bg-collab-700"
              >
                <RefreshCw className={cn("h-4 w-4 mr-2", (isRefreshing || isSyncing) && "animate-spin")} />
                {isSyncing ? 'Syncing...' : 'Refresh'}
              </Button>
              <Link
                href={`/${workspaceSlug}/projects/${project.slug}`}
                className="flex items-center gap-2 h-9 px-4 rounded-lg text-sm text-collab-500 hover:text-collab-50 hover:bg-collab-700 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Link>
              <Button
                onClick={() => router.push(`/${workspaceSlug}/projects/${project.slug}/settings?tab=github`)}
                variant="ghost"
                size="sm"
                className="h-9 w-9 p-0 text-collab-500 hover:text-collab-50 hover:bg-collab-700"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 border-t border-collab-700">
            <StatCard
              label="Commits"
              value={stats?.commits?.total ?? commits.length}
              subValue={stats?.commits?.thisWeek ? `+${stats.commits.thisWeek} this week` : undefined}
              icon={<GitCommit className="h-4 w-4" />}
              iconBg="bg-blue-500/10"
              iconColor="text-blue-400"
              active={activeView === 'commits'}
              onClick={() => setActiveView(activeView === 'commits' ? 'overview' : 'commits')}
            />
            <StatCard
              label="Pull Requests"
              value={stats?.pullRequests?.total ?? pullRequests.length}
              subValue={stats?.pullRequests?.open ? `${stats.pullRequests.open} open` : undefined}
              icon={<GitPullRequest className="h-4 w-4" />}
              iconBg="bg-purple-500/10"
              iconColor="text-purple-400"
              active={activeView === 'pullrequests'}
              onClick={() => setActiveView(activeView === 'pullrequests' ? 'overview' : 'pullrequests')}
            />
            <StatCard
              label="Releases"
              value={stats?.releases?.total ?? releases.length}
              subValue={stats?.releases?.latest?.tagName}
              icon={<Tag className="h-4 w-4" />}
              iconBg="bg-emerald-500/10"
              iconColor="text-emerald-400"
              active={activeView === 'releases'}
              onClick={() => setActiveView(activeView === 'releases' ? 'overview' : 'releases')}
            />
            <StatCard
              label="Branches"
              value={stats?.branches?.total ?? branches.length}
              subValue={stats?.branches?.active ? `${stats.branches.active} active` : undefined}
              icon={<GitBranch className="h-4 w-4" />}
              iconBg="bg-amber-500/10"
              iconColor="text-amber-400"
              active={activeView === 'branches'}
              onClick={() => setActiveView(activeView === 'branches' ? 'overview' : 'branches')}
              isLast
            />
          </div>
        </div>

        {loading ? (
          <LoadingSkeleton />
        ) : (
          <>
            {/* Active Detail View */}
            {activeView !== 'overview' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setActiveView('overview')}
                    className="flex items-center gap-2 text-sm text-collab-500 hover:text-collab-50 transition-colors"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Back to Overview
                  </button>
                  <div className="relative w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-collab-500/60" />
                    <Input
                      placeholder="Search..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 h-9 bg-collab-800 border-collab-700 text-collab-50 placeholder:text-collab-500/60 focus:border-collab-500/50 focus-visible:ring-0"
                    />
                  </div>
                </div>

                {activeView === 'commits' && (
                  <DataList
                    items={filteredCommits}
                    emptyMessage="No commits found"
                    renderItem={(commit) => (
                      <CommitRow key={commit.id} commit={commit} repoFullName={repository.fullName} />
                    )}
                  />
                )}
                {activeView === 'pullrequests' && (
                  <DataList
                    items={filteredPRs}
                    emptyMessage="No pull requests found"
                    renderItem={(pr) => (
                      <PullRequestRow key={pr.id} pr={pr} repoFullName={repository.fullName} />
                    )}
                  />
                )}
                {activeView === 'releases' && (
                  <DataList
                    items={filteredReleases}
                    emptyMessage="No releases found"
                    renderItem={(release) => (
                      <ReleaseRow key={release.id} release={release} />
                    )}
                  />
                )}
                {activeView === 'branches' && (
                  <DataList
                    items={filteredBranches}
                    emptyMessage="No branches found"
                    renderItem={(branch) => (
                      <BranchRow
                        key={branch.id || branch.name}
                        branch={branch}
                        isDefault={branch.name === repository.defaultBranch || branch.isDefault}
                        repoFullName={repository.fullName}
                      />
                    )}
                  />
                )}
              </div>
            )}

            {/* Overview Grid */}
            {activeView === 'overview' && (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Recent Commits */}
                  <SectionCard
                    title="Recent Commits"
                    icon={<GitCommit className="h-4 w-4 text-blue-400" />}
                    iconBg="bg-blue-500/10"
                    count={commits.length}
                    onViewAll={() => setActiveView('commits')}
                  >
                    {commits.length === 0 ? (
                      <EmptyState message="No commits yet" icon={<GitCommit className="h-5 w-5" />} />
                    ) : (
                      commits.slice(0, 5).map((commit) => (
                        <CommitRow key={commit.id} commit={commit} repoFullName={repository.fullName} compact />
                      ))
                    )}
                  </SectionCard>

                  {/* Pull Requests */}
                  <SectionCard
                    title="Pull Requests"
                    icon={<GitPullRequest className="h-4 w-4 text-purple-400" />}
                    iconBg="bg-purple-500/10"
                    count={pullRequests.length}
                    onViewAll={() => setActiveView('pullrequests')}
                  >
                    {pullRequests.length === 0 ? (
                      <EmptyState message="No pull requests yet" icon={<GitPullRequest className="h-5 w-5" />} />
                    ) : (
                      pullRequests.slice(0, 5).map((pr) => (
                        <PullRequestRow key={pr.id} pr={pr} repoFullName={repository.fullName} compact />
                      ))
                    )}
                  </SectionCard>

                  {/* Releases */}
                  <SectionCard
                    title="Releases"
                    icon={<Tag className="h-4 w-4 text-emerald-400" />}
                    iconBg="bg-emerald-500/10"
                    count={releases.length}
                    onViewAll={() => setActiveView('releases')}
                  >
                    {releases.length === 0 ? (
                      <EmptyState message="No releases yet" icon={<Tag className="h-5 w-5" />} />
                    ) : (
                      releases.slice(0, 5).map((release) => (
                        <ReleaseRow key={release.id} release={release} compact />
                      ))
                    )}
                  </SectionCard>

                  {/* Branches */}
                  <SectionCard
                    title="Branches"
                    icon={<GitBranch className="h-4 w-4 text-amber-400" />}
                    iconBg="bg-amber-500/10"
                    count={branches.length}
                    onViewAll={() => setActiveView('branches')}
                  >
                    {branches.length === 0 ? (
                      <EmptyState message="No branches synced" icon={<GitBranch className="h-5 w-5" />} />
                    ) : (
                      branches.slice(0, 5).map((branch) => (
                        <BranchRow
                          key={branch.id || branch.name}
                          branch={branch}
                          isDefault={branch.name === repository.defaultBranch || branch.isDefault}
                          repoFullName={repository.fullName}
                          compact
                        />
                      ))
                    )}
                  </SectionCard>
                </div>

                {/* Quick Actions */}
                <div className="rounded-2xl bg-collab-800 border border-collab-700 overflow-hidden">
                  <div className="px-4 py-3 border-b border-collab-700">
                    <span className="text-xs font-medium uppercase tracking-wider text-collab-500/60">Quick Actions</span>
                  </div>
                  <div className="p-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
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
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Sub-Components ────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  subValue,
  icon,
  iconBg,
  iconColor,
  active,
  onClick,
  isLast,
}: {
  label: string;
  value: number;
  subValue?: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  active?: boolean;
  onClick?: () => void;
  isLast?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-collab-700",
        !isLast && "border-r border-collab-700",
        active && "bg-collab-700"
      )}
    >
      <div className={cn("p-2 rounded-lg", iconBg)}>
        <div className={iconColor}>{icon}</div>
      </div>
      <div>
        <div className="text-xl font-semibold text-collab-50">{value}</div>
        <div className="text-[11px] text-collab-500/60">{label}</div>
        {subValue && <div className="text-[10px] text-collab-500 mt-0.5">{subValue}</div>}
      </div>
    </button>
  );
}

function SectionCard({
  title,
  icon,
  iconBg,
  count,
  onViewAll,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  iconBg: string;
  count: number;
  onViewAll: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-collab-800 border border-collab-700 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-collab-700">
        <div className="flex items-center gap-2.5">
          <div className={cn("p-1.5 rounded-lg", iconBg)}>{icon}</div>
          <h3 className="text-sm font-medium text-collab-50">{title}</h3>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-collab-700 text-collab-500">{count}</span>
        </div>
        <button
          onClick={onViewAll}
          className="flex items-center gap-1 text-[11px] text-collab-500/60 hover:text-collab-400 transition-colors"
        >
          View all <ChevronRight className="h-3 w-3" />
        </button>
      </div>
      <div className="divide-y divide-collab-700">{children}</div>
    </div>
  );
}

function DataList<T>({
  items,
  emptyMessage,
  renderItem,
}: {
  items: T[];
  emptyMessage: string;
  renderItem: (item: T) => React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-collab-800 border border-collab-700 overflow-hidden divide-y divide-collab-700">
      {items.length === 0 ? (
        <div className="py-12 text-center text-sm text-collab-500/60">{emptyMessage}</div>
      ) : (
        items.map(renderItem)
      )}
    </div>
  );
}

function CommitRow({ commit, repoFullName, compact }: { commit: Commit; repoFullName: string; compact?: boolean }) {
  const firstLine = commit.message.split('\n')[0];
  return (
    <a
      href={`https://github.com/${repoFullName}/commit/${commit.sha}`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start gap-3 px-4 py-3 hover:bg-collab-700 transition-colors group"
    >
      <GitCommit className="h-4 w-4 text-blue-400 mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm text-collab-50", compact && "truncate")}>{firstLine}</p>
        <div className="flex items-center gap-2 mt-1 text-[11px] text-collab-500/60">
          <span className="font-mono">{commit.sha.substring(0, 7)}</span>
          <span>•</span>
          <span>{commit.authorName}</span>
          <span>•</span>
          <span>{formatDistanceToNow(new Date(commit.commitDate), { addSuffix: true })}</span>
        </div>
      </div>
      <ArrowUpRight className="h-3.5 w-3.5 text-collab-500/50 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
    </a>
  );
}

function PullRequestRow({ pr, repoFullName, compact }: { pr: PullRequest; repoFullName: string; compact?: boolean }) {
  const getStateStyle = (state: string) => {
    switch (state.toUpperCase()) {
      case 'OPEN': return { color: 'text-emerald-400', bg: 'bg-emerald-500/10' };
      case 'MERGED': return { color: 'text-purple-400', bg: 'bg-purple-500/10' };
      case 'CLOSED': return { color: 'text-red-400', bg: 'bg-red-500/10' };
      default: return { color: 'text-collab-500', bg: 'bg-collab-700' };
    }
  };
  const getStateIcon = (state: string) => {
    switch (state.toUpperCase()) {
      case 'OPEN': return <GitPullRequest className="h-4 w-4" />;
      case 'MERGED': return <GitMerge className="h-4 w-4" />;
      case 'CLOSED': return <XCircle className="h-4 w-4" />;
      default: return <GitPullRequest className="h-4 w-4" />;
    }
  };
  const style = getStateStyle(pr.state);

  return (
    <a
      href={`https://github.com/${repoFullName}/pull/${pr.githubPrId}`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start gap-3 px-4 py-3 hover:bg-collab-700 transition-colors group"
    >
      <div className={cn("flex-shrink-0 mt-0.5", style.color)}>{getStateIcon(pr.state)}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn("text-sm text-collab-50", compact && "truncate")}>{pr.title}</span>
          <span className="text-xs text-collab-500/60">#{pr.githubPrId}</span>
        </div>
        <div className="flex items-center gap-2 mt-1 text-[11px] text-collab-500/60">
          <span className={cn("px-1.5 py-0.5 rounded text-[10px]", style.bg, style.color)}>
            {pr.state.toLowerCase()}
          </span>
          {pr.authorName && (
            <>
              <span>•</span>
              <span>{pr.authorName}</span>
            </>
          )}
          <span>•</span>
          <span>{formatDistanceToNow(new Date(pr.mergedAt || pr.closedAt || pr.createdAt), { addSuffix: true })}</span>
        </div>
      </div>
      <ArrowUpRight className="h-3.5 w-3.5 text-collab-500/50 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
    </a>
  );
}

function ReleaseRow({ release, compact }: { release: Release; compact?: boolean }) {
  return (
    <a
      href={release.githubUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start gap-3 px-4 py-3 hover:bg-collab-700 transition-colors group"
    >
      <Tag className="h-4 w-4 text-emerald-400 mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-collab-50">{release.tagName}</span>
          {release.isPrerelease && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">Pre-release</span>
          )}
          {release.isDraft && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-collab-700 text-collab-500">Draft</span>
          )}
        </div>
        {release.name && release.name !== release.tagName && (
          <p className={cn("text-xs text-collab-500 mt-0.5", compact && "truncate")}>{release.name}</p>
        )}
        {release.publishedAt && (
          <div className="text-[11px] text-collab-500/60 mt-1">
            {formatDistanceToNow(new Date(release.publishedAt), { addSuffix: true })}
          </div>
        )}
      </div>
      <ArrowUpRight className="h-3.5 w-3.5 text-collab-500/50 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
    </a>
  );
}

function BranchRow({
  branch,
  isDefault,
  repoFullName,
  compact,
}: {
  branch: Branch | { name: string; headSha?: string; isDefault?: boolean; isProtected?: boolean };
  isDefault: boolean;
  repoFullName: string;
  compact?: boolean;
}) {
  const sha = 'headSha' in branch ? branch.headSha : undefined;
  return (
    <a
      href={`https://github.com/${repoFullName}/tree/${branch.name}`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 px-4 py-3 hover:bg-collab-700 transition-colors group"
    >
      <GitBranch className="h-4 w-4 text-amber-400 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono text-collab-50">{branch.name}</span>
          {isDefault && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">default</span>
          )}
          {branch.isProtected && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">protected</span>
          )}
        </div>
        {sha && <p className="text-[11px] text-collab-500/60 font-mono mt-0.5">{sha.substring(0, 7)}</p>}
      </div>
      <ArrowUpRight className="h-3.5 w-3.5 text-collab-500/50 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
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
  const className = "group flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-collab-900 border border-collab-700 hover:border-collab-600 hover:bg-collab-700 transition-all text-sm text-collab-400 hover:text-collab-50";

  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        <Icon className="h-4 w-4 text-collab-500/60 group-hover:text-collab-500" />
        {label}
      </a>
    );
  }

  return (
    <button onClick={onClick} className={className}>
      <Icon className="h-4 w-4 text-collab-500/60 group-hover:text-collab-500" />
      {label}
    </button>
  );
}

function EmptyState({ message, icon }: { message: string; icon: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="p-3 rounded-xl bg-collab-900 mb-3 text-collab-500/50">{icon}</div>
      <p className="text-xs text-collab-500/60">{message}</p>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-64 rounded-2xl bg-collab-800 border border-collab-700 animate-pulse" />
        ))}
      </div>
    </div>
  );
}
