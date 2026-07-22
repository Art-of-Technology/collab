"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface ProjectCardProps {
  name: string;
  color?: string;
  issueCount?: number;
  completedCount?: number;
  onClick?: () => void;
}

export default function ProjectCard({
  name,
  color = "#8b5cf6",
  issueCount = 0,
  completedCount = 0,
  onClick,
}: ProjectCardProps) {
  const progress = issueCount > 0 ? (completedCount / issueCount) * 100 : 0;

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left p-3 rounded-lg bg-collab-700/60 border border-collab-600",
        "hover:border-collab-600 transition-colors",
        onClick && "cursor-pointer"
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-3 h-3 rounded-sm"
          style={{ backgroundColor: color }}
        />
        <span className="text-sm font-medium text-collab-50">{name}</span>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-[10px] text-collab-500">
          {issueCount} issues
        </span>
        {issueCount > 0 && (
          <>
            <div className="flex-1 h-1 bg-collab-600 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${progress}%`,
                  backgroundColor: color,
                }}
              />
            </div>
            <span className="text-[10px] text-collab-500/60">
              {Math.round(progress)}%
            </span>
          </>
        )}
      </div>
    </button>
  );
}
