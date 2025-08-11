"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  MoreHorizontal,
  Circle,
  CheckCircle2,
  X,
  ChevronDown,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { IssueStatusSelector } from "./selectors/IssueStatusSelector";
import { IssuePrioritySelector } from "./selectors/IssuePrioritySelector";
import { IssueAssigneeSelector } from "./selectors/IssueAssigneeSelector";
import { IssueTypeSelector } from "./selectors/IssueTypeSelector";
import { IssueLabelSelector } from "./selectors/IssueLabelSelector";
import { SubIssue } from "./SubIssueManager";

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
  const [showDropdown, setShowDropdown] = useState(false);
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

  const statusIcon = subIssue.status === 'done' ? (
    <CheckCircle2 className="h-4 w-4 text-green-500" />
  ) : (
    <Circle className="h-4 w-4 text-[#768390]" />
  );

  return (
    <div className="flex items-center gap-2 p-2 bg-[#161b22] border border-[#30363d] rounded-md group hover:border-[#444c56]">
      {statusIcon}
      
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleTitleSave}
            onKeyDown={handleTitleKeyDown}
            className="w-full bg-transparent text-sm text-[#e1e7ef] border-none outline-none"
            autoFocus
          />
        ) : (
          <button
            onClick={() => setIsEditing(true)}
            className="text-left w-full text-sm text-[#e1e7ef] hover:text-white truncate"
          >
            {subIssue.title}
          </button>
        )}
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Popover open={showDropdown} onOpenChange={setShowDropdown}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 hover:bg-[#21262d]"
            >
              <ChevronDown className="h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2 bg-[#161b22] border-[#30363d]" align="end">
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1">
                <IssueStatusSelector
                  value={subIssue.status}
                  onChange={(status) => onUpdate({ status })}
                  projectId={projectId}
                />
                <IssuePrioritySelector
                  value={subIssue.priority}
                  onChange={(priority) => onUpdate({ priority })}
                />
                <IssueAssigneeSelector
                  value={subIssue.assigneeId}
                  onChange={(assigneeId) => onUpdate({ assigneeId })}
                  workspaceId={workspaceId}
                />
                <IssueTypeSelector
                  value={subIssue.type}
                  onChange={(type) => onUpdate({ type })}
                />
                <IssueLabelSelector
                  value={subIssue.labels || []}
                  onChange={(labels) => onUpdate({ labels })}
                  workspaceId={workspaceId}
                />
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <Button
          variant="ghost"
          size="icon"
          onClick={onRemove}
          className="h-6 w-6 hover:bg-red-500/20 hover:text-red-400"
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

