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
  type?: "TASK" | "EPIC" | "STORY" | "MILESTONE" | "DEFECT" | "SUBTASK";
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
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center gap-2">
        <h4 className="text-sm font-medium text-[#e1e7ef]">Sub-issues</h4>
        <span className="text-xs text-[#768390] bg-[#1c2128] px-2 py-0.5 rounded-full">
          {subIssues.length}
        </span>
      </div>
      
      <div className="space-y-2">
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

