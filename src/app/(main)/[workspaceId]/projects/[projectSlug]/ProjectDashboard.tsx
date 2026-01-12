"use client";

import React, { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  FolderOpen,
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
  Users,
  ArrowRight,
  Plus,
  ExternalLink,
  Lightbulb,
  FileText,
  Activity,
  TrendingUp,
  Circle,
  StickyNote,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useViews, type View } from '@/hooks/queries/useViews';
import { useProjectSummary } from '@/hooks/queries/useProjects';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import {
  GitHubActivityWidget,
  FeatureRequestsWidget,
  NotesCarousel,
} from '@/components/widgets';

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
  KANBAN: <LayoutGrid className="h-4 w-4" />,
  LIST: <List className="h-4 w-4" />,
  TABLE: <Table2 className="h-4 w-4" />,
  CALENDAR: <Calendar className="h-4 w-4" />,
  TIMELINE: <GanttChart className="h-4 w-4" />,
};

const viewTypeLabels: Record<string, string> = {
  KANBAN: 'Board',
  LIST: 'List',
  TABLE: 'Table',
  CALENDAR: 'Calendar',
  TIMELINE: 'Timeline',
};

// View Card Component
function ViewCard({
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
        "group relative flex flex-col p-4 rounded-lg border transition-all duration-200",
        "hover:border-[#3f3f46] hover:bg-[#18181b]",
        isDefault
          ? "border-blue-500/30 bg-blue-500/5"
          : "border-[#27272a] bg-[#0d0d0e]"
      )}
    >
      {/* Default badge */}
      {isDefault && (
        <div className="absolute -top-2 -right-2">
          <Badge className="bg-blue-500 text-white text-[9px] px-1.5 py-0">
            Default
          </Badge>
        </div>
      )}

      {/* Icon and type */}
      <div className="flex items-center gap-2 mb-2">
        <div className={cn(
          "p-1.5 rounded",
          isDefault ? "bg-blue-500/20 text-blue-400" : "bg-[#27272a] text-[#71717a]"
        )}>
          {viewTypeIcons[view.displayType] || <LayoutGrid className="h-4 w-4" />}
        </div>
        <span className="text-[10px] text-[#52525b] uppercase tracking-wider">
          {viewTypeLabels[view.displayType] || view.displayType}
        </span>
        {view.isFavorite && (
          <Star className="h-3 w-3 text-amber-400 fill-amber-400 ml-auto" />
        )}
      </div>

      {/* Name */}
      <h3 className="text-sm font-medium text-[#fafafa] group-hover:text-white truncate">
        {view.name}
      </h3>

      {/* Issue count */}
      {view._count && (
        <p className="text-[11px] text-[#52525b] mt-1">
          {view._count.issues} issue{view._count.issues !== 1 ? 's' : ''}
        </p>
      )}

      {/* Arrow indicator on hover */}
      <ArrowRight className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#3f3f46] opacity-0 group-hover:opacity-100 transition-opacity" />
    </Link>
  );
}

// Quick Stat Component
function QuickStat({
  icon,
  value,
  label,
  variant = 'default',
}: {
  icon: React.ReactNode;
  value: number | string;
  label: string;
  variant?: 'default' | 'success' | 'warning' | 'danger';
}) {
  const colors = {
    default: 'text-[#a1a1aa]',
    success: 'text-emerald-400',
    warning: 'text-amber-400',
    danger: 'text-red-400',
  };

  return (
    <div className="flex items-center gap-2">
      <div className={cn("text-[#52525b]", colors[variant])}>
        {icon}
      </div>
      <span className={cn("text-lg font-semibold tabular-nums", colors[variant])}>
        {value}
      </span>
      <span className="text-[11px] text-[#52525b]">{label}</span>
    </div>
  );
}

