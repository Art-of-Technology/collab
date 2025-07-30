"use client";

import { useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Circle, Clock, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { IssueSelectorProps } from "@/types/issue";

interface ProjectColumn {
  id: string;
  name: string;
  color?: string;
  order: number;
}

interface IssueStatusSelectorProps extends IssueSelectorProps {
  projectId?: string;
}

// Default status icons (can be overridden by column settings)
const STATUS_ICONS = {
  TODO: Circle,
  BACKLOG: Circle,
  "IN PROGRESS": Clock,
  REVIEW: Clock,
  TESTING: Clock,
  DONE: CheckCircle2,
  COMPLETED: CheckCircle2,
  CANCELLED: XCircle,
  BLOCKED: XCircle,
} as const;

// Default status colors
const STATUS_COLORS = {
  TODO: "text-slate-500",
  BACKLOG: "text-slate-500",
  "IN PROGRESS": "text-blue-500",
  REVIEW: "text-amber-500",
  TESTING: "text-purple-500",
  DONE: "text-emerald-500",
  COMPLETED: "text-emerald-500", 
  CANCELLED: "text-red-500",
  BLOCKED: "text-red-500",
} as const;

function getStatusIcon(status: string) {
  const normalizedStatus = status?.toUpperCase().replace(/[_\s]/g, " ") as keyof typeof STATUS_ICONS;
  return STATUS_ICONS[normalizedStatus] || Circle;
}

function getStatusColor(status: string, customColor?: string) {
  if (customColor) {
    return `text-[${customColor}]`;
  }
  
  const normalizedStatus = status?.toUpperCase().replace(/[_\s]/g, " ") as keyof typeof STATUS_COLORS;
  return STATUS_COLORS[normalizedStatus] || "text-slate-500";
}

export function IssueStatusSelector({
  value,
  onChange,
  disabled = false,
  projectId,
}: IssueStatusSelectorProps) {
  const [columns, setColumns] = useState<ProjectColumn[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!projectId) return;

    const fetchColumns = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/projects/${projectId}/columns`);
        if (!response.ok) {
          throw new Error("Failed to fetch columns");
        }
        const data = await response.json();
        setColumns(data.columns || []);
      } catch (error) {
        console.error("Error fetching columns:", error);
        // Fallback to default statuses
        setColumns([
          { id: "todo", name: "Todo", order: 0 },
          { id: "in-progress", name: "In Progress", order: 1 },
          { id: "done", name: "Done", order: 2 },
        ]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchColumns();
  }, [projectId]);

  // Create status badge component
  const StatusBadge = ({ status, customColor }: { status: string; customColor?: string }) => {
    const Icon = getStatusIcon(status);
    const colorClass = getStatusColor(status, customColor);

    return (
      <Badge 
        variant="outline"
        className={cn(
          colorClass,
          "border-current/20 bg-current/5 hover:bg-current/10",
          "flex items-center gap-1.5 font-medium",
          "transition-all duration-200"
        )}
      >
        <Icon className="h-3.5 w-3.5" />
        {status}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <div className={cn(
        "flex items-center justify-center h-10 px-3",
        "border border-border/50 rounded-md bg-muted/30"
      )}>
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Select
      value={value}
      onValueChange={onChange}
      disabled={disabled}
    >
      <SelectTrigger className={cn(
        "w-full border-border/50 bg-background/50",
        "hover:border-border/80 hover:bg-background/80",
        "focus:border-primary/50 focus:bg-background",
        "transition-all duration-200"
      )}>
        <SelectValue>
          {value && <StatusBadge status={value} />}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="min-w-[200px]">
        {columns.length > 0 ? (
          columns
            .sort((a, b) => a.order - b.order)
            .map((column) => (
              <SelectItem 
                key={column.id} 
                value={column.name}
                className="py-2.5"
              >
                <StatusBadge status={column.name} customColor={column.color} />
              </SelectItem>
            ))
        ) : (
          // Fallback options if no columns found
          <>
            <SelectItem value="Todo" className="py-2.5">
              <StatusBadge status="Todo" />
            </SelectItem>
            <SelectItem value="In Progress" className="py-2.5">
              <StatusBadge status="In Progress" />
            </SelectItem>
            <SelectItem value="Done" className="py-2.5">
              <StatusBadge status="Done" />
            </SelectItem>
          </>
        )}
      </SelectContent>
    </Select>
  );
} 