"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import {
  Bug,
  CheckCircle2,
  Circle,
  CircleDot,
  Milestone,
  BookOpen,
  Layers,
  User,
  Folder,
  ExternalLink,
  AlertTriangle,
  Clock,
  TrendingUp,
  ArrowRight,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useWorkspace } from "@/context/WorkspaceContext";

// Types for interactive elements
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

// Status configuration
const statusConfig: Record<string, { bg: string; text: string; border: string; glow?: string }> = {
  "backlog": { bg: "bg-slate-500/10", text: "text-slate-400", border: "border-slate-500/20" },
  "todo": { bg: "bg-slate-500/10", text: "text-slate-400", border: "border-slate-500/20" },
  "in progress": { bg: "bg-blue-500/15", text: "text-blue-400", border: "border-blue-500/25", glow: "shadow-blue-500/10" },
  "in_progress": { bg: "bg-blue-500/15", text: "text-blue-400", border: "border-blue-500/25", glow: "shadow-blue-500/10" },
  "in review": { bg: "bg-purple-500/15", text: "text-purple-400", border: "border-purple-500/25" },
  "in_review": { bg: "bg-purple-500/15", text: "text-purple-400", border: "border-purple-500/25" },
  "done": { bg: "bg-emerald-500/15", text: "text-emerald-400", border: "border-emerald-500/25", glow: "shadow-emerald-500/10" },
  "completed": { bg: "bg-emerald-500/15", text: "text-emerald-400", border: "border-emerald-500/25" },
  "cancelled": { bg: "bg-red-500/10", text: "text-red-400/70", border: "border-red-500/20" },
  "blocked": { bg: "bg-orange-500/15", text: "text-orange-400", border: "border-orange-500/25", glow: "shadow-orange-500/10" },
  "waiting_for_deploy": { bg: "bg-cyan-500/15", text: "text-cyan-400", border: "border-cyan-500/25" },
  "deprecated": { bg: "bg-gray-500/10", text: "text-gray-500", border: "border-gray-500/20" },
};

const getStatusStyle = (status?: string) => {
  if (!status) return statusConfig["backlog"];
  const normalized = status.toLowerCase().trim();
  return statusConfig[normalized] || statusConfig["backlog"];
};

// Priority configuration
const priorityConfig: Record<string, { color: string; icon?: boolean }> = {
  "urgent": { color: "text-red-400", icon: true },
  "high": { color: "text-orange-400" },
  "medium": { color: "text-yellow-400" },
  "low": { color: "text-slate-400" },
};

const getPriorityStyle = (priority?: string) => {
  if (!priority) return priorityConfig["medium"];
  return priorityConfig[priority.toLowerCase()] || priorityConfig["medium"];
};

// Type icons
const typeIcons: Record<string, React.ElementType> = {
  "BUG": Bug,
  "TASK": CheckCircle2,
  "STORY": BookOpen,
  "EPIC": Layers,
  "MILESTONE": Milestone,
  "SUBTASK": CircleDot,
};

/**
 * Interactive Issue Chip - Compact clickable element
 */