// Recent Issue Item
function RecentIssueItem({
  issue,
  onClick,
}: {
  issue: {
    id: string;
    title: string;
    issueKey: string;
    updatedAt: string;
    priority: string | null;
    status: { name: string; color: string | null } | null;
    assignee: { name: string | null; image: string | null } | null;
  };
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[#18181b] cursor-pointer transition-colors"
    >
      <Circle
        className="h-2.5 w-2.5 flex-shrink-0"
        style={{ color: issue.status?.color || '#52525b' }}
        fill={issue.status?.color || '#52525b'}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[#52525b] font-mono">{issue.issueKey}</span>
          <span className="text-[13px] text-[#fafafa] truncate">{issue.title}</span>
        </div>
      </div>
      {issue.assignee && (
        <Avatar className="h-5 w-5 flex-shrink-0">
          <AvatarImage src={issue.assignee.image || undefined} />
          <AvatarFallback className="text-[8px] bg-[#27272a]">
            {issue.assignee.name?.charAt(0)?.toUpperCase() || '?'}
          </AvatarFallback>
        </Avatar>
      )}
      <span className="text-[10px] text-[#3f3f46] flex-shrink-0">
        {formatDistanceToNow(new Date(issue.updatedAt), { addSuffix: true })}
      </span>
    </div>
  );
}

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

  const handleIssueClick = (issueKey: string) => {
    router.push(`/${workspaceSlug}/issue/${issueKey}`);
  };

  const handleFeatureClick = (featureId: string) => {
    router.push(`/${workspaceSlug}/projects/${projectSlug}/features/${featureId}`);
  };

  const handleNoteClick = (noteId: string) => {
    router.push(`/${workspaceSlug}/notes/${noteId}`);
  };

  return (
    <div className="h-full flex flex-col bg-[#09090b]">
      {/* Header */}
      <div className="flex-none border-b border-[#1f1f1f]">
        <div className="px-6 py-5">
          <div className="flex items-start justify-between">
            {/* Project Info */}
            <div className="flex items-start gap-4">
              {/* Color indicator */}
              <div
                className="w-1.5 h-12 rounded-full flex-shrink-0"
                style={{ backgroundColor: projectColor || '#6366f1' }}
              />

              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-xl font-semibold text-[#fafafa]">{projectName}</h1>
                </div>
                {projectDescription && (
                  <p className="text-sm text-[#71717a] mt-1 max-w-xl">
                    {projectDescription}
                  </p>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push(`/${workspaceSlug}/projects/${projectSlug}/github`)}
                className="h-8 px-3 text-[#71717a] hover:text-[#fafafa] hover:bg-[#1f1f1f]"
              >
                <GitBranch className="h-4 w-4 mr-1.5" />
                GitHub
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push(`/${workspaceSlug}/projects/${projectSlug}/changelog`)}
                className="h-8 px-3 text-[#71717a] hover:text-[#fafafa] hover:bg-[#1f1f1f]"
              >
                <Tag className="h-4 w-4 mr-1.5" />
                Releases
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push(`/${workspaceSlug}/projects/${projectSlug}/settings`)}
                className="h-8 px-3 text-[#71717a] hover:text-[#fafafa] hover:bg-[#1f1f1f]"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Quick Stats Bar */}
          {summary && (
            <div className="flex items-center gap-6 mt-4 pt-4 border-t border-[#1f1f1f]">
              <QuickStat
                icon={<CheckCircle2 className="h-4 w-4" />}
                value={`${summary.stats.completionRate}%`}
                label="complete"
                variant="success"
              />
              <QuickStat
                icon={<Activity className="h-4 w-4" />}
                value={summary.stats.openIssues}
                label="open"
              />
              <QuickStat
                icon={<AlertTriangle className="h-4 w-4" />}
                value={summary.stats.overdueCount}
                label="overdue"
                variant={summary.stats.overdueCount > 0 ? 'danger' : 'default'}
              />
              <QuickStat
                icon={<Clock className="h-4 w-4" />}
                value={summary.stats.atRiskCount}
                label="at risk"
                variant={summary.stats.atRiskCount > 0 ? 'warning' : 'default'}
              />
              <QuickStat
                icon={<Users className="h-4 w-4" />}
                value={summary.stats.unassignedIssues}
                label="unassigned"
              />
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-6">
          {/* Views Section */}
          <section className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <LayoutGrid className="h-4 w-4 text-[#52525b]" />
                <h2 className="text-sm font-medium text-[#a1a1aa]">Views</h2>
                <span className="text-xs text-[#3f3f46]">({projectViews.length})</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[11px] text-[#52525b] hover:text-[#a1a1aa]"
              >
                <Plus className="h-3 w-3 mr-1" />
                Create View
              </Button>
            </div>

            {projectViews.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {/* Show default view first */}
                {defaultView && (
                  <ViewCard
                    key={defaultView.id}
                    view={defaultView}
                    workspaceSlug={workspaceSlug}
                    isDefault={true}
                  />
                )}
                {/* Then other views */}
                {projectViews
                  .filter((v: View) => v.id !== defaultView?.id)
                  .map((view: View) => (
                    <ViewCard
                      key={view.id}
                      view={view}
                      workspaceSlug={workspaceSlug}
                      isDefault={false}
                    />
                  ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 rounded-lg border border-dashed border-[#27272a] bg-[#0d0d0e]/50">
                <LayoutGrid className="h-8 w-8 text-[#3f3f46] mb-3" />
                <p className="text-sm text-[#52525b] mb-3">No views for this project yet</p>
                <Button
                  size="sm"
                  className="h-8 bg-[#3b82f6] hover:bg-[#2563eb] text-white"
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Create First View
                </Button>
              </div>
            )}
          </section>

          {/* Two Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent Activity */}
            <section className="bg-[#0d0d0e] rounded-lg border border-[#1f1f1f]">
              <div className="flex items-center justify-between px-4 py-3 border-b border-[#1f1f1f]">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-[#52525b]" />
                  <h2 className="text-xs font-medium text-[#a1a1aa] uppercase tracking-wider">Recent Activity</h2>
                </div>
                {defaultView && (
                  <Link
                    href={`/${workspaceSlug}/views/${defaultView.slug || defaultView.id}`}
                    className="text-[11px] text-[#52525b] hover:text-[#a1a1aa] flex items-center gap-1"
                  >
                    View all <ExternalLink className="h-2.5 w-2.5" />
                  </Link>
                )}
              </div>
              <div className="p-2">
                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="h-5 w-5 border-2 border-[#3f3f46] border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : summary?.recentIssues && summary.recentIssues.length > 0 ? (
                  <div className="space-y-0.5">
                    {summary.recentIssues.slice(0, 6).map((issue) => (
                      <RecentIssueItem
                        key={issue.id}
                        issue={issue}
                        onClick={() => handleIssueClick(issue.issueKey)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Activity className="h-6 w-6 text-[#3f3f46] mb-2" />
                    <p className="text-xs text-[#52525b]">No recent activity</p>
                  </div>
                )}
              </div>
            </section>

            {/* At Risk / Overdue */}
            <section className="bg-[#0d0d0e] rounded-lg border border-[#1f1f1f]">
              <div className="flex items-center justify-between px-4 py-3 border-b border-[#1f1f1f]">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-[#52525b]" />
                  <h2 className="text-xs font-medium text-[#a1a1aa] uppercase tracking-wider">Needs Attention</h2>
                  {summary && (summary.stats.overdueCount > 0 || summary.stats.atRiskCount > 0) && (
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] px-1.5 py-0",
                        summary.stats.overdueCount > 0
                          ? "border-red-500/50 text-red-400"
                          : "border-amber-500/50 text-amber-400"
                      )}
                    >
                      {summary.stats.overdueCount + summary.stats.atRiskCount}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="p-2">
                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="h-5 w-5 border-2 border-[#3f3f46] border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : (summary?.atRisk.overdue.length || 0) + (summary?.atRisk.upcoming.length || 0) > 0 ? (
                  <div className="space-y-0.5">
                    {/* Overdue items */}
                    {summary?.atRisk.overdue.slice(0, 3).map((issue) => (
                      <div
                        key={issue.id}
                        onClick={() => handleIssueClick(issue.issueKey)}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-red-500/5 cursor-pointer transition-colors border-l-2 border-red-500/50"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-[#52525b] font-mono">{issue.issueKey}</span>
                            <span className="text-[13px] text-[#fafafa] truncate">{issue.title}</span>
                          </div>
                        </div>
                        <span className="text-[10px] text-red-400 flex-shrink-0">
                          {issue.daysOverdue}d overdue
                        </span>
                      </div>
                    ))}
                    {/* At risk items */}
                    {summary?.atRisk.upcoming.slice(0, 3).map((issue) => (
                      <div
                        key={issue.id}
                        onClick={() => handleIssueClick(issue.issueKey)}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-amber-500/5 cursor-pointer transition-colors border-l-2 border-amber-500/50"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-[#52525b] font-mono">{issue.issueKey}</span>
                            <span className="text-[13px] text-[#fafafa] truncate">{issue.title}</span>
                          </div>
                        </div>
                        <span className="text-[10px] text-amber-400 flex-shrink-0">
                          {issue.daysUntilDue}d left
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <CheckCircle2 className="h-6 w-6 text-emerald-500/50 mb-2" />
                    <p className="text-xs text-[#52525b]">All caught up!</p>
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* Widgets Section - GitHub & Feature Requests */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
            {/* GitHub Activity */}
            <GitHubActivityWidget
              activities={summary?.github?.activities || []}
              repositoryConnected={summary?.github?.connected ?? false}
              workspaceId={workspaceSlug}
              projectSlug={projectSlug}
              isLoading={isLoading}
            />

            {/* Feature Requests */}
            <FeatureRequestsWidget
              featureRequests={summary?.featureRequests || []}
              workspaceId={workspaceSlug}
              projectSlug={projectSlug}
              onFeatureClick={handleFeatureClick}
              isLoading={isLoading}
            />
          </div>

          {/* Context Section */}
          <div className="mt-6 bg-[#0d0d0e] rounded-lg border border-[#1f1f1f] p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <StickyNote className="h-4 w-4 text-[#52525b]" />
                <h2 className="text-xs font-medium text-[#a1a1aa] uppercase tracking-wider">Context</h2>
                <span className="text-xs text-[#3f3f46]">({summary?.notes?.length || 0})</span>
              </div>
              <Link
                href={`/${workspaceSlug}/notes`}
                className="flex items-center gap-1 text-[11px] text-[#52525b] hover:text-[#a1a1aa] transition-colors"
              >
                View all <ExternalLink className="h-2.5 w-2.5" />
              </Link>
            </div>
            <NotesCarousel
              notes={summary?.notes || []}
              onNoteClick={handleNoteClick}
              isLoading={isLoading}
            />
          </div>

          {/* Quick Links Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
            <Link
              href={`/${workspaceSlug}/projects/${projectSlug}/features`}
              className="flex items-center gap-3 p-4 rounded-lg border border-[#27272a] bg-[#0d0d0e] hover:border-[#3f3f46] hover:bg-[#18181b] transition-colors group"
            >
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 group-hover:bg-amber-500/20">
                <Lightbulb className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-[#fafafa]">Feature Requests</p>
                <p className="text-[11px] text-[#52525b]">
                  {summary?.featureRequests.length || 0} requests
                </p>
              </div>
            </Link>

            <Link
              href={`/${workspaceSlug}/projects/${projectSlug}/github`}
              className="flex items-center gap-3 p-4 rounded-lg border border-[#27272a] bg-[#0d0d0e] hover:border-[#3f3f46] hover:bg-[#18181b] transition-colors group"
            >
              <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400 group-hover:bg-purple-500/20">
                <GitBranch className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-[#fafafa]">GitHub</p>
                <p className="text-[11px] text-[#52525b]">
                  {summary?.github.connected ? 'Connected' : 'Not connected'}
                </p>
              </div>
            </Link>

            <Link
              href={`/${workspaceSlug}/projects/${projectSlug}/changelog`}
              className="flex items-center gap-3 p-4 rounded-lg border border-[#27272a] bg-[#0d0d0e] hover:border-[#3f3f46] hover:bg-[#18181b] transition-colors group"
            >
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500/20">
                <Tag className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-[#fafafa]">Releases</p>
                <p className="text-[11px] text-[#52525b]">Changelog</p>
              </div>
            </Link>

            <Link
              href={`/${workspaceSlug}/notes`}
              className="flex items-center gap-3 p-4 rounded-lg border border-[#27272a] bg-[#0d0d0e] hover:border-[#3f3f46] hover:bg-[#18181b] transition-colors group"
            >
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 group-hover:bg-blue-500/20">
                <FileText className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-[#fafafa]">Context</p>
                <p className="text-[11px] text-[#52525b]">
                  {summary?.notes.length || 0} items
                </p>
              </div>
            </Link>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

export default ProjectDashboard;
