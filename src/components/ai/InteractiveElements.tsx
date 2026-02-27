"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Folder,
  ArrowRight,
  Layers,
  TrendingUp,
  User,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useWorkspace } from "@/context/WorkspaceContext";
import {
  IssueListItem,
  type IssueListItemIssue,
} from "@/components/ui/issue-list-item";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Badge } from "@/components/ui/badge";

// ─── Shared Types ───────────────────────────────────────────────────────────

export interface IssueData {
  key: string;
  title?: string;
  status?: string;
  priority?: string;
  type?: string;
  assignee?: string;
  project?: string;
  dueDate?: string | null;
}

export interface UserData {
  id?: string;
  name: string;
  email?: string;
  activeIssues?: number;
}

export interface ProjectData {
  id?: string;
  name: string;
  prefix?: string;
  issueCount?: number;
}

export interface DynamicViewData {
  name: string;
  displayType: string;
  grouping?: string;
  issueCount: number;
  filterSummary?: string;
  viewUrl: string;
}

// ─── Status Utilities ───────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  backlog:            { bg: "bg-slate-500/10",   text: "text-slate-400" },
  todo:               { bg: "bg-slate-500/10",   text: "text-slate-400" },
  "in progress":      { bg: "bg-blue-500/15",    text: "text-blue-400" },
  in_progress:        { bg: "bg-blue-500/15",    text: "text-blue-400" },
  "in review":        { bg: "bg-purple-500/15",  text: "text-purple-400" },
  in_review:          { bg: "bg-purple-500/15",  text: "text-purple-400" },
  done:               { bg: "bg-emerald-500/15", text: "text-emerald-400" },
  completed:          { bg: "bg-emerald-500/15", text: "text-emerald-400" },
  cancelled:          { bg: "bg-red-500/10",     text: "text-red-400/70" },
  blocked:            { bg: "bg-orange-500/15",  text: "text-orange-400" },
  waiting_for_deploy: { bg: "bg-cyan-500/15",    text: "text-cyan-400" },
};

function getStatusStyle(status?: string) {
  if (!status) return STATUS_STYLES.backlog;
  return STATUS_STYLES[status.toLowerCase().trim()] || STATUS_STYLES.backlog;
}

/** Map status to IssueListItem variant */
function getIssueVariant(
  status?: string
): "default" | "completed" | "blocked" | "danger" {
  if (!status) return "default";
  const s = status.toLowerCase().trim();
  if (s === "done" || s === "completed") return "completed";
  if (s === "blocked") return "blocked";
  if (s === "cancelled") return "danger";
  return "default";
}

/** Convert AI IssueData → shared IssueListItemIssue */
function mapIssueData(data: IssueData): IssueListItemIssue {
  return {
    id: data.key || `ai-${Math.random().toString(36).slice(2, 9)}`,
    title: data.title || data.key || "Untitled Issue",
    issueKey: data.key || undefined,
    status: data.status,
    priority: data.priority?.toUpperCase(),
    assignee:
      data.assignee && data.assignee !== "Unassigned"
        ? { name: data.assignee }
        : null,
    project: data.project ? { name: data.project } : undefined,
  };
}

// ─── Inline Status Badge ────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const style = getStatusStyle(status);
  return (
    <span
      className={cn(
        "text-[10px] px-1.5 py-0.5 rounded font-medium whitespace-nowrap",
        style.bg,
        style.text
      )}
    >
      {status}
    </span>
  );
}

// ─── IssueCard ──────────────────────────────────────────────────────────────
// Uses the shared IssueListItem — consistent with dashboard issue rendering.

export function IssueCard({
  data,
  onClick,
}: {
  data: IssueData;
  onClick?: () => void;
}) {
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();

  const handleClick = (e: React.MouseEvent) => {
    if (onClick) {
      onClick();
    } else if (currentWorkspace?.slug && data.key) {
      router.push(`/${currentWorkspace.slug}/issues/${data.key}`);
    }
  };

  if (!data.key && !data.title) return null;

  const issue = mapIssueData(data);
  const variant = getIssueVariant(data.status);

  return (
    <IssueListItem
      issue={issue}
      variant={variant}
      showKey={!!data.key}
      showPriority={!!data.priority}
      showAssignee={!!data.assignee && data.assignee !== "Unassigned"}
      onClick={handleClick}
      extra={data.status ? <StatusBadge status={data.status} /> : undefined}
      className="rounded-lg border border-transparent hover:border-collab-700 hover:bg-collab-800 transition-all"
    />
  );
}