export function IssueChip({ data, onClick }: { data: IssueData; onClick?: () => void }) {
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();

  const statusStyle = getStatusStyle(data.status);
  const priorityStyle = getPriorityStyle(data.priority);
  const TypeIcon = typeIcons[data.type?.toUpperCase() || "TASK"] || Circle;

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else if (currentWorkspace?.slug && data.key) {
      router.push(`/${currentWorkspace.slug}/issue/${data.key}`);
    }
  };

  // Don't render if no key
  if (!data.key) return null;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.button
            onClick={handleClick}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.98 }}
            className={cn(
              "inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium",
              "border backdrop-blur-sm transition-all duration-200",
              "hover:shadow-lg cursor-pointer",
              statusStyle.bg,
              statusStyle.text,
              statusStyle.border,
              statusStyle.glow && `hover:${statusStyle.glow}`
            )}
          >
            <TypeIcon className={cn("w-3 h-3", priorityStyle.color)} />
            <span className="font-mono font-semibold">{data.key}</span>
            {priorityStyle.icon && (
              <AlertTriangle className="w-3 h-3 text-red-400 animate-pulse" />
            )}
          </motion.button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="bg-[#0d0d12] border-white/10 p-3 max-w-xs shadow-xl"
        >
          <div className="space-y-2">
            <div className="font-medium text-white text-sm leading-tight">
              {data.title || data.key}
            </div>
            <div className="flex flex-wrap gap-1.5 text-[10px]">
              {data.status && (
                <span className={cn("px-1.5 py-0.5 rounded", statusStyle.bg, statusStyle.text)}>
                  {data.status}
                </span>
              )}
              {data.priority && (
                <span className={cn("px-1.5 py-0.5 rounded bg-white/5", priorityStyle.color)}>
                  {data.priority}
                </span>
              )}
              {data.type && (
                <span className="px-1.5 py-0.5 rounded bg-white/5 text-white/50">
                  {data.type}
                </span>
              )}
            </div>
            {data.assignee && (
              <div className="text-[10px] text-white/40 flex items-center gap-1">
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

/**
 * Interactive User Chip - Clickable user badge
 */
export function UserChip({ data, onClick }: { data: UserData; onClick?: () => void }) {
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else if (currentWorkspace?.slug && data.id) {
      router.push(`/${currentWorkspace.slug}/issues?assignee=${data.id}`);
    }
  };

  const initials = data.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.button
            onClick={handleClick}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.98 }}
            className={cn(
              "inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium",
              "bg-violet-500/10 text-violet-300 border border-violet-500/20",
              "hover:bg-violet-500/20 hover:border-violet-500/30 hover:shadow-lg hover:shadow-violet-500/5",
              "transition-all duration-200 cursor-pointer backdrop-blur-sm"
            )}
          >
            <div className="w-4 h-4 rounded-full bg-gradient-to-br from-violet-400 to-purple-600 flex items-center justify-center text-[8px] font-bold text-white">
              {initials}
            </div>
            <span className="font-medium">{data.name}</span>
          </motion.button>
        </TooltipTrigger>
        <TooltipContent side="top" className="bg-[#0d0d12] border-white/10 p-3">
          <div className="space-y-1">
            <div className="font-medium text-white">{data.name}</div>
            {data.email && <div className="text-xs text-white/40">{data.email}</div>}
            {data.activeIssues !== undefined && (
              <div className="text-xs text-white/50 flex items-center gap-1 mt-1.5">
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

/**
 * Interactive Project Chip - Clickable project badge
 */
export function ProjectChip({ data, onClick }: { data: ProjectData; onClick?: () => void }) {
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else if (currentWorkspace?.slug && (data.id || data.prefix)) {
      router.push(`/${currentWorkspace.slug}/projects/${data.prefix || data.id}`);
    }
  };

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.button
            onClick={handleClick}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.98 }}
            className={cn(
              "inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium",
              "bg-cyan-500/10 text-cyan-300 border border-cyan-500/20",
              "hover:bg-cyan-500/20 hover:border-cyan-500/30 hover:shadow-lg hover:shadow-cyan-500/5",
              "transition-all duration-200 cursor-pointer backdrop-blur-sm"
            )}
          >
            <Folder className="w-3 h-3" />
            <span className="font-medium">{data.name}</span>
            {data.issueCount !== undefined && (
              <span className="text-white/30 text-[10px]">({data.issueCount})</span>
            )}
          </motion.button>
        </TooltipTrigger>
        <TooltipContent side="top" className="bg-[#0d0d12] border-white/10 p-3">
          <div className="space-y-1">
            <div className="font-medium text-white">{data.name}</div>
            {data.prefix && <div className="text-xs text-white/40">Prefix: {data.prefix}</div>}
            {data.issueCount !== undefined && (
              <div className="text-xs text-white/50">{data.issueCount} issues</div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Issue Card - Larger interactive card for displaying issue details
 */
export function IssueCard({ data, onClick }: { data: IssueData; onClick?: () => void }) {
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();

  const statusStyle = getStatusStyle(data.status);
  const priorityStyle = getPriorityStyle(data.priority);
  const TypeIcon = typeIcons[data.type?.toUpperCase() || "TASK"] || Circle;

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else if (currentWorkspace?.slug && data.key) {
      router.push(`/${currentWorkspace.slug}/issue/${data.key}`);
    }
  };

  // Use title as fallback display if no key
  const displayKey = data.key || "—";
  const displayTitle = data.title || "Untitled Issue";

  return (
    <motion.button
      onClick={handleClick}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.99 }}
      className={cn(
        "w-full text-left p-3 rounded-xl",
        "bg-white/[0.02] border border-white/[0.06]",
        "hover:bg-white/[0.04] hover:border-white/[0.1]",
        "transition-all duration-200 cursor-pointer",
        "group backdrop-blur-sm"
      )}
    >
      <div className="flex items-start gap-3">
        {/* Type Icon with status background */}
        <div className={cn("mt-0.5 p-1.5 rounded-lg", statusStyle.bg, statusStyle.border, "border")}>
          <TypeIcon className={cn("w-3.5 h-3.5", priorityStyle.color)} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Key and Priority */}
          <div className="flex items-center gap-2 mb-1">
            {data.key && (
              <span className="font-mono text-xs text-white/40 font-medium">{displayKey}</span>
            )}
            {data.priority && (
              <span className={cn("text-[10px] font-medium uppercase tracking-wide", priorityStyle.color)}>
                {data.priority}
              </span>
            )}
            {priorityStyle.icon && (
              <AlertTriangle className="w-3 h-3 text-red-400" />
            )}
          </div>

          {/* Title */}
          <div className="text-sm text-white/80 line-clamp-2 group-hover:text-white transition-colors">
            {displayTitle}
          </div>

          {/* Meta */}
          <div className="flex items-center gap-2 mt-2 text-[10px] text-white/30">
            {data.status && (
              <span className={cn("px-1.5 py-0.5 rounded", statusStyle.bg, statusStyle.text)}>
                {data.status}
              </span>
            )}
            {data.assignee && data.assignee !== "Unassigned" && (
              <>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <User className="w-3 h-3" />
                  {data.assignee}
                </span>
              </>
            )}
            {data.project && (
              <>
                <span>•</span>
                <span>{data.project}</span>
              </>
            )}
          </div>
        </div>

        {/* Arrow */}
        <ArrowRight className="w-4 h-4 text-white/10 group-hover:text-white/30 group-hover:translate-x-1 transition-all mt-1" />
      </div>
    </motion.button>
  );
}

