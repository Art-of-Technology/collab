'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tag,
  Search,
  Download,
  Sparkles,
  GitBranch,
  Calendar,
  ChevronRight,
  ExternalLink,
  Rocket,
  Bug,
  Zap,
  ArrowUpRight,
  Settings,
  RefreshCw,
  CheckCircle2,
  Clock,
  Github,
  Filter,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatDistanceToNow, format } from 'date-fns';

interface ChangelogPageClientProps {
  repositoryId: string;
  projectName: string;
  workspaceId: string;
  projectSlug: string;
}

interface Version {
  id: string;
  version: string;
  major: number;
  minor: number;
  patch: number;
  releaseType: 'MAJOR' | 'MINOR' | 'PATCH' | 'PRERELEASE';
  status: string;
  environment: string;
  branch?: string;
  releasedAt?: string;
  createdAt: string;
  aiSummary?: string;
  parentVersion?: {
    id: string;
    version: string;
    environment: string;
  };
  issues: Array<{
    id: string;
    issueKey: string;
    aiTitle?: string;
    issue: {
      title: string;
      type: string;
      priority: string;
    };
  }>;
  releases: Array<{
    id: string;
    name: string;
    description?: string;
    githubUrl?: string;
    publishedAt?: string;
  }>;
  deployments: Array<{
    id: string;
    environment: string;
    status: string;
    deployedAt?: string;
  }>;
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

export function ChangelogPageClient({
  repositoryId,
  projectName,
  workspaceId,
  projectSlug,
}: ChangelogPageClientProps) {
  const router = useRouter();
  const [versions, setVersions] = useState<Version[]>([]);
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [environmentFilter, setEnvironmentFilter] = useState('all');
  const [isGenerating, setIsGenerating] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [versionsRes, releasesRes] = await Promise.all([
        fetch(`/api/github/repositories/${repositoryId}/versions`),
        fetch(`/api/github/repositories/${repositoryId}/releases?limit=20`),
      ]);

      if (versionsRes.ok) {
        const data = await versionsRes.json();
        setVersions(data.versions || []);
      }

      if (releasesRes.ok) {
        const data = await releasesRes.json();
        setReleases(data.releases || []);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }, [repositoryId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredVersions = versions.filter((version) => {
    const matchesSearch =
      !searchTerm ||
      version.version.toLowerCase().includes(searchTerm.toLowerCase()) ||
      version.aiSummary?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesEnv =
      environmentFilter === 'all' || version.environment === environmentFilter;
    return matchesSearch && matchesEnv;
  });

  const handleGenerateChangelog = async () => {
    setIsGenerating(true);
    try {
      const response = await fetch(
        `/api/github/repositories/${repositoryId}/generate-changelog`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            options: {
              includeCommits: true,
              includePRs: true,
              includeReleaseNotes: true,
              format: 'markdown',
            },
          }),
        }
      );

      const data = await response.json();

      if (response.ok) {
        toast.success(
          <div>
            <div className="font-medium">Changelog generated</div>
            {data.releaseName && (
              <div className="text-sm opacity-80">For {data.releaseName}</div>
            )}
          </div>
        );
        fetchData();
      } else if (data.needsSync) {
        toast.error(
          <div>
            <div className="font-medium">No data available</div>
            <div className="text-sm opacity-80">Please sync your repository first from GitHub settings</div>
          </div>
        );
      } else {
        toast.error(data.error || 'Failed to generate changelog');
      }
    } catch (error) {
      toast.error('Failed to generate changelog');
    } finally {
      setIsGenerating(false);
    }
  };

  const exportChangelog = () => {
    const content = filteredVersions
      .map((v) => {
        const features = v.issues.filter((i) =>
          ['TASK', 'STORY', 'EPIC'].includes(i.issue.type)
        );
        const bugs = v.issues.filter((i) => i.issue.type === 'BUG');
        return `## ${v.version} (${format(new Date(v.releasedAt || v.createdAt), 'MMM d, yyyy')})

${v.aiSummary || ''}

### Features
${features.map((f) => `- ${f.aiTitle || f.issue.title}`).join('\n') || 'No new features'}

### Bug Fixes
${bugs.map((b) => `- ${b.aiTitle || b.issue.title}`).join('\n') || 'No bug fixes'}
`;
      })
      .join('\n---\n\n');

    const blob = new Blob([`# ${projectName} Changelog\n\n${content}`], {
      type: 'text/markdown',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName.toLowerCase().replace(/\s+/g, '-')}-changelog.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Changelog exported');
  };

  // Stats
  const stats = {
    total: versions.length,
    production: versions.filter((v) => v.environment === 'production').length,
    development: versions.filter((v) => v.environment === 'development').length,
    issues: versions.reduce((acc, v) => acc + v.issues.length, 0),
  };

  return (
    <div className="h-full flex flex-col bg-[#0a0a0b]">
      {/* Header */}
      <div className="flex-none border-b border-[#1f1f1f]">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#1a1a1b] flex items-center justify-center">
              <Tag className="h-4 w-4 text-[#3fb950]" />
            </div>
            <div>
              <h1 className="text-sm font-medium text-[#e6edf3]">Changelog</h1>
              <p className="text-xs text-[#6e7681]">{projectName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleGenerateChangelog}
              variant="ghost"
              size="sm"
              disabled={isGenerating}
              className="h-8 px-3 text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#1a1a1b]"
            >
              <Sparkles
                className={cn('h-3.5 w-3.5 mr-1.5', isGenerating && 'animate-pulse')}
              />
              {isGenerating ? 'Generating...' : 'Generate AI'}
            </Button>
            <Button
              onClick={exportChangelog}
              variant="ghost"
              size="sm"
              className="h-8 px-3 text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#1a1a1b]"
            >
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Export
            </Button>
            <Button
              onClick={() =>
                router.push(`/${workspaceId}/projects/${projectSlug}/github`)
              }
              variant="ghost"
              size="sm"
              className="h-8 px-3 text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#1a1a1b]"
            >
              <Github className="h-3.5 w-3.5" />
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
              {/* Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard
                  label="Total Versions"
                  value={stats.total}
                  icon={Tag}
                />
                <StatCard
                  label="Production"
                  value={stats.production}
                  icon={Rocket}
                  iconColor="text-[#3fb950]"
                />
                <StatCard
                  label="Development"
                  value={stats.development}
                  icon={GitBranch}
                  iconColor="text-[#58a6ff]"
                />
                <StatCard
                  label="Issues Resolved"
                  value={stats.issues}
                  icon={CheckCircle2}
                  iconColor="text-[#a371f7]"
                />
              </div>

              {/* Filters */}
              <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6e7681]" />
                  <Input
                    placeholder="Search versions..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 h-9 bg-[#0d0d0e] border-[#1f1f1f] text-[#e6edf3] placeholder:text-[#6e7681] focus:border-[#30363d]"
                  />
                </div>
                <Select value={environmentFilter} onValueChange={setEnvironmentFilter}>
                  <SelectTrigger className="w-40 h-9 bg-[#0d0d0e] border-[#1f1f1f] text-[#e6edf3]">
                    <Filter className="h-3.5 w-3.5 mr-2 text-[#6e7681]" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#161617] border-[#1f1f1f]">
                    <SelectItem value="all">All Environments</SelectItem>
                    <SelectItem value="production">Production</SelectItem>
                    <SelectItem value="staging">Staging</SelectItem>
                    <SelectItem value="development">Development</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Version List */}
              <div className="space-y-3">
                {filteredVersions.length === 0 ? (
                  <EmptyState />
                ) : (
                  filteredVersions.map((version) => (
                    <VersionCard key={version.id} version={version} />
                  ))
                )}
              </div>

              {/* GitHub Releases */}
              {releases.length > 0 && (
                <div className="space-y-4 pt-4 border-t border-[#1f1f1f]">
                  <h2 className="text-sm font-medium text-[#e6edf3]">
                    GitHub Releases
                  </h2>
                  <div className="rounded-lg border border-[#1f1f1f] bg-[#0d0d0e] overflow-hidden">
                    <div className="divide-y divide-[#1f1f1f]">
                      {releases.slice(0, 10).map((release) => (
                        <ReleaseRow key={release.id} release={release} />
                      ))}
                    </div>
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
  icon: Icon,
  iconColor = 'text-[#8b949e]',
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  iconColor?: string;
}) {
  return (
    <div className="rounded-lg border border-[#1f1f1f] bg-[#0d0d0e] p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-[#8b949e]">{label}</span>
        <Icon className={cn('h-4 w-4', iconColor)} />
      </div>
      <div className="text-2xl font-semibold text-[#e6edf3]">{value}</div>
    </div>
  );
}

