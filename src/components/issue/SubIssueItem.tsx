"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Circle,
  CheckCircle2,
  X,
  ArrowUp,
  User,
  Clock,
  XCircle,
  AlertCircle,
  CheckSquare,
  GitBranch,
  Bug,
  Flag,
  Square,
} from "lucide-react";
import { IssueStatusSelector } from "./selectors/IssueStatusSelector";
import { IssuePrioritySelector } from "./selectors/IssuePrioritySelector";
import { IssueAssigneeSelector } from "./selectors/IssueAssigneeSelector";
import { IssueTypeSelector } from "./selectors/IssueTypeSelector";
import { IssueLabelSelector } from "./selectors/IssueLabelSelector";
import { SubIssue } from "./SubIssueManager";

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
  switch (status?.toLowerCase()) {
    case 'todo':
    case 'open':
      return <Circle className="h-3.5 w-3.5 text-slate-500" />;
    case 'in_progress':
    case 'in progress':
      return <Clock className="h-3.5 w-3.5 text-blue-500" />;
    case 'done':
    case 'closed':
      return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
    case 'cancelled':
    case 'canceled':
      return <XCircle className="h-3.5 w-3.5 text-red-500" />;
    case 'blocked':
      return <AlertCircle className="h-3.5 w-3.5 text-yellow-500" />;
    default:
      return <Circle className="h-3.5 w-3.5 text-slate-500" />;
  }
};

// Type icon mapping
const getTypeIcon = (type?: string) => {
  switch (type?.toLowerCase()) {
    case 'task':
      return <CheckSquare className="h-3.5 w-3.5 text-indigo-500" />;
    case 'story':
      return <Circle className="h-3.5 w-3.5 text-green-500" />;
    case 'epic':
      return <GitBranch className="h-3.5 w-3.5 text-purple-500" />;
    case 'milestone':
      return <Flag className="h-3.5 w-3.5 text-amber-500" />;
    case 'defect':
    case 'bug':
      return <Bug className="h-3.5 w-3.5 text-red-500" />;
    case 'subtask':
    default:
      return <Square className="h-3.5 w-3.5 text-gray-500" />;
  }
};

interface SubIssueItemProps {
  subIssue: SubIssue;
  onUpdate: (updates: Partial<SubIssue>) => void;
  onRemove: () => void;
  workspaceId: string;
  projectId?: string;
}

export function SubIssueItem({
  subIssue,
  onUpdate,
  onRemove,
  workspaceId,
  projectId
}: SubIssueItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(subIssue.title);

  const handleTitleSave = () => {
    if (title.trim() !== subIssue.title) {
      onUpdate({ title: title.trim() });
    }
    setIsEditing(false);
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleTitleSave();
    } else if (e.key === 'Escape') {
      setTitle(subIssue.title);
      setIsEditing(false);
    }
  };

  return (
    <div className="group flex items-center px-3 py-2 bg-[#0f1011] border border-[#1f1f1f] rounded-md transition-all">
      {/* Status Icon */}
      <div className="flex items-center w-5 mr-2 flex-shrink-0">
        {getStatusIcon(subIssue.status || 'todo')}
      </div>

      {/* Type Icon */}
      <div className="flex items-center w-5 mr-2 flex-shrink-0">
        {getTypeIcon(subIssue.type)}
      </div>

      {/* Priority and Title section */}
      <div className="flex-1 min-w-0 mr-3">
        <div className="flex items-center gap-2">
          {/* Priority Icon */}
          {subIssue.priority && (
            <div className="flex items-center flex-shrink-0">
              {getPriorityIcon(subIssue.priority)}
            </div>
          )}
          
          {/* Title */}
          <div className="flex-1 min-w-0">
            {isEditing ? (
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={handleTitleKeyDown}
                className="w-full bg-transparent text-sm text-[#e6edf3] border-none outline-none font-medium"
                autoFocus
              />
            ) : (
              <Button
                variant="ghost"
                onClick={() => setIsEditing(true)}
                className="text-left w-full text-sm text-[#e6edf3] hover:text-[#58a6ff] font-medium truncate transition-colors h-auto p-0 justify-start"
              >
                {subIssue.title}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Labels */}
      {subIssue.labels && subIssue.labels.length > 0 && (
        <div className="flex items-center gap-1 mr-3 flex-shrink-0">
          {subIssue.labels.slice(0, 2).map((label, index) => (
            <Badge 
              key={index}
              className="h-4 px-1.5 text-[9px] font-medium leading-none border-0 rounded-sm bg-[#2a2a2a] text-[#8b949e]"
            >
              {label}
            </Badge>
          ))}
          {subIssue.labels.length > 2 && (
            <Badge className="h-4 px-1.5 text-[9px] font-medium leading-none border-0 rounded-sm bg-[#2a2a2a] text-[#8b949e]">
              +{subIssue.labels.length - 2}
            </Badge>
          )}
        </div>
      )}

      {/* Status Selector */}
      <div className="flex items-center mr-2 flex-shrink-0">
        <IssueStatusSelector
          value={subIssue.status}
          onChange={(status) => onUpdate({ status })}
          projectId={projectId}
        />
      </div>

      {/* Priority Selector */}
      <div className="flex items-center mr-2 flex-shrink-0">
        <IssuePrioritySelector
          value={subIssue.priority}
          onChange={(priority) => onUpdate({ priority })}
        />
      </div>

      {/* Assignee Selector */}
      <div className="flex items-center mr-2 flex-shrink-0">
        <IssueAssigneeSelector
          value={subIssue.assigneeId}
          onChange={(assigneeId) => onUpdate({ assigneeId })}
          workspaceId={workspaceId}
        />
      </div>

      {/* Type Selector */}
      <div className="flex items-center mr-2 flex-shrink-0">
        <IssueTypeSelector
          value={subIssue.type}
          onChange={(type) => onUpdate({ type })}
        />
      </div>

      {/* Remove Button */}
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0 hover:bg-red-500/20 flex-shrink-0"
        onClick={onRemove}
      >
        <X className="h-3 w-3 text-[#6e7681] hover:text-red-400" />
      </Button>
    </div>
  );
}

