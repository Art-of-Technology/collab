"use client";

import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Check, User, Circle, Clock, CheckCircle2, XCircle, AlertCircle, ArrowUp, ArrowDown, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import type { SearchRelationItemProps } from "../types/relation";
import { cn } from "@/lib/utils";

// Priority icon mapping to match ListViewRenderer
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

// Status icon mapping to match ListViewRenderer  
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

export function SearchRelationItem({
  item,
  isSelected,
  onToggle
}: SearchRelationItemProps) {
  return (
    <div 
      className={cn(
        "group flex items-center px-3 py-2 transition-all duration-150 cursor-pointer rounded-md",
        "hover:bg-[#0f1011]",
        isSelected && "bg-blue-500/10 border-l-2 border-blue-500"
      )}
      onClick={() => onToggle(item)}
    >
      {/* Selection indicator */}
      <div className="flex items-center w-5 mr-2 flex-shrink-0">
        {isSelected ? (
          <Check className="h-3.5 w-3.5 text-blue-500" />
        ) : (
          <div className="h-3.5 w-3.5 border border-[#333] rounded-sm"></div>
        )}
      </div>

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
          <span className="text-[#e6edf3] text-sm font-medium truncate group-hover:text-[#58a6ff] transition-colors">
            {item.title}
          </span>
        </div>
      </div>

      {/* Workspace and Project section */}
      <div className="flex items-center gap-1.5 flex-shrink-0 mr-3">
        {/* Workspace Badge */}
        {item.workspace && (
          <Badge 
            className="h-4 px-1.5 text-[9px] font-medium leading-none border-0 rounded-sm bg-[#333] text-[#9ca3af]"
          >
            {item.workspace.name}
          </Badge>
        )}
        
        {/* Project Badge */}
        {item.project && (
          <Badge 
            className="h-4 px-1.5 text-[9px] font-medium leading-none border-0 rounded-sm bg-opacity-80 hover:bg-opacity-100 transition-all"
            style={{ 
              backgroundColor: (item.project.color || '#6e7681') + '30',
              color: item.project.color || '#8b949e'
            }}
          >
            {item.project.name}
          </Badge>
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
    </div>
  );
}
