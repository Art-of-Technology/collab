"use client";

import { useMemo } from "react";
import Link from "next/link";
import { format } from "date-fns";
import {
  CheckCircle2,
  Circle,
  UserPlus,
  UserMinus,
  AlertTriangle,
  Calendar,
  Tag,
  Play,
  Pause,
  Type,
  Sparkles,
} from "lucide-react";
import { UserAvatar } from '@/components/ui/user-avatar';
import type { ActivityTimelineItem } from "@/hooks/queries/useUnifiedTimeline";

interface ActivityItemProps {
  item: ActivityTimelineItem;
  workspaceSlug: string;
}

// Map actions to icons and colors
const ACTION_CONFIG: Record<
  string,
  { icon: any; color: string; bgColor: string; label: string }
> = {
  CREATED: {
    icon: Sparkles,
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
    label: "created",
  },
  STATUS_CHANGED: {
    icon: CheckCircle2,
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    label: "moved",
  },
  ASSIGNED: {
    icon: UserPlus,
    color: "text-purple-400",
    bgColor: "bg-purple-500/10",
    label: "assigned",
  },
  UNASSIGNED: {
    icon: UserMinus,
    color: "text-orange-400",
    bgColor: "bg-orange-500/10",
    label: "unassigned",
  },
  PRIORITY_CHANGED: {
    icon: AlertTriangle,
    color: "text-amber-400",
    bgColor: "bg-amber-500/10",
    label: "changed priority",
  },
  DUE_DATE_SET: {
    icon: Calendar,
    color: "text-cyan-400",
    bgColor: "bg-cyan-500/10",
    label: "set due date",
  },
  DUE_DATE_CHANGED: {
    icon: Calendar,
    color: "text-cyan-400",
    bgColor: "bg-cyan-500/10",
    label: "changed due date",
  },
  TITLE_UPDATED: {
    icon: Type,
    color: "text-slate-400",
    bgColor: "bg-slate-500/10",
    label: "renamed",
  },
  LABELS_CHANGED: {
    icon: Tag,
    color: "text-pink-400",
    bgColor: "bg-pink-500/10",
    label: "updated labels",
  },
  TASK_PLAY_STARTED: {
    icon: Play,
    color: "text-green-400",
    bgColor: "bg-green-500/10",
    label: "started working on",
  },
  TASK_PLAY_STOPPED: {
    icon: Pause,
    color: "text-slate-400",
    bgColor: "bg-slate-500/10",
    label: "stopped working on",
  },
};

const DEFAULT_CONFIG = {
  icon: Circle,
  color: "text-collab-500",
  bgColor: "bg-collab-600",
  label: "updated",
};

export default function ActivityItem({
  item,
  workspaceSlug,
}: ActivityItemProps) {
  const config = ACTION_CONFIG[item.action] || DEFAULT_CONFIG;
  const Icon = config.icon;

  const issueUrl = item.issue
    ? `/${workspaceSlug}/issues/${item.issue.issueKey}`
    : null;

  // Build the activity message
  const message = useMemo(() => {
    const userName = item.user.name || "Someone";

    // Special handling for status changes
    if (item.action === "STATUS_CHANGED" && item.newValue) {
      const newStatus =
        typeof item.newValue === "object"
          ? item.newValue.name || item.newValue
          : item.newValue;
      return (
        <>
          <span className="text-collab-50 font-medium">{userName}</span>
          <span className="text-collab-500"> moved to </span>
          <span
            className="px-2 py-0.5 rounded-lg text-xs font-medium"
            style={{
              backgroundColor: `${item.issue?.status?.color || "#6366f1"}20`,
              color: item.issue?.status?.color || "#a5b4fc",
            }}
          >
            {newStatus}
          </span>
        </>
      );
    }

    // Special handling for assignments
    if (item.action === "ASSIGNED" && item.newValue) {
      const assigneeName =
        typeof item.newValue === "object"
          ? item.newValue.name || "someone"
          : item.newValue;

      return (
        <>
          <span className="text-collab-50 font-medium">{userName}</span>
          <span className="text-collab-500"> assigned to </span>
          <span className="text-collab-50 font-medium">{assigneeName}</span>
        </>
      );
    }

    // Special handling for priority changes
    if (item.action === "PRIORITY_CHANGED" && item.newValue) {
      const priority =
        typeof item.newValue === "string"
          ? item.newValue
          : item.newValue?.name || "normal";
      const priorityColors: Record<string, string> = {
        urgent: "text-red-400",
        high: "text-orange-400",
        medium: "text-yellow-400",
        low: "text-slate-400",
        normal: "text-slate-400",
      };
      return (
        <>
          <span className="text-collab-50 font-medium">{userName}</span>
          <span className="text-collab-500"> set priority to </span>
          <span className={priorityColors[priority.toLowerCase()] || "text-collab-50"}>
            {priority}
          </span>
        </>
      );
    }

    // Default message
    return (
      <>
        <span className="text-collab-50 font-medium">{userName}</span>
        <span className="text-collab-500"> {config.label}</span>
      </>
    );
  }, [item, config.label]);

  return (
    <div className="group flex items-start gap-3 py-3 px-4 -mx-4 rounded-xl hover:bg-collab-800 transition-colors">
      {/* Icon */}
      <div className={`p-2 rounded-xl ${config.bgColor} mt-0.5 shrink-0`}>
        <Icon className={`h-4 w-4 ${config.color}`} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Message */}
        <p className="text-sm leading-relaxed">{message}</p>

        {/* Issue Link */}
        {item.issue && issueUrl && (
          <Link
            href={issueUrl}
            className="mt-2 inline-flex items-center gap-2 text-sm text-collab-500 hover:text-collab-400 transition-colors group/link"
          >
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{
                backgroundColor: item.issue.project?.color || "#6366f1",
              }}
            />
            <span className="font-mono text-collab-500 group-hover/link:text-collab-400">
              {item.issue.issueKey}
            </span>
            <span className="truncate max-w-[300px]">{item.issue.title}</span>
          </Link>
        )}
      </div>

      {/* Timestamp & Avatar */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <span className="text-xs text-collab-500">
          {format(new Date(item.createdAt), "h:mm a")}
        </span>
        <UserAvatar user={item.user} size="lg" className="ring-1 ring-collab-700" />
      </div>
    </div>
  );
}
