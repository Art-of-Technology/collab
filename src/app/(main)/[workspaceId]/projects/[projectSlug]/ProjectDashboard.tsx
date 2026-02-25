"use client";

import React, { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutGrid,
  List,
  Table2,
  Calendar,
  GanttChart,
  Star,
  Settings,
  GitBranch,
  Tag,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Plus,
  ExternalLink,
  Lightbulb,
  Activity,
  StickyNote,
  ChevronRight,
  GitPullRequest,
  GitCommit,
  GitMerge,
  Rocket,
  Github,
  MessageSquare,
  ThumbsUp,
  Loader2,
  Circle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useViews, type View } from '@/hooks/queries/useViews';
import { useProjectSummary } from '@/hooks/queries/useProjects';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { NotesCarousel } from '@/components/widgets';

interface ProjectDashboardProps {
  projectId: string;
  projectName: string;
  projectSlug: string;
  projectDescription: string | null;
  projectColor: string | null;
  workspaceId: string;
  workspaceSlug: string;
}

// View type icons
const viewTypeIcons: Record<string, React.ReactNode> = {
  KANBAN: <LayoutGrid className="h-3.5 w-3.5" />,
  LIST: <List className="h-3.5 w-3.5" />,
  TABLE: <Table2 className="h-3.5 w-3.5" />,
  CALENDAR: <Calendar className="h-3.5 w-3.5" />,
  TIMELINE: <GanttChart className="h-3.5 w-3.5" />,
};

const viewTypeLabels: Record<string, string> = {
  KANBAN: 'Board',
  LIST: 'List',
  TABLE: 'Table',
  CALENDAR: 'Calendar',
  TIMELINE: 'Timeline',
};

// ─── Compact Stat ─────────────────────────────────────────────────────────────

interface CompactStatProps {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  variant?: "default" | "success" | "warning" | "danger";
}

function CompactStat({ label, value, icon, variant = "default" }: CompactStatProps) {
  const variantStyles = {
    default: { text: "text-collab-50", icon: "text-collab-500" },
    success: { text: "text-emerald-400", icon: "text-emerald-400" },
    warning: { text: "text-amber-400", icon: "text-amber-400" },
    danger: { text: "text-red-400", icon: "text-red-400" },
  };

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className={cn("flex-shrink-0", variantStyles[variant].icon)}>
        {icon}
      </div>
      <div>
        <div className={cn("text-xl font-semibold", variantStyles[variant].text)}>
          {value}
        </div>
        <div className="text-[11px] text-collab-500/60">{label}</div>
      </div>
    </div>
  );
}

// ─── View Chip (for horizontal scroll) ────────────────────────────────────────

function ViewChip({
  view,
  workspaceSlug,
  isDefault,
}: {
  view: View;
  workspaceSlug: string;
  isDefault: boolean;
}) {
  return (
    <Link
      href={`/${workspaceSlug}/views/${view.slug || view.id}`}
      className={cn(
        "group flex items-center gap-2 px-3 py-2 rounded-lg border transition-all flex-shrink-0",
        isDefault
          ? "bg-blue-500/10 border-blue-500/20 hover:border-blue-500/40"
          : "bg-collab-800 border-collab-700 hover:border-collab-600 hover:bg-collab-700"
      )}
    >
      <div className={cn(
        "flex-shrink-0",
        isDefault ? "text-blue-400" : "text-collab-500 group-hover:text-collab-400"
      )}>
        {viewTypeIcons[view.displayType] || <LayoutGrid className="h-3.5 w-3.5" />}
      </div>
      <span className={cn(
        "text-sm transition-colors",
        isDefault ? "text-blue-400" : "text-collab-400 group-hover:text-collab-50"
      )}>
        {view.name}
      </span>
      {view.isFavorite && (
        <Star className="h-3 w-3 text-amber-400 fill-amber-400 flex-shrink-0" />
      )}
      <span className="text-xs text-collab-500/60">
        {view._count?.issues || 0}
      </span>
    </Link>
  );
}

