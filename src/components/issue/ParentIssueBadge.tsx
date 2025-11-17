"use client";

import Link from "next/link";
import { ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface ParentIssueBadgeProps {
  parent: {
    id: string;
    issueKey?: string;
    title: string;
    type?: string;
    status?: string;
  };
  workspaceSlug: string;
  className?: string;
  compact?: boolean;
}

export function ParentIssueBadge({
  parent,
  workspaceSlug,
  className,
  compact = false,
}: ParentIssueBadgeProps) {
  const href = `/${workspaceSlug}/issues/${parent.issueKey || parent.id}`;
  const maxTitleLength = compact ? 15 : 30;
  const truncatedTitle = parent.title.length > maxTitleLength
    ? `${parent.title.substring(0, maxTitleLength)}...`
    : parent.title;

  return (
    <Link
      href={href}
      onClick={(e) => e.stopPropagation()} // Prevent parent link clicks
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md",
        "bg-[#1a1a1a] hover:bg-[#2a2a2a] border border-[#2d2d30] hover:border-[#404040]",
        "text-xs text-[#7d8590] hover:text-[#c9d1d9]",
        "transition-all duration-150",
        "group",
        className
      )}
      title={`Parent: ${parent.title}`}
    >
      <ArrowUp className="h-3 w-3 text-blue-500 flex-shrink-0" />
      {parent.issueKey && (
        <span className="font-mono font-medium text-[10px] text-[#7d8590] group-hover:text-[#c9d1d9]">
          {parent.issueKey}
        </span>
      )}
      {!compact && (
        <span className="text-[#9ca3af] group-hover:text-[#c9d1d9] truncate">
          {truncatedTitle}
        </span>
      )}
    </Link>
  );
}

interface ParentIssueBadgeMinimalProps {
  parent: {
    id: string;
    issueKey?: string;
    title: string;
  };
  workspaceSlug: string;
  className?: string;
}

/**
 * Minimal version showing just the icon and issue key
 * Perfect for compact views like cards
 */
export function ParentIssueBadgeMinimal({
  parent,
  workspaceSlug,
  className,
}: ParentIssueBadgeMinimalProps) {
  const href = `/${workspaceSlug}/issues/${parent.issueKey || parent.id}`;

  return (
    <Link
      href={href}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded",
        "bg-[#1a1a1a] hover:bg-[#2a2a2a] border border-[#2d2d30] hover:border-[#404040]",
        "text-xs transition-all duration-150",
        "group",
        className
      )}
      title={`Parent: ${parent.title}`}
    >
      <ArrowUp className="h-2.5 w-2.5 text-blue-500 flex-shrink-0" />
      {parent.issueKey && (
        <span className="font-mono font-medium text-[9px] text-[#7d8590] group-hover:text-[#c9d1d9]">
          {parent.issueKey}
        </span>
      )}
    </Link>
  );
}

