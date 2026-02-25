"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface IssueCardProps {
  issueKey: string;
  title: string;
  status?: string;
  statusColor?: string;
  priority?: string;
  assignee?: { name: string; image?: string };
  project?: string;
  onClick?: () => void;
}

const priorityColors: Record<string, string> = {
  urgent: "text-red-400 bg-red-400/10",
  high: "text-orange-400 bg-orange-400/10",
  medium: "text-yellow-400 bg-yellow-400/10",
  low: "text-blue-400 bg-blue-400/10",
  none: "text-collab-500/60 bg-collab-500/10",
};

export default function IssueCard({
  issueKey,
  title,
  status,
  statusColor,
  priority,
  assignee,
  project,
  onClick,
}: IssueCardProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left p-3 rounded-lg bg-collab-700/60 border border-collab-600",
        "hover:border-collab-600 transition-colors group",
        onClick && "cursor-pointer"
      )}
    >
      <div className="flex items-start gap-2">
        {/* Status dot */}
        {status && (
          <div
            className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
            style={{ backgroundColor: statusColor || "#71717a" }}
          />
        )}

        <div className="flex-1 min-w-0">
          {/* Issue key and project */}
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-mono text-collab-500/60">
              {issueKey}
            </span>
            {project && (
              <>
                <span className="text-[10px] text-collab-500/50">in</span>
                <span className="text-[10px] text-collab-500/60">{project}</span>
              </>
            )}
          </div>

          {/* Title */}
          <p className="text-sm text-collab-50 group-hover:text-white truncate">
            {title}
          </p>

          {/* Footer */}
          <div className="flex items-center gap-2 mt-1.5">
            {priority && (
              <span
                className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded font-medium",
                  priorityColors[priority] || priorityColors.none
                )}
              >
                {priority}
              </span>
            )}
            {assignee && (
              <span className="text-[10px] text-collab-500/60">
                {assignee.name}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
