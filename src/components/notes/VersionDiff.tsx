"use client";

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowRight, Plus, Minus, Equal, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { VersionBadge } from "@/components/notes/VersionBadge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { NoteVersionChangeType } from "@prisma/client";

interface DiffChange {
  type: "add" | "remove" | "unchanged";
  value: string;
  lineNumber?: number;
}

interface VersionInfo {
  version: number;
  title: string;
  author: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
  };
  createdAt: string;
  changeType: NoteVersionChangeType;
}

interface CompareResponse {
  from: VersionInfo;
  to: VersionInfo;
  diff: {
    titleChanged: boolean;
    oldTitle?: string;
    newTitle?: string;
    content: {
      additions: number;
      deletions: number;
      changes: DiffChange[];
    };
  };
}

interface VersionDiffProps {
  noteId: string;
  fromVersion: number;
  toVersion: number;
  onClose?: () => void;
  className?: string;
}

async function fetchVersionDiff(
  noteId: string,
  fromVersion: number,
  toVersion: number
): Promise<CompareResponse> {
  const response = await fetch(
    `/api/notes/${noteId}/versions/compare?from=${fromVersion}&to=${toVersion}`
  );
  if (!response.ok) {
    throw new Error("Failed to compare versions");
  }
  return response.json();
}

export function VersionDiff({
  noteId,
  fromVersion,
  toVersion,
  onClose,
  className,
}: VersionDiffProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["versionDiff", noteId, fromVersion, toVersion],
    queryFn: () => fetchVersionDiff(noteId, fromVersion, toVersion),
  });

  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-center h-64", className)}>
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className={cn("flex items-center justify-center h-64 text-destructive", className)}>
        Failed to load comparison
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          <VersionBadge version={data.from.version} changeType={data.from.changeType} />
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
          <VersionBadge version={data.to.version} changeType={data.to.changeType} />
        </div>
        {onClose && (
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-sm">
        <Badge variant="outline" className="gap-1 text-green-600 dark:text-green-400">
          <Plus className="h-3 w-3" />
          {data.diff.content.additions} additions
        </Badge>
        <Badge variant="outline" className="gap-1 text-red-600 dark:text-red-400">
          <Minus className="h-3 w-3" />
          {data.diff.content.deletions} deletions
        </Badge>
      </div>

      {/* Title change */}
      {data.diff.titleChanged && (
        <div className="border rounded-lg p-3 bg-muted/30">
          <p className="text-xs text-muted-foreground mb-2">Title changed</p>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Minus className="h-4 w-4 text-red-500 shrink-0" />
              <span className="text-sm line-through text-red-600 dark:text-red-400">
                {data.diff.oldTitle}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-green-500 shrink-0" />
              <span className="text-sm text-green-600 dark:text-green-400">
                {data.diff.newTitle}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Content diff */}
      <div className="border rounded-lg overflow-hidden">
        <div className="bg-muted px-3 py-2 border-b">
          <span className="text-sm font-medium">Content changes</span>
        </div>
        <ScrollArea className="h-[400px]">
          <div className="font-mono text-sm">
            {data.diff.content.changes.map((change, index) => (
              <DiffLine key={index} change={change} />
            ))}
            {data.diff.content.changes.length === 0 && (
              <div className="p-4 text-center text-muted-foreground">
                No content changes
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Author info */}
      <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
        <div className="flex items-center gap-2">
          <span>From:</span>
          <Avatar className="h-4 w-4">
            <AvatarImage src={data.from.author.image || undefined} />
            <AvatarFallback className="text-[8px]">
              {data.from.author.name?.[0] || "U"}
            </AvatarFallback>
          </Avatar>
          <span>{data.from.author.name}</span>
          <span className="text-muted-foreground/60">
            {format(new Date(data.from.createdAt), "MMM d, h:mm a")}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span>To:</span>
          <Avatar className="h-4 w-4">
            <AvatarImage src={data.to.author.image || undefined} />
            <AvatarFallback className="text-[8px]">
              {data.to.author.name?.[0] || "U"}
            </AvatarFallback>
          </Avatar>
          <span>{data.to.author.name}</span>
          <span className="text-muted-foreground/60">
            {format(new Date(data.to.createdAt), "MMM d, h:mm a")}
          </span>
        </div>
      </div>
    </div>
  );
}

function DiffLine({ change }: { change: DiffChange }) {
  const getLineStyles = () => {
    switch (change.type) {
      case "add":
        return "bg-green-100/50 dark:bg-green-900/20 text-green-800 dark:text-green-300";
      case "remove":
        return "bg-red-100/50 dark:bg-red-900/20 text-red-800 dark:text-red-300";
      default:
        return "";
    }
  };

  const getIcon = () => {
    switch (change.type) {
      case "add":
        return <Plus className="h-3 w-3 text-green-600 dark:text-green-400" />;
      case "remove":
        return <Minus className="h-3 w-3 text-red-600 dark:text-red-400" />;
      default:
        return <Equal className="h-3 w-3 text-muted-foreground/30" />;
    }
  };

  return (
    <div className={cn("flex items-start px-2 py-0.5 min-h-[1.5rem]", getLineStyles())}>
      <div className="w-8 shrink-0 text-right pr-2 text-muted-foreground/50 select-none">
        {change.lineNumber || ""}
      </div>
      <div className="w-6 shrink-0 flex items-center justify-center">
        {getIcon()}
      </div>
      <div className="flex-1 whitespace-pre-wrap break-all">
        {change.value}
      </div>
    </div>
  );
}