// ─── Issue Row (Compact) ──────────────────────────────────────────────────────

function IssueRow({
  issue,
  onClick,
  variant = "default",
}: {
  issue: {
    id: string;
    title: string;
    issueKey: string;
    daysOverdue?: number;
    daysUntilDue?: number;
    assignee?: { name: string | null; image: string | null } | null;
  };
  onClick: () => void;
  variant?: "default" | "danger" | "warning";
}) {
  const indicatorColors = {
    default: "bg-blue-400",
    danger: "bg-red-400",
    warning: "bg-amber-400",
  };

  return (
    <div
      onClick={onClick}
      className="group flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-collab-700 cursor-pointer transition-colors"
    >
      <div className={cn("w-1 h-6 rounded-full flex-shrink-0", indicatorColors[variant])} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-collab-400 group-hover:text-collab-50 truncate transition-colors">
          {issue.title}
        </p>
        <span className="text-[11px] text-collab-500/60 font-mono">{issue.issueKey}</span>
      </div>
      {issue.daysOverdue && issue.daysOverdue > 0 && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 flex-shrink-0">
          {issue.daysOverdue}d late
        </span>
      )}
      {issue.daysUntilDue && issue.daysUntilDue > 0 && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 flex-shrink-0">
          {issue.daysUntilDue}d
        </span>
      )}
      {issue.assignee && (
        <Avatar className="h-5 w-5 flex-shrink-0">
          <AvatarImage src={issue.assignee.image || undefined} />
          <AvatarFallback className="text-[8px] bg-collab-600">
            {issue.assignee.name?.charAt(0)?.toUpperCase() || '?'}
          </AvatarFallback>
        </Avatar>
      )}
    </div>
  );
}

// ─── Activity Item Row ────────────────────────────────────────────────────────

interface ActivityItem {
  id: string;
  type: 'commit' | 'pull_request' | 'review' | 'release' | 'branch' | 'deployment';
  title: string;
  description?: string;
  timestamp: string;
  author: {
    name: string;
    avatar?: string;
  };
  metadata?: {
    sha?: string;
    prNumber?: number;
  };
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
  commit: "text-blue-400",
  pull_request: "text-purple-400",
  review: "text-amber-400",
  release: "text-emerald-400",
  deployment: "text-cyan-400",
  branch: "text-pink-400",
};

function ActivityRow({ activity }: { activity: ActivityItem }) {
  const timeAgo = formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true });

  return (
    <div className="flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-collab-700 transition-colors">
      <div className={cn("flex-shrink-0 mt-0.5", activityColors[activity.type] || "text-collab-500")}>
        {activityIcons[activity.type] || <Circle className="h-3.5 w-3.5" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-collab-400">
          <span className="text-collab-50">{activity.author.name}</span>
          {' '}{activity.title}
        </p>
        {activity.description && (
          <p className="text-xs text-collab-500/60 truncate mt-0.5">{activity.description}</p>
        )}
      </div>
      <span className="text-[10px] text-collab-500/60 flex-shrink-0">{timeAgo}</span>
    </div>
  );
}

// ─── Feature Request Row ──────────────────────────────────────────────────────

interface FeatureRequest {
  id: string;
  title: string;
  status: string;
  voteScore: number;
  createdAt: string;
  _count: { comments: number };
}

const featureStatusColors: Record<string, { bg: string; text: string }> = {
  pending: { bg: "bg-collab-600/20", text: "text-collab-400" },
  under_review: { bg: "bg-blue-500/10", text: "text-blue-400" },
  planned: { bg: "bg-purple-500/10", text: "text-purple-400" },
  in_progress: { bg: "bg-amber-500/10", text: "text-amber-400" },
  completed: { bg: "bg-emerald-500/10", text: "text-emerald-400" },
  declined: { bg: "bg-red-500/10", text: "text-red-400" },
};

