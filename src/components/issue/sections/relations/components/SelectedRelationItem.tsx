"use client";

import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { X, User, Circle, Clock, CheckCircle2, XCircle, AlertCircle, ArrowUp } from "lucide-react";
import type { RelationItem, IssueRelationType } from "../types/relation";
import { cn } from "@/lib/utils";
import { ISSUE_TYPE_CONFIG, type IssueType } from "@/constants/issue-types";
import { InfoBadge } from "./InfoBadge";

// Priority icon mapping
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

interface SelectedRelationItemProps {
  item: RelationItem;
  relationType: IssueRelationType;
  canChangeRelationType?: boolean;
  onRelationTypeChange: (itemId: string, relationType: IssueRelationType) => void;
  onRemove: (itemId: string) => void;
}

export function SelectedRelationItem({
  item,
  relationType,
  canChangeRelationType = true,
  onRelationTypeChange,
  onRemove
}: SelectedRelationItemProps) {
  return (
    <div className="group flex items-center px-2 py-1.5 bg-[#0f1011] border border-[#1f1f1f] rounded-md transition-all">

      {/* Title and Issue Key section */}
      <div className="flex-1 min-w-0 mr-3">
        <div className="flex items-center gap-2 mb-0.5">
          {/* Priority Icon */}
          {item.priority && (
            <div className="flex items-center flex-shrink-0">
              {getPriorityIcon(item.priority)}
            </div>
          )}

          {/* Issue Key - moved to top */}
          <span className="text-[#8b949e] text-[10px] font-mono font-medium">
            {item.issueKey || item.type.toUpperCase()}
          </span>
        </div>

        {/* Title - moved under issue key */}
        <div className="flex items-center">
          <span className="text-[#e6edf3] text-sm font-medium truncate">
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

      {/* Relation Type Selector */}
      <div className="flex items-center mr-3 flex-shrink-0">
        <Select
          value={relationType}
          onValueChange={(value) => onRelationTypeChange(item.id, value as IssueRelationType)}
          disabled={!canChangeRelationType}
        >
          <SelectTrigger className="w-32 h-6 text-xs bg-[#1a1a1a] border-[#333] text-[#e1e7ef]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-[#1a1a1a] border-[#333]">
            <SelectItem value="child">Sub-issue</SelectItem>
            <SelectItem value="parent">Parent</SelectItem>
            <SelectItem value="blocks">Blocks</SelectItem>
            <SelectItem value="blocked_by">Blocked by</SelectItem>
            <SelectItem value="relates_to">Related</SelectItem>
            <SelectItem value="duplicates">Duplicates</SelectItem>
            <SelectItem value="duplicated_by">Duplicated by</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Remove Button */}
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0 hover:bg-red-500/20 flex-shrink-0"
        onClick={() => onRemove(item.id)}
      >
        <X className="h-3 w-3 text-[#6e7681] hover:text-red-400" />
      </Button>
    </div>
  );
}
