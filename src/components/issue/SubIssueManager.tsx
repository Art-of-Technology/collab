"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { SubIssueItem } from "./SubIssueItem";
import { SubIssueCreate } from "./SubIssueCreate";

export interface SubIssue {
  id: string;
  title: string;
  status?: string;
  priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  assigneeId?: string;
  type?: "TASK" | "EPIC" | "STORY" | "MILESTONE" | "BUG" | "SUBTASK";
  labels?: string[];
  isCreating?: boolean;
}

interface SubIssueManagerProps {
  subIssues: SubIssue[];
  onSubIssueUpdate: (id: string, updates: Partial<SubIssue>) => void;
  onSubIssueRemove: (id: string) => void;
  onSubIssueAdd: (title: string) => void;
  workspaceId: string;
  projectId?: string;
  className?: string;
}

export function SubIssueManager({
  subIssues,
  onSubIssueUpdate,
  onSubIssueRemove,
  onSubIssueAdd,
  workspaceId,
  projectId,
  className
}: SubIssueManagerProps) {
  if (subIssues.length === 0) {
    return null;
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center gap-2">
        <h4 className="text-sm font-medium text-[#e1e7ef]">Sub-issues</h4>
        <span className="text-xs text-[#8b949e] bg-[#1a1a1a] px-2 py-0.5 rounded-full">
          {subIssues.length}
        </span>
      </div>
      
      {/* Sub-issues container with similar styling to AddRelationModal */}
      <div className="border border-[#1a1a1a] rounded-lg p-1 space-y-1 bg-[#0e0e0e]">
        {subIssues.map((subIssue) => (
          <SubIssueItem
            key={subIssue.id}
            subIssue={subIssue}
            onUpdate={(updates) => onSubIssueUpdate(subIssue.id, updates)}
            onRemove={() => onSubIssueRemove(subIssue.id)}
            workspaceId={workspaceId}
            projectId={projectId}
          />
        ))}
        
        <SubIssueCreate
          onAdd={onSubIssueAdd}
        />
      </div>
    </div>
  );
}

