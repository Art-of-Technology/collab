"use client";

import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ExternalLink, X, User, Circle, Clock, CheckCircle2, XCircle, AlertCircle, ArrowUp } from "lucide-react";
import { format } from "date-fns";
import Link from "next/link";
import type { RelationItemProps } from "../types/relation";
import { getRelationItemUrl } from "../utils/relationConfig";
import { cn } from "@/lib/utils";
import { ISSUE_TYPE_CONFIG, type IssueType } from "@/constants/issue-types";
import { InfoBadge } from "./InfoBadge";

// Priority icon mapping to match SearchRelationItem
const getPriorityIcon = (priority: string) => {
  const colorMap = {
    'URGENT': 'text-red-500',
    'HIGH': 'text-orange-500',
    'MEDIUM': 'text-blue-500',
    'LOW': 'text-green-500'
  };

  const colorClass = colorMap[priority as keyof typeof colorMap] || 'text-gray-500';

  return <ArrowUp className={cn("h-3.5 w-3.5", colorClass)} />;
};

// Status badge component similar to IssueStatusSelector
const getStatusIcon = (status: string) => {
  const normalizedStatus = status?.toUpperCase().replace(/[_\s]/g, " ");
  const STATUS_ICONS = {
    TODO: Circle,
    BACKLOG: Circle,
    "IN PROGRESS": Clock,
    REVIEW: Clock,
    TESTING: Clock,
    DONE: CheckCircle2,
    COMPLETED: CheckCircle2,
    CANCELLED: XCircle,
    BLOCKED: AlertCircle,
  } as const;

  return STATUS_ICONS[normalizedStatus as keyof typeof STATUS_ICONS] || Circle;
};

const getStatusColor = (status: string) => {
  const normalizedStatus = status?.toUpperCase().replace(/[_\s]/g, " ");
  const STATUS_COLORS = {
    TODO: "text-slate-500",
    BACKLOG: "text-slate-500",
    "IN PROGRESS": "text-blue-500",
    REVIEW: "text-amber-500",
    TESTING: "text-purple-500",
    DONE: "text-emerald-500",
    COMPLETED: "text-emerald-500",
    CANCELLED: "text-red-500",
    BLOCKED: "text-red-500",
  } as const;

  return STATUS_COLORS[normalizedStatus as keyof typeof STATUS_COLORS] || "text-slate-500";
};

const getStatusDisplayName = (status: string) => {
  const normalizedStatus = status?.toLowerCase().replace(/[_\s]/g, ' ');

  const STATUS_DISPLAY_NAMES = {
    'todo': 'To Do',
    'backlog': 'Backlog',
    'in progress': 'In Progress',
    'review': 'Review',
    'testing': 'Testing',
    'done': 'Done',
    'completed': 'Completed',
    'cancelled': 'Cancelled',
    'blocked': 'Blocked',
  } as const;

  return STATUS_DISPLAY_NAMES[normalizedStatus as keyof typeof STATUS_DISPLAY_NAMES] || status;
};

const StatusBadge = ({ status }: { status: string }) => {
  const Icon = getStatusIcon(status);
  const colorClass = getStatusColor(status);
  const displayName = getStatusDisplayName(status);

  return (
    <InfoBadge>
      <Icon className={cn("h-2.5 w-2.5", colorClass)} />
      {displayName}
    </InfoBadge>
  );
};

export function RelationItem({
  item,
  workspaceId,
  relationType,
  onRemove,
  canRemove = false,
  compact = false
}: RelationItemProps) {
  // Use the target issue's workspace slug if available (for cross-workspace relations),
  // otherwise fall back to the current workspace
  const targetWorkspaceSlug = item.workspace?.slug || workspaceId;
  const itemUrl = getRelationItemUrl(item, targetWorkspaceSlug);

  return (
    <div className="group flex items-center px-2 py-1.5 transition-all duration-150 rounded-md hover:bg-[#0f1011] relative">
      <Link
        href={itemUrl}
        className="flex items-center flex-1 min-w-0"
      >
        {/* Issue title and key section */}
        <div className="flex-1 min-w-0 mr-3">
          <div className="flex items-center gap-2 mb-0.5">
            {/* Priority Icon */}
            {item.priority && (
              <div className="flex items-center flex-shrink-0">
                {getPriorityIcon(item.priority)}
              </div>
            )}

            {/* Issue key */}
            <span className="text-[#8b949e] text-[10px] font-mono font-medium">
              {item.issueKey}
            </span>
          </div>

          {/* Issue title*/}
          <div className="flex items-center">
            <span className="text-[#e6edf3] text-sm font-medium truncate group-hover:text-[#58a6ff] transition-colors">
              {item.title}
            </span>
          </div>
        </div>

        {/* Workspace and Project section */}
        <div className="flex items-center gap-1.5 flex-shrink-0 mr-3">
          {/* Workspace Badge */}
          {item.workspace && (
            <InfoBadge>
              {item.workspace.name}
            </InfoBadge>
          )}

          {/* Project Badge */}
          {item.project && (
            <InfoBadge>
              {item.project.name}
            </InfoBadge>
          )}
          {/* Status Badge */}
          <div className="flex items-center flex-shrink-0">
            <StatusBadge status={item.status || 'todo'} />
          </div>
          {/* Issue Type Badge */}
          {item.type && (
            (() => {
              const typeConfig = ISSUE_TYPE_CONFIG[item.type.toUpperCase() as IssueType] || ISSUE_TYPE_CONFIG.TASK;
              const TypeIcon = typeConfig.icon;

              return (
                <InfoBadge>
                  <TypeIcon
                    className="h-2.5 w-2.5"
                    style={{ color: typeConfig.color }}
                  />
                  {typeConfig.label}
                </InfoBadge>
              );
            })()
          )}
        </div>

        {/* Assignee */}
        <div className="flex items-center w-6 mr-2 flex-shrink-0">
          {item.assignee ? (
            <Avatar className="h-5 w-5">
              <AvatarImage src={item.assignee.image || undefined} />
              <AvatarFallback className="text-xs bg-[#2a2a2a] text-white border-none">
                {item.assignee.name?.charAt(0)?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
          ) : (
            <div className="h-5 w-5 rounded-full bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center">
              <User className="h-2.5 w-2.5 text-[#666]" />
            </div>
          )}
        </div>

        {/* Updated Date */}
        <div className="flex-shrink-0 w-10">
          <span className="text-[#6e7681] text-xs">
            {format(new Date(item.updatedAt), 'MMM d')}
          </span>
        </div>

        <ExternalLink className="h-3 w-3 text-[#666] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-2" />
      </Link>

      {onRemove && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-[#666] hover:text-red-400 hover:bg-red-500/20 opacity-0 group-hover:opacity-100 transition-all ml-2 flex-shrink-0"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove();
          }}
          disabled={!canRemove}
        >
          <X className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}