// ─── IssueChip ──────────────────────────────────────────────────────────────
// Compact inline badge for referencing issues within text.

export function IssueChip({
  data,
  onClick,
}: {
  data: IssueData;
  onClick?: () => void;
}) {
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else if (currentWorkspace?.slug && data.key) {
      router.push(`/${currentWorkspace.slug}/issues/${data.key}`);
    }
  };

  if (!data.key) return null;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={handleClick}
            className={cn(
              "inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium",
              "border transition-colors cursor-pointer",
              "bg-collab-800 border-collab-700 text-collab-50",
              "hover:bg-collab-700 hover:border-collab-600"
            )}
          >
            <span className="font-mono font-semibold text-collab-400">
              {data.key}
            </span>
            {data.priority?.toLowerCase() === "urgent" && (
              <AlertTriangle className="w-3 h-3 text-red-400" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="bg-collab-900 border-collab-700 p-3 max-w-xs shadow-xl"
        >
          <div className="space-y-2">
            <div className="font-medium text-collab-50 text-sm leading-tight">
              {data.title || data.key}
            </div>
            <div className="flex flex-wrap gap-1.5 text-[10px]">
              {data.status && <StatusBadge status={data.status} />}
              {data.priority && (
                <span className="px-1.5 py-0.5 rounded bg-collab-800 text-collab-400">
                  {data.priority}
                </span>
              )}
            </div>
            {data.assignee && (
              <div className="text-[10px] text-collab-500 flex items-center gap-1">
                <User className="w-3 h-3" />
                {data.assignee}
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ─── IssueList ──────────────────────────────────────────────────────────────
// Animated list of IssueCard — mirrors dashboard "Your Work" section pattern.

export function IssueList({ issues }: { issues: IssueData[] }) {
  const validIssues = issues.filter((i) => i.key || i.title);
  if (!validIssues.length) return null;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="text-xs font-medium text-collab-500 uppercase tracking-wider">
          {validIssues.length} Issue{validIssues.length !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="space-y-0.5">
        {validIssues.map((issue, i) => (
          <motion.div
            key={issue.key || `issue-${i}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03, duration: 0.15 }}
          >
            <IssueCard data={issue} />
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ─── UserChip ───────────────────────────────────────────────────────────────
// Compact user reference — uses shared UserAvatar component.

export function UserChip({
  data,
  onClick,
}: {
  data: UserData;
  onClick?: () => void;
}) {
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else if (currentWorkspace?.slug && data.id) {
      router.push(`/${currentWorkspace.slug}/issues?assignee=${data.id}`);
    }
  };

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={handleClick}
            className={cn(
              "inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium",
              "bg-collab-800 text-collab-50 border border-collab-700",
              "hover:bg-collab-700 hover:border-collab-600",
              "transition-colors cursor-pointer"
            )}
          >
            <UserAvatar
              user={{ name: data.name }}
              size="xs"
              className="flex-shrink-0"
            />
            <span className="font-medium">{data.name}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="bg-collab-900 border-collab-700 p-3"
        >
          <div className="space-y-1">
            <div className="font-medium text-collab-50">{data.name}</div>
            {data.email && (
              <div className="text-xs text-collab-500">{data.email}</div>
            )}
            {data.activeIssues !== undefined && (
              <div className="text-xs text-collab-400 flex items-center gap-1 mt-1.5">
                <TrendingUp className="w-3 h-3" />
                {data.activeIssues} active issues
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ─── ProjectChip ────────────────────────────────────────────────────────────
// Compact project reference — design system styled.

export function ProjectChip({
  data,
  onClick,
}: {
  data: ProjectData;
  onClick?: () => void;
}) {
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else if (currentWorkspace?.slug && (data.id || data.prefix)) {
      router.push(
        `/${currentWorkspace.slug}/projects/${data.prefix || data.id}`
      );
    }
  };

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={handleClick}
            className={cn(
              "inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium",
              "bg-collab-800 text-collab-50 border border-collab-700",
              "hover:bg-collab-700 hover:border-collab-600",
              "transition-colors cursor-pointer"
            )}
          >
            <Folder className="w-3 h-3 text-collab-500" />
            <span className="font-medium">{data.name}</span>
            {data.issueCount !== undefined && (
              <span className="text-collab-500 text-[10px]">
                ({data.issueCount})
              </span>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="bg-collab-900 border-collab-700 p-3"
        >
          <div className="space-y-1">
            <div className="font-medium text-collab-50">{data.name}</div>
            {data.prefix && (
              <div className="text-xs text-collab-500">
                Prefix: {data.prefix}
              </div>
            )}
            {data.issueCount !== undefined && (
              <div className="text-xs text-collab-400">
                {data.issueCount} issues
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ─── UserWorkloadCard ───────────────────────────────────────────────────────
// Individual workload card — uses shared UserAvatar + design tokens.

function UserWorkloadCard({
  user,
  index,
}: {
  user: {
    id?: string;
    name: string;
    email?: string;
    totalActive: number;
    overdue?: number;
    byStatus?: Record<string, number>;
    highPriority?: number;
    completedThisWeek?: number;
  };
  index: number;
}) {
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();

  const handleClick = () => {
    if (currentWorkspace?.slug && user.id) {
      router.push(`/${currentWorkspace.slug}/issues?assignee=${user.id}`);
    } else if (currentWorkspace?.slug) {
      router.push(
        `/${currentWorkspace.slug}/issues?q=${encodeURIComponent(user.name)}`
      );
    }
  };

  const isOverloaded = user.totalActive > 10;
  const hasOverdue = (user.overdue || 0) > 0;

  return (
    <motion.button
      onClick={handleClick}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.15 }}
      className={cn(
        "w-full text-left p-4 rounded-xl",
        "bg-collab-800 border border-collab-700",
        "hover:bg-collab-700 hover:border-collab-600",
        "transition-all cursor-pointer group"
      )}
    >
      <div className="flex items-center justify-between">
        {/* User info */}
        <div className="flex items-center gap-3">
          <UserAvatar
            user={{ name: user.name }}
            size="lg"
            className="h-9 w-9 flex-shrink-0"
          />
          <div>
            <div className="text-sm font-medium text-collab-50 group-hover:text-white transition-colors">
              {user.name}
            </div>
            {user.email && (
              <div className="text-xs text-collab-500">{user.email}</div>
            )}
          </div>
        </div>

        {/* Active count */}
        <div className="text-right">
          <div
            className={cn(
              "text-2xl font-bold tabular-nums",
              isOverloaded
                ? "text-orange-400"
                : hasOverdue
                  ? "text-amber-400"
                  : "text-collab-50"
            )}
          >
            {user.totalActive}
          </div>
          <div className="text-[10px] text-collab-500 uppercase tracking-wider">
            active
          </div>
        </div>
      </div>

      {/* Status breakdown */}
      {user.byStatus && Object.keys(user.byStatus).length > 0 && (
        <div className="mt-3 pt-3 border-t border-collab-700 flex flex-wrap gap-1.5">
          {Object.entries(user.byStatus)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 4)
            .map(([status, count]) => {
              const style = getStatusStyle(status);
              return (
                <span
                  key={status}
                  className={cn(
                    "px-2 py-0.5 rounded-md text-[10px] font-medium border",
                    style.bg,
                    style.text,
                    "border-collab-700"
                  )}
                >
                  {count} {status}
                </span>
              );
            })}
        </div>
      )}

      {/* Alerts row */}
      {((user.overdue || 0) > 0 || (user.completedThisWeek || 0) > 0) && (
        <div className="mt-2 flex items-center gap-3 text-xs">
          {(user.overdue || 0) > 0 && (
            <span className="flex items-center gap-1 text-orange-400">
              <AlertTriangle className="w-3 h-3" />
              {user.overdue} overdue
            </span>
          )}
          {(user.completedThisWeek || 0) > 0 && (
            <span className="flex items-center gap-1 text-emerald-400">
              <CheckCircle2 className="w-3 h-3" />
              {user.completedThisWeek} done this week
            </span>
          )}
        </div>
      )}
    </motion.button>
  );
}

// ─── UserWorkloadList ───────────────────────────────────────────────────────

export function UserWorkloadList({
  users,
}: {
  users: Array<{
    id?: string;
    name: string;
    email?: string;
    totalActive: number;
    overdue?: number;
    byStatus?: Record<string, number>;
    highPriority?: number;
    completedThisWeek?: number;
  }>;
}) {
  const validUsers = users.filter((u) => u.name);
  if (!validUsers.length) return null;

  const totalActive = validUsers.reduce((sum, u) => sum + u.totalActive, 0);
  const totalOverdue = validUsers.reduce(
    (sum, u) => sum + (u.overdue || 0),
    0
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-medium text-collab-500 uppercase tracking-wider">
          Team Workload ({validUsers.length} member
          {validUsers.length !== 1 ? "s" : ""})
        </span>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-collab-400">{totalActive} total</span>
          {totalOverdue > 0 && (
            <span className="text-orange-400 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              {totalOverdue} overdue
            </span>
          )}
        </div>
      </div>
      <div className="space-y-2">
        {validUsers.map((user, i) => (
          <UserWorkloadCard
            key={user.id || user.email || i}
            user={user}
            index={i}
          />
        ))}
      </div>
    </div>
  );
}

// ─── DynamicViewCard ────────────────────────────────────────────────────────

export function DynamicViewCard({
  data,
  onClick,
}: {
  data: DynamicViewData;
  onClick?: () => void;
}) {
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();

  const handleOpen = () => {
    if (onClick) {
      onClick();
    } else if (data.viewUrl && currentWorkspace?.slug) {
      const fullUrl = data.viewUrl.startsWith("/")
        ? `/${currentWorkspace.slug}${data.viewUrl}`
        : data.viewUrl;
      router.push(fullUrl);
    }
  };

  const displayTypeConfig: Record<
    string,
    { icon: React.ElementType; label: string; color: string }
  > = {
    KANBAN: { icon: Layers, label: "Board", color: "text-blue-400" },
    LIST: { icon: CheckCircle2, label: "List", color: "text-emerald-400" },
    TABLE: { icon: Layers, label: "Table", color: "text-violet-400" },
  };

  const config =
    displayTypeConfig[data.displayType] || displayTypeConfig.LIST;
  const DisplayIcon = config.icon;

  const filterTags =
    data.filterSummary && data.filterSummary !== "no filters"
      ? data.filterSummary.split(", ").slice(0, 3)
      : [];
  const remainingFilters =
    data.filterSummary && data.filterSummary !== "no filters"
      ? data.filterSummary.split(", ").length - 3
      : 0;

  return (
    <button
      onClick={handleOpen}
      className={cn(
        "w-full text-left p-3 rounded-lg",
        "bg-collab-800 border border-collab-700",
        "hover:bg-collab-700 hover:border-collab-600",
        "transition-all cursor-pointer group"
      )}
    >
      <div className="flex items-center gap-3">
        <div className="shrink-0 p-2 rounded-md bg-collab-900 border border-collab-700">
          <DisplayIcon className={cn("w-4 h-4", config.color)} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-collab-50 truncate group-hover:text-white transition-colors">
              {data.name}
            </span>
            <Badge className="h-4 px-1.5 text-[10px] font-medium leading-none border-0 rounded-sm bg-collab-700 text-collab-400">
              {config.label}
            </Badge>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-collab-500">
              {data.issueCount} {data.issueCount === 1 ? "issue" : "issues"}
            </span>

            {data.grouping && data.grouping !== "none" && (
              <>
                <span className="text-collab-500/50">·</span>
                <span className="text-[11px] text-collab-500/60">
                  by {data.grouping}
                </span>
              </>
            )}

            {filterTags.length > 0 && (
              <>
                <span className="text-collab-500/50">·</span>
                <div className="flex items-center gap-1">
                  {filterTags.map((tag, i) => (
                    <Badge
                      key={i}
                      className="h-4 px-1.5 text-[10px] font-medium leading-none border-0 rounded-sm bg-violet-500/10 text-violet-400"
                    >
                      {tag}
                    </Badge>
                  ))}
                  {remainingFilters > 0 && (
                    <span className="text-[10px] text-collab-500/60">
                      +{remainingFilters}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <ArrowRight className="shrink-0 w-4 h-4 text-collab-500/50 group-hover:text-collab-400 group-hover:translate-x-0.5 transition-all" />
      </div>
    </button>
  );
}
