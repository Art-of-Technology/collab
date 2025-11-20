"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ExternalLink, X, User, Circle, Clock, CheckCircle2, XCircle, AlertCircle, ArrowUp, ArrowDown, Shield, ShieldAlert, Link2, Copy, ChevronDown, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import Link from "next/link";
import type { RelationItemProps } from "../types/relation";
import { getRelationItemUrl } from "../utils/relationConfig";
import { cn } from "@/lib/utils";
import { ISSUE_TYPE_CONFIG, type IssueType } from "@/constants/issue-types";
import { InfoBadge } from "./InfoBadge";
import { getIssuePriorityBadge, PRIORITY_CONFIG } from "@/utils/issueHelpers";
import type { IssuePriority } from "@/types/issue";
import type { RelationConfig } from "../types/relation";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

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

// Map icon string names to icon components
const getRelationIcon = (iconName: string) => {
  const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
    'arrow-up': ArrowUp,
    'arrow-down': ArrowDown,
    'shield': Shield,
    'shield-alert': ShieldAlert,
    'link': Link2,
    'copy': Copy,
  };
  return iconMap[iconName] || Link2;
};

// Map color strings to text color classes
const getRelationColor = (color: string) => {
  const colorMap: Record<string, string> = {
    'blue': 'text-blue-500',
    'green': 'text-green-500',
    'red': 'text-red-500',
    'orange': 'text-orange-500',
    'purple': 'text-purple-500',
    'gray': 'text-gray-500',
  };
  return colorMap[color] || 'text-gray-500';
};

const StatusBadge = ({ status }: { status: string }) => {
  const Icon = getStatusIcon(status);
  const colorClass = getStatusColor(status);
  const displayName = getStatusDisplayName(status);

  return (
    <InfoBadge>
      <Icon className={cn("h-3 w-3", colorClass)} />
      {displayName}
    </InfoBadge>
  );
};