function FeatureRow({ feature, onClick }: { feature: FeatureRequest; onClick: () => void }) {
  const statusStyle = featureStatusColors[feature.status] || featureStatusColors.pending;

  return (
    <div
      onClick={onClick}
      className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-collab-700 cursor-pointer transition-colors"
    >
      <div className={cn("flex items-center gap-1 flex-shrink-0", feature.voteScore >= 0 ? "text-emerald-400" : "text-red-400")}>
        <ThumbsUp className="h-3 w-3" />
        <span className="text-xs font-medium">{feature.voteScore > 0 ? '+' : ''}{feature.voteScore}</span>
      </div>
      <p className="text-sm text-collab-400 truncate flex-1">{feature.title}</p>
      <span className={cn("text-[10px] px-1.5 py-0.5 rounded flex-shrink-0", statusStyle.bg, statusStyle.text)}>
        {feature.status.replace('_', ' ')}
      </span>
    </div>
  );
}

// ─── Section Card ─────────────────────────────────────────────────────────────

function SectionCard({
  title,
  subtitle,
  icon,
  iconBg,
  viewAllHref,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  iconBg: string;
  viewAllHref?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl bg-collab-800 border border-collab-700 overflow-hidden", className)}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-collab-700">
        <div className="flex items-center gap-2.5">
          <div className={cn("p-1.5 rounded-lg", iconBg)}>
            {icon}
          </div>
          <div>
            <h3 className="text-sm font-medium text-collab-50">{title}</h3>
            {subtitle && <p className="text-[11px] text-collab-500/60">{subtitle}</p>}
          </div>
        </div>
        {viewAllHref && (
          <Link
            href={viewAllHref}
            className="flex items-center gap-1 text-[11px] text-collab-500/60 hover:text-collab-400 transition-colors"
          >
            View all <ExternalLink className="h-2.5 w-2.5" />
          </Link>
        )}
      </div>
      <div className="p-2">
        {children}
      </div>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ text, icon }: { text: string; icon: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="p-3 rounded-xl bg-collab-900 mb-3 text-collab-500/50">
        {icon}
      </div>
      <p className="text-xs text-collab-500/60">{text}</p>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ProjectDashboard({
  projectId,
  projectName,
  projectSlug,
  projectDescription,
  projectColor,
  workspaceId,
  workspaceSlug,
}: ProjectDashboardProps) {
  const router = useRouter();

  // Fetch views for this workspace
  const { data: views = [] } = useViews({
    workspaceId,
    includeStats: true,
  });

  // Fetch project summary data
  const { data: summary, isLoading } = useProjectSummary(projectId);

  // Filter views that include this project
  const projectViews = useMemo(() => {
    return views.filter((view: View) => view.projectIds.includes(projectId));
  }, [views, projectId]);

  // Find default view for this project
  const defaultView = useMemo(() => {
    return projectViews.find((view: View) => view.isDefault);
  }, [projectViews]);

  // Sort views: default first, then favorites, then by name
  const sortedViews = useMemo(() => {
    return [...projectViews].sort((a, b) => {
      if (a.isDefault) return -1;
      if (b.isDefault) return 1;
      if (a.isFavorite && !b.isFavorite) return -1;
      if (!a.isFavorite && b.isFavorite) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [projectViews]);

  const handleIssueClick = (issueKey: string) => {
    router.push(`/${workspaceSlug}/issues/${issueKey}`);
  };

  const handleFeatureClick = (featureId: string) => {
    router.push(`/${workspaceSlug}/projects/${projectSlug}/features/${featureId}`);
  };

  const handleNoteClick = (noteId: string) => {
    router.push(`/${workspaceSlug}/notes/${noteId}`);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="h-full w-full overflow-y-auto">
        <div className="flex flex-col gap-6 p-8 max-w-[1400px] mx-auto animate-pulse">
          <div className="h-16 bg-collab-800 rounded-2xl" />
          <div className="h-12 bg-collab-800 rounded-xl" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 h-[400px] bg-collab-800 rounded-2xl" />
            <div className="h-[400px] bg-collab-800 rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  const overdueCount = summary?.stats.overdueCount || 0;
  const atRiskCount = summary?.stats.atRiskCount || 0;
  const allAttentionIssues = [
    ...(summary?.atRisk.overdue || []).map(i => ({ ...i, variant: 'danger' as const })),
    ...(summary?.atRisk.upcoming || []).map(i => ({ ...i, variant: 'warning' as const })),
  ];

  return (
    <div className="h-full w-full overflow-y-auto">
      <div className="flex flex-col gap-6 p-8 max-w-[1400px] mx-auto">

        {/* ─── Header + Stats Row ──────────────────────────────────────────── */}
        <div className="rounded-2xl bg-collab-800 border border-collab-700 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-5">
            <div className="flex items-center gap-4">
              <div
                className="w-1.5 h-12 rounded-full flex-shrink-0"
                style={{ backgroundColor: projectColor || '#6366f1' }}
              />
              <div>
                <h1 className="text-xl font-medium text-collab-50">{projectName}</h1>
                <p className="text-sm text-collab-500 max-w-lg">
                  {projectDescription || "Project dashboard"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push(`/${workspaceSlug}/projects/${projectSlug}/github`)}
                className="h-8 px-3 text-collab-500 hover:text-collab-50 hover:bg-collab-700 rounded-lg"
              >
                <Github className="h-4 w-4 mr-1.5" />
                GitHub
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push(`/${workspaceSlug}/projects/${projectSlug}/changelog`)}
                className="h-8 px-3 text-collab-500 hover:text-collab-50 hover:bg-collab-700 rounded-lg"
              >
                <Tag className="h-4 w-4 mr-1.5" />
                Releases
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push(`/${workspaceSlug}/projects/${projectSlug}/settings`)}
                className="h-8 w-8 p-0 text-collab-500 hover:text-collab-50 hover:bg-collab-700 rounded-lg"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Stats Row */}
          <div className="flex items-center border-t border-collab-700 divide-x divide-collab-700">
            <CompactStat
              label="Completion"
              value={`${summary?.stats.completionRate || 0}%`}
              icon={<CheckCircle2 className="h-4 w-4" />}
              variant="success"
            />
            <CompactStat
              label="Open Issues"
              value={summary?.stats.openIssues || 0}
              icon={<Activity className="h-4 w-4" />}
            />
            <CompactStat
              label="Overdue"
              value={overdueCount}
              icon={<AlertTriangle className="h-4 w-4" />}
              variant={overdueCount > 0 ? "danger" : "default"}
            />
            <CompactStat
              label="At Risk"
              value={atRiskCount}
              icon={<Clock className="h-4 w-4" />}
              variant={atRiskCount > 0 ? "warning" : "default"}
            />
          </div>
        </div>

        {/* ─── Views (Horizontal Scroll) ───────────────────────────────────── */}
        {sortedViews.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium uppercase tracking-wider text-collab-500/60">
                Views ({sortedViews.length})
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[11px] text-collab-500/60 hover:text-collab-400"
              >
                <Plus className="h-3 w-3 mr-1" />
                New
              </Button>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-collab-700 scrollbar-track-transparent">
              {sortedViews.map((view: View) => (
                <ViewChip
                  key={view.id}
                  view={view}
                  workspaceSlug={workspaceSlug}
                  isDefault={view.id === defaultView?.id}
                />
              ))}
            </div>
          </div>
        )}

        {/* ─── Main Content Grid ───────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Left Column: Issues */}
          <div className="lg:col-span-2 flex flex-col gap-4">

            {/* Needs Attention */}
            <SectionCard
              title="Needs Attention"
              subtitle={`${allAttentionIssues.length} issues require action`}
              icon={<AlertTriangle className="h-4 w-4 text-amber-400" />}
              iconBg="bg-amber-500/10"
            >
              {allAttentionIssues.length === 0 ? (
                <EmptyState text="All caught up! No urgent issues." icon={<CheckCircle2 className="h-5 w-5" />} />
              ) : (
                <div className="max-h-[240px] overflow-y-auto">
                  {allAttentionIssues.slice(0, 8).map((issue) => (
                    <IssueRow
                      key={issue.id}
                      issue={issue}
                      onClick={() => handleIssueClick(issue.issueKey)}
                      variant={issue.variant}
                    />
                  ))}
                </div>
              )}
            </SectionCard>

            {/* Recent Issues */}
            <SectionCard
              title="Recent Activity"
              subtitle={`${summary?.recentIssues?.length || 0} recently updated`}
              icon={<Activity className="h-4 w-4 text-blue-400" />}
              iconBg="bg-blue-500/10"
            >
              {(!summary?.recentIssues || summary.recentIssues.length === 0) ? (
                <EmptyState text="No recent issue activity" icon={<Activity className="h-5 w-5" />} />
              ) : (
                <div className="max-h-[240px] overflow-y-auto">
                  {summary.recentIssues.slice(0, 6).map((issue) => (
                    <IssueRow
                      key={issue.id}
                      issue={issue}
                      onClick={() => handleIssueClick(issue.issueKey)}
                    />
                  ))}
                </div>
              )}
            </SectionCard>
          </div>

          {/* Right Column: Activity Feed */}
          <div className="flex flex-col gap-4">

            {/* GitHub Activity */}
            <SectionCard
              title="GitHub"
              subtitle={summary?.github?.connected ? "Repository connected" : "Not connected"}
              icon={<Github className="h-4 w-4 text-collab-500" />}
              iconBg="bg-collab-900"
              viewAllHref={`/${workspaceSlug}/projects/${projectSlug}/github`}
            >
              {!summary?.github?.connected ? (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <p className="text-xs text-collab-500/60 mb-2">Connect a repository</p>
                  <Link
                    href={`/${workspaceSlug}/projects/${projectSlug}/github/settings`}
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    Setup GitHub →
                  </Link>
                </div>
              ) : !summary?.github?.activities?.length ? (
                <EmptyState text="No recent activity" icon={<Github className="h-5 w-5" />} />
              ) : (
                <div className="max-h-[200px] overflow-y-auto">
                  {summary.github.activities.slice(0, 5).map((activity: ActivityItem) => (
                    <ActivityRow key={activity.id} activity={activity} />
                  ))}
                </div>
              )}
            </SectionCard>

            {/* Feature Requests */}
            <SectionCard
              title="Feature Requests"
              subtitle={`${summary?.featureRequests?.length || 0} requests`}
              icon={<Lightbulb className="h-4 w-4 text-amber-400" />}
              iconBg="bg-amber-500/10"
              viewAllHref={`/${workspaceSlug}/projects/${projectSlug}/features`}
            >
              {!summary?.featureRequests?.length ? (
                <EmptyState text="No feature requests" icon={<Lightbulb className="h-5 w-5" />} />
              ) : (
                <div className="max-h-[200px] overflow-y-auto">
                  {summary.featureRequests.slice(0, 5).map((feature: FeatureRequest) => (
                    <FeatureRow
                      key={feature.id}
                      feature={feature}
                      onClick={() => handleFeatureClick(feature.id)}
                    />
                  ))}
                </div>
              )}
            </SectionCard>
          </div>
        </div>

        {/* ─── Context Section ─────────────────────────────────────────────── */}
        <SectionCard
          title="Context"
          subtitle={`${summary?.notes?.length || 0} notes`}
          icon={<StickyNote className="h-4 w-4 text-blue-400" />}
          iconBg="bg-blue-500/10"
          viewAllHref={`/${workspaceSlug}/notes`}
          className="p-0"
        >
          <div className="p-3">
            <NotesCarousel
              notes={summary?.notes || []}
              onNoteClick={handleNoteClick}
              isLoading={isLoading}
            />
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

export default ProjectDashboard;