function VersionCard({ version }: { version: Version }) {
  const [expanded, setExpanded] = useState(false);
  const features = version.issues.filter((i) =>
    ['TASK', 'STORY', 'EPIC'].includes(i.issue.type)
  );
  const bugs = version.issues.filter((i) => i.issue.type === 'BUG');

  const getEnvColor = (env: string) => {
    switch (env) {
      case 'production':
        return 'bg-[#238636]/10 text-[#3fb950] border-[#238636]/30';
      case 'staging':
        return 'bg-[#9e6a03]/10 text-[#f0883e] border-[#9e6a03]/30';
      default:
        return 'bg-[#1f6feb]/10 text-[#58a6ff] border-[#1f6feb]/30';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'RELEASED':
        return <CheckCircle2 className="h-3.5 w-3.5 text-[#3fb950]" />;
      case 'PENDING':
        return <Clock className="h-3.5 w-3.5 text-[#f0883e]" />;
      default:
        return <Clock className="h-3.5 w-3.5 text-[#8b949e]" />;
    }
  };

  return (
    <div className="rounded-lg border border-[#1f1f1f] bg-[#0d0d0e] overflow-hidden">
      <div
        className="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-[#161617] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          {getStatusIcon(version.status)}
          <span className="text-sm font-mono font-medium text-[#e6edf3]">
            v{version.version}
          </span>
        </div>

        <Badge className={cn('text-[10px] border', getEnvColor(version.environment))}>
          {version.environment}
        </Badge>

        {version.branch && (
          <span className="text-xs text-[#6e7681] flex items-center gap-1">
            <GitBranch className="h-3 w-3" />
            {version.branch}
          </span>
        )}

        <div className="flex-1" />

        <div className="flex items-center gap-4 text-xs text-[#6e7681]">
          {features.length > 0 && (
            <span className="flex items-center gap-1">
              <Zap className="h-3 w-3 text-[#58a6ff]" />
              {features.length}
            </span>
          )}
          {bugs.length > 0 && (
            <span className="flex items-center gap-1">
              <Bug className="h-3 w-3 text-[#f85149]" />
              {bugs.length}
            </span>
          )}
          <span>
            {formatDistanceToNow(new Date(version.releasedAt || version.createdAt), {
              addSuffix: true,
            })}
          </span>
          <ChevronRight
            className={cn(
              'h-4 w-4 transition-transform',
              expanded && 'rotate-90'
            )}
          />
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-2 border-t border-[#1f1f1f] space-y-4">
          {/* Show AI Summary if available */}
          {version.aiSummary && (
            <p className="text-sm text-[#8b949e]">{version.aiSummary}</p>
          )}

          {/* Fallback: Show GitHub release description if no AI summary and no issues */}
          {!version.aiSummary && features.length === 0 && bugs.length === 0 && version.releases?.[0]?.description && (
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-[#8b949e] flex items-center gap-1.5">
                <Github className="h-3.5 w-3.5" />
                Release Notes
              </h4>
              <p className="text-sm text-[#8b949e] whitespace-pre-wrap">{version.releases[0].description}</p>
            </div>
          )}

          {version.parentVersion && (
            <div className="text-xs text-[#6e7681] bg-[#161617] rounded px-3 py-2">
              Promoted from {version.parentVersion.environment} v
              {version.parentVersion.version}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Features */}
            {features.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-medium text-[#8b949e] flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-[#58a6ff]" />
                  Features
                </h4>
                <div className="space-y-1">
                  {features.map((item) => (
                    <div key={item.id} className="text-sm text-[#e6edf3]">
                      • {item.aiTitle || item.issue.title}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Bug Fixes */}
            {bugs.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-medium text-[#8b949e] flex items-center gap-1.5">
                  <Bug className="h-3.5 w-3.5 text-[#f85149]" />
                  Bug Fixes
                </h4>
                <div className="space-y-1">
                  {bugs.map((item) => (
                    <div key={item.id} className="text-sm text-[#e6edf3]">
                      • {item.aiTitle || item.issue.title}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Deployments */}
          {version.deployments.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-[#8b949e] flex items-center gap-1.5">
                <Rocket className="h-3.5 w-3.5 text-[#3fb950]" />
                Deployments
              </h4>
              <div className="flex flex-wrap gap-2">
                {version.deployments.map((d) => (
                  <Badge
                    key={d.id}
                    variant="secondary"
                    className="text-[10px] bg-[#1f1f1f] text-[#8b949e]"
                  >
                    {d.environment} - {d.status.toLowerCase()}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Empty state when no content available */}
          {!version.aiSummary &&
           features.length === 0 &&
           bugs.length === 0 &&
           version.deployments.length === 0 &&
           !version.parentVersion &&
           !version.releases?.[0]?.description && (
            <p className="text-sm text-[#6e7681] italic">
              No changelog details available. Link issues to this version or generate an AI summary.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ReleaseRow({ release }: { release: Release }) {
  return (
    <a
      href={release.githubUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 px-4 py-3 hover:bg-[#161617] transition-colors group"
    >
      <Tag className="h-4 w-4 text-[#3fb950]" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[#e6edf3]">
            {release.tagName}
          </span>
          {release.isPrerelease && (
            <Badge
              variant="secondary"
              className="h-5 px-1.5 text-[10px] bg-[#1f1f1f] text-[#f0883e]"
            >
              Pre-release
            </Badge>
          )}
        </div>
        {release.name && release.name !== release.tagName && (
          <p className="text-xs text-[#6e7681] truncate">{release.name}</p>
        )}
      </div>
      {release.publishedAt && (
        <span className="text-xs text-[#6e7681]">
          {formatDistanceToNow(new Date(release.publishedAt), { addSuffix: true })}
        </span>
      )}
      <ArrowUpRight className="h-3.5 w-3.5 text-[#6e7681] opacity-0 group-hover:opacity-100 transition-opacity" />
    </a>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-[#1f1f1f] bg-[#0d0d0e] px-4 py-12 text-center">
      <Tag className="h-10 w-10 mx-auto mb-3 text-[#6e7681]" />
      <h3 className="text-sm font-medium text-[#e6edf3] mb-1">No versions found</h3>
      <p className="text-xs text-[#6e7681]">
        Create releases on GitHub to see them here
      </p>
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
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-lg bg-[#1f1f1f]" />
        ))}
      </div>
    </div>
  );
}