export function RelationItem({
  item,
  workspaceId,
  relationTypeConfig,
  onRemove,
  canRemove = false,
}: RelationItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Use the target issue's workspace slug if available (for cross-workspace relations),
  // otherwise fall back to the current workspace
  const targetWorkspaceSlug = item.workspace?.slug || workspaceId;
  const itemUrl = getRelationItemUrl(item, targetWorkspaceSlug);

  // Get icon and color from relation config
  const RelationIcon = relationTypeConfig?.icon ? getRelationIcon(relationTypeConfig.icon) : Link2;
  const relationColorClass = relationTypeConfig?.color ? getRelationColor(relationTypeConfig.color) : 'text-gray-500';

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <div className="group flex flex-col md:flex-row md:items-center px-2 py-1.5 md:py-1 transition-all duration-150 rounded-md hover:bg-[#0f1011] relative">
        {/* Mobile: Main row with relation type, key, title, and expand button */}
        {/* Desktop: Inline layout */}
        <div className="flex items-center flex-1 min-w-0">
          {relationTypeConfig && (
            <InfoBadge className="mr-2 flex-shrink-0">
              <RelationIcon className={cn("h-3 w-3", relationColorClass)} />
              {relationTypeConfig.label}
            </InfoBadge>
          )}
          
          <Link
            href={itemUrl}
            className="flex items-center flex-1 min-w-0 overflow-hidden"
          >
            {/* Issue title and key - Always visible */}
            <div className="flex-1 min-w-0 mr-2 md:mr-3 overflow-hidden">
              <div className="flex items-center gap-2 min-w-0">
                {/* Issue key */}
                <span className="text-[#8b949e] text-xs font-mono font-medium flex-shrink-0">
                  {item.issueKey}
                </span>

                {/* Issue title */}
                <span className="text-[#e6edf3] text-sm font-medium truncate group-hover:text-[#58a6ff] transition-colors min-w-0">
                  {item.title}
                </span>
              </div>
            </div>

            {/* Desktop: Badges section - Status, Priority, Type, Workspace, Project */}
            <div className="hidden md:flex items-center gap-1.5 flex-shrink-0 mr-3">
              {/* Status Badge - First */}
              <StatusBadge status={item.status || 'todo'} />

              {/* Priority Badge - Second */}
              {item.priority && (
                (() => {
                  const priorityBadge = getIssuePriorityBadge(item.priority as IssuePriority);
                  const PriorityIcon = priorityBadge.icon;
                  const normalizedPriority = (item.priority as string).toUpperCase() as IssuePriority;
                  const priorityConfig = PRIORITY_CONFIG[normalizedPriority] || PRIORITY_CONFIG.LOW;

                  return (
                    <InfoBadge className="flex-shrink-0">
                      <PriorityIcon className={cn("h-3 w-3", priorityConfig.color, priorityConfig.darkColor)} />
                      {priorityBadge.label}
                    </InfoBadge>
                  );
                })()
              )}

              {/* Issue Type Badge - Third */}
              {item.type && (
                (() => {
                  const typeConfig = ISSUE_TYPE_CONFIG[item.type.toUpperCase() as IssueType] || ISSUE_TYPE_CONFIG.TASK;
                  const TypeIcon = typeConfig.icon;

                  return (
                    <InfoBadge className="flex-shrink-0">
                      <TypeIcon
                        className="h-3 w-3"
                        style={{ color: typeConfig.color }}
                      />
                      {typeConfig.label}
                    </InfoBadge>
                  );
                })()
              )}

              {/* Workspace Badge */}
              {item.workspace && (
                <InfoBadge className="flex-shrink-0">
                  {item.workspace.name}
                </InfoBadge>
              )}

              {/* Project Badge */}
              {item.project && (
                <InfoBadge className="flex-shrink-0">
                  {item.project.name}
                </InfoBadge>
              )}
            </div>

            {/* Desktop: Assignee */}
            <div className="hidden md:flex items-center w-6 mr-2 flex-shrink-0">
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

            {/* Desktop: Updated Date */}
            <div className="hidden md:flex flex-shrink-0 min-w-[3.5rem]">
              <span className="text-[#6e7681] text-xs whitespace-nowrap">
                {format(new Date(item.updatedAt), 'MMM d')}
              </span>
            </div>

            {/* Desktop: External Link */}
            <ExternalLink className="hidden md:block h-3 w-3 text-[#666] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-2" />
          </Link>

          {/* Mobile: Expand/Collapse button */}
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="md:hidden h-6 w-6 p-0 text-[#7d8590] hover:text-[#c9d1d9] flex-shrink-0 ml-2"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsExpanded(!isExpanded);
              }}
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
          </CollapsibleTrigger>

          {/* Desktop: Remove button */}
          {onRemove && (
            <Button
              variant="ghost"
              size="sm"
              className="hidden md:flex h-6 w-6 p-0 text-[#666] hover:text-red-400 hover:bg-red-500/20 opacity-0 group-hover:opacity-100 transition-all ml-2 flex-shrink-0"
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

        {/* Mobile: Collapsible details section */}
        <CollapsibleContent className="md:hidden">
          <div className="mt-2 pt-2 border-t border-[#1f1f1f] space-y-2">
            {/* Badges row */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* Status Badge */}
              <StatusBadge status={item.status || 'todo'} />

              {/* Priority Badge */}
              {item.priority && (
                (() => {
                  const priorityBadge = getIssuePriorityBadge(item.priority as IssuePriority);
                  const PriorityIcon = priorityBadge.icon;
                  const normalizedPriority = (item.priority as string).toUpperCase() as IssuePriority;
                  const priorityConfig = PRIORITY_CONFIG[normalizedPriority] || PRIORITY_CONFIG.LOW;

                  return (
                    <InfoBadge className="flex-shrink-0">
                      <PriorityIcon className={cn("h-3 w-3", priorityConfig.color, priorityConfig.darkColor)} />
                      {priorityBadge.label}
                    </InfoBadge>
                  );
                })()
              )}

              {/* Issue Type Badge */}
              {item.type && (
                (() => {
                  const typeConfig = ISSUE_TYPE_CONFIG[item.type.toUpperCase() as IssueType] || ISSUE_TYPE_CONFIG.TASK;
                  const TypeIcon = typeConfig.icon;

                  return (
                    <InfoBadge className="flex-shrink-0">
                      <TypeIcon
                        className="h-3 w-3"
                        style={{ color: typeConfig.color }}
                      />
                      {typeConfig.label}
                    </InfoBadge>
                  );
                })()
              )}

              {/* Workspace Badge */}
              {item.workspace && (
                <InfoBadge className="flex-shrink-0">
                  {item.workspace.name}
                </InfoBadge>
              )}

              {/* Project Badge */}
              {item.project && (
                <InfoBadge className="flex-shrink-0">
                  {item.project.name}
                </InfoBadge>
              )}
            </div>

            {/* Bottom row: Assignee, Date, Actions */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {/* Assignee */}
                {item.assignee ? (
                  <div className="flex items-center gap-1.5">
                    <Avatar className="h-5 w-5">
                      <AvatarImage src={item.assignee.image || undefined} />
                      <AvatarFallback className="text-xs bg-[#2a2a2a] text-white border-none">
                        {item.assignee.name?.charAt(0)?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-xs text-[#8b949e]">{item.assignee.name}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <div className="h-5 w-5 rounded-full bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center">
                      <User className="h-2.5 w-2.5 text-[#666]" />
                    </div>
                    <span className="text-xs text-[#6e7681]">Unassigned</span>
                  </div>
                )}

                {/* Date */}
                <span className="text-xs text-[#6e7681] whitespace-nowrap">
                  {format(new Date(item.updatedAt), 'MMM d')}
                </span>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <Link
                  href={itemUrl}
                  className="text-[#7d8590] hover:text-[#c9d1d9] transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="h-4 w-4" />
                </Link>
                {onRemove && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-[#666] hover:text-red-400 hover:bg-red-500/20"
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
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