/**
 * Issue List - Renders a list of issue cards with animation
 */
export function IssueList({ issues }: { issues: IssueData[] }) {
  // Filter out invalid issues
  const validIssues = issues.filter((i) => i.key || i.title);

  if (!validIssues.length) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-white/40 uppercase tracking-wider">
          {validIssues.length} Issue{validIssues.length !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="space-y-2">
        {validIssues.map((issue, i) => (
          <motion.div
            key={issue.key || `issue-${i}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.2 }}
          >
            <IssueCard data={issue} />
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/**
 * User Workload Card - Individual user with workload stats
 */
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

  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const handleClick = () => {
    if (currentWorkspace?.slug && user.id) {
      router.push(`/${currentWorkspace.slug}/issues?assignee=${user.id}`);
    } else if (currentWorkspace?.slug) {
      router.push(`/${currentWorkspace.slug}/issues?q=${encodeURIComponent(user.name)}`);
    }
  };

  // Calculate health indicator
  const isOverloaded = user.totalActive > 10;
  const hasOverdue = (user.overdue || 0) > 0;

  return (
    <motion.button
      onClick={handleClick}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.2 }}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.99 }}
      className={cn(
        "w-full text-left p-4 rounded-xl",
        "bg-white/[0.02] border border-white/[0.06]",
        "hover:bg-white/[0.04] hover:border-white/[0.1]",
        "transition-all duration-200 cursor-pointer group backdrop-blur-sm"
      )}
    >
      <div className="flex items-center justify-between">
        {/* User Info */}
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold",
            "bg-gradient-to-br from-violet-500/20 to-purple-600/20 text-violet-300",
            "border border-violet-500/20"
          )}>
            {initials}
          </div>
          <div>
            <div className="text-sm font-medium text-white/90 group-hover:text-white transition-colors">
              {user.name}
            </div>
            {user.email && (
              <div className="text-xs text-white/30">{user.email}</div>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="text-right">
          <div className={cn(
            "text-2xl font-bold",
            isOverloaded ? "text-orange-400" : hasOverdue ? "text-yellow-400" : "text-white/80"
          )}>
            {user.totalActive}
          </div>
          <div className="text-[10px] text-white/30 uppercase tracking-wider">active</div>
        </div>
      </div>

      {/* Status breakdown */}
      {user.byStatus && Object.keys(user.byStatus).length > 0 && (
        <div className="mt-3 pt-3 border-t border-white/[0.04] flex flex-wrap gap-1.5">
          {Object.entries(user.byStatus)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 4)
            .map(([status, count]) => {
              const style = getStatusStyle(status);
              return (
                <span
                  key={status}
                  className={cn(
                    "px-2 py-0.5 rounded-md text-[10px] font-medium",
                    style.bg,
                    style.text,
                    style.border,
                    "border"
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

/**
 * User Workload List - Renders team workload as cards
 */
/**
 * Dynamic View Card - Compact AI-generated view preview with open action
 */
export interface DynamicViewData {
  name: string;
  displayType: string;
  grouping?: string;
  issueCount: number;
  filterSummary?: string;
  viewUrl: string;
}

export function DynamicViewCard({ data, onClick }: { data: DynamicViewData; onClick?: () => void }) {
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();

  const handleOpen = () => {
    if (onClick) {
      onClick();
    } else if (data.viewUrl && currentWorkspace?.slug) {
      const fullUrl = data.viewUrl.startsWith('/')
        ? `/${currentWorkspace.slug}${data.viewUrl}`
        : data.viewUrl;
      router.push(fullUrl);
    }
  };

  const displayTypeConfig: Record<string, { icon: React.ElementType; label: string; color: string }> = {
    'KANBAN': { icon: Layers, label: 'Board', color: 'text-blue-400' },
    'LIST': { icon: CheckCircle2, label: 'List', color: 'text-emerald-400' },
    'TABLE': { icon: Layers, label: 'Table', color: 'text-violet-400' },
  };

  const config = displayTypeConfig[data.displayType] || displayTypeConfig['LIST'];
  const DisplayIcon = config.icon;

  // Parse filter summary into compact tags
  const filterTags = data.filterSummary && data.filterSummary !== 'no filters'
    ? data.filterSummary.split(', ').slice(0, 3)
    : [];
  const remainingFilters = data.filterSummary && data.filterSummary !== 'no filters'
    ? data.filterSummary.split(', ').length - 3
    : 0;

  return (
    <motion.button
      onClick={handleOpen}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.99 }}
      className={cn(
        "w-full text-left p-3 rounded-lg",
        "bg-[#18181b]/60 border border-[#27272a]",
        "hover:bg-[#1f1f23] hover:border-[#3f3f46]",
        "transition-all duration-200 cursor-pointer group"
      )}
    >
      <div className="flex items-center gap-3">
        {/* Icon */}
        <div className={cn(
          "shrink-0 p-2 rounded-md bg-[#27272a]",
          "group-hover:bg-[#3f3f46] transition-colors"
        )}>
          <DisplayIcon className={cn("w-4 h-4", config.color)} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Title row */}
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-[#fafafa] truncate group-hover:text-white transition-colors">
              {data.name}
            </span>
            <span className={cn(
              "shrink-0 text-[10px] px-1.5 py-0.5 rounded",
              "bg-[#27272a] text-[#71717a]"
            )}>
              {config.label}
            </span>
          </div>

          {/* Meta row */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Issue count */}
            <span className="text-[11px] text-[#71717a]">
              {data.issueCount} {data.issueCount === 1 ? 'issue' : 'issues'}
            </span>

            {/* Grouping */}
            {data.grouping && data.grouping !== 'none' && (
              <>
                <span className="text-[#3f3f46]">·</span>
                <span className="text-[11px] text-[#52525b]">by {data.grouping}</span>
              </>
            )}

            {/* Filter tags */}
            {filterTags.length > 0 && (
              <>
                <span className="text-[#3f3f46]">·</span>
                <div className="flex items-center gap-1">
                  {filterTags.map((tag, i) => (
                    <span
                      key={i}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20"
                    >
                      {tag}
                    </span>
                  ))}
                  {remainingFilters > 0 && (
                    <span className="text-[10px] text-[#52525b]">+{remainingFilters}</span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Arrow */}
        <ArrowRight className="shrink-0 w-4 h-4 text-[#3f3f46] group-hover:text-[#71717a] group-hover:translate-x-0.5 transition-all" />
      </div>
    </motion.button>
  );
}

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
  // Filter out users without names
  const validUsers = users.filter((u) => u.name);

  if (!validUsers.length) return null;

  // Calculate team totals
  const totalActive = validUsers.reduce((sum, u) => sum + u.totalActive, 0);
  const totalOverdue = validUsers.reduce((sum, u) => sum + (u.overdue || 0), 0);

  return (
    <div className="space-y-3">
      {/* Header with summary */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-white/40 uppercase tracking-wider">
          Team Workload ({validUsers.length} member{validUsers.length !== 1 ? "s" : ""})
        </span>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-white/50">{totalActive} total</span>
          {totalOverdue > 0 && (
            <span className="text-orange-400 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              {totalOverdue} overdue
            </span>
          )}
        </div>
      </div>

      {/* User cards */}
      <div className="space-y-2">
        {validUsers.map((user, i) => (
          <UserWorkloadCard key={user.id || user.email || i} user={user} index={i} />
        ))}
      </div>
    </div>
  );
}
