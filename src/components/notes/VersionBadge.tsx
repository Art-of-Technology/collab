"use client";

import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Pencil,
  Type,
  RotateCcw,
  GitMerge,
  History,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NoteVersionChangeType } from "@prisma/client";

interface VersionBadgeProps {
  version: number;
  changeType?: NoteVersionChangeType;
  isLatest?: boolean;
  className?: string;
}

const changeTypeConfig: Record<
  NoteVersionChangeType,
  { icon: typeof Plus; label: string; className: string }
> = {
  CREATED: {
    icon: Plus,
    label: "Created",
    className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  },
  EDIT: {
    icon: Pencil,
    label: "Edited",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  },
  TITLE: {
    icon: Type,
    label: "Title changed",
    className: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  },
  RESTORE: {
    icon: RotateCcw,
    label: "Restored",
    className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  },
  MERGE: {
    icon: GitMerge,
    label: "Merged",
    className: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
  },
};

export function VersionBadge({
  version,
  changeType = "EDIT",
  isLatest,
  className,
}: VersionBadgeProps) {
  const config = changeTypeConfig[changeType];
  const Icon = config.icon;

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <Badge
        variant="secondary"
        className={cn(
          "gap-1 font-mono text-xs",
          config.className
        )}
      >
        <History className="h-3 w-3" />
        v{version}
      </Badge>
      {isLatest && (
        <Badge
          variant="outline"
          className="text-xs bg-primary/10 border-primary/20"
        >
          Current
        </Badge>
      )}
      <Badge
        variant="outline"
        className={cn("gap-1 text-xs", config.className, "border-current/20")}
      >
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    </div>
  );
}
