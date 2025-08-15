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
import { format } from "date-fns";
import type { RelationItem, IssueRelationType } from "../types/relation";
import { cn } from "@/lib/utils";

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

// Status icon mapping
const getStatusIcon = (status: string) => {
  const normalizedStatus = status?.toLowerCase().replace(/[_\s]/g, ' ');
  const iconClass = "h-3.5 w-3.5";
  
  switch (normalizedStatus) {
    case 'todo':
    case 'backlog':
      return <Circle className={cn(iconClass, "text-[#8b949e]")} />;
    case 'in progress':
    case 'active':
    case 'working':
      return <Clock className={cn(iconClass, "text-[#3b82f6]")} />;
    case 'review':
    case 'testing':
      return <Clock className={cn(iconClass, "text-[#f59e0b]")} />;
    case 'done':
    case 'completed':
      return <CheckCircle2 className={cn(iconClass, "text-[#22c55e]")} fill="currentColor" />;
    case 'cancelled':
    case 'rejected':
      return <XCircle className={cn(iconClass, "text-[#ef4444]")} fill="currentColor" />;
    case 'blocked':
      return <AlertCircle className={cn(iconClass, "text-[#f59e0b]")} />;
    default:
      return <Circle className={cn(iconClass, "text-[#8b949e]")} />;
  }
};

interface SelectedRelationItemProps {
  item: RelationItem;
  relationType: IssueRelationType;
  onRelationTypeChange: (itemId: string, relationType: IssueRelationType) => void;
  onRemove: (itemId: string) => void;
}

export function SelectedRelationItem({
  item,
  relationType,
  onRelationTypeChange,
  onRemove
}: SelectedRelationItemProps) {
  return (
    <div className="group flex items-center px-3 py-2 bg-[#0f1011] border border-[#1f1f1f] rounded-md transition-all">
      {/* Status Icon */}
      <div className="flex items-center w-5 mr-2 flex-shrink-0">
        {getStatusIcon(item.status || 'todo')}
      </div>

      {/* Issue Key */}
      <div className="w-16 flex-shrink-0 mr-2">
        <span className="text-[#8b949e] text-xs font-mono font-medium">
          {item.issueKey || item.type.toUpperCase()}
        </span>
      </div>

      {/* Priority and Title section */}
      <div className="flex-1 min-w-0 mr-3">
        <div className="flex items-center gap-2">
          {/* Priority Icon */}
          {item.priority && (
            <div className="flex items-center flex-shrink-0">
              {getPriorityIcon(item.priority)}
            </div>
          )}
          
          {/* Title */}
          <span className="text-[#e6edf3] text-sm font-medium truncate">
            {item.title}
          </span>
        </div>
      </div>

      {/* Project Badge */}
      {item.project && (
        <div className="flex items-center mr-3 flex-shrink-0">
          <Badge 
            className="h-4 px-1.5 text-[9px] font-medium leading-none border-0 rounded-sm bg-opacity-80"
            style={{ 
              backgroundColor: (item.project.color || '#6e7681') + '30',
              color: item.project.color || '#8b949e'
            }}
          >
            {item.project.name}
          </Badge>
        </div>
      )}

      {/* Assignee */}
      <div className="flex items-center w-6 mr-3 flex-shrink-0">
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
