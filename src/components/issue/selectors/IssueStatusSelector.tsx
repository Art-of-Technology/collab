"use client";

import { useState, useEffect } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Loader2, Circle, Clock, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { IssueSelectorProps } from "@/types/issue";

interface ProjectStatus {
  id: string;
  name: string; // internal name
  displayName?: string; // user-facing label
  color?: string;
  iconName?: string;
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
  readonly = false,
  projectId,
}: IssueStatusSelectorProps) {
  const [statuses, setStatuses] = useState<ProjectStatus[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!projectId) return;

    const fetchColumns = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/projects/${projectId}/statuses`);
        if (!response.ok) {
          throw new Error("Failed to fetch statuses");
        }
        const data = await response.json();
        setStatuses((data.statuses || []).map((s: any) => ({
          id: s.id,
          name: s.name || s.displayName,
          displayName: s.displayName || s.name,
          color: s.color,
          iconName: s.iconName,
          order: s.order ?? 0
        })));
      } catch (error) {
        console.error("Error fetching statuses:", error);
        // Fallback to default
        setStatuses([
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
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs h-auto leading-tight min-h-[20px]",
        "border border-[#2d2d30] bg-[#181818]"
      )}>
        <Loader2 className="h-3 w-3 animate-spin text-[#6e7681]" />
        <span className="text-[#6e7681] text-xs">Loading...</span>
      </div>
    );
  }

  // If readonly, just return the same styling as the button but non-interactive
  if (readonly && value) {
    const Icon = getStatusIcon(value);
    const colorClass = getStatusColor(value);
    return (
      <div
        className={cn(
          "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs h-auto leading-tight min-h-[20px]",
          "border border-[#2d2d30] bg-[#181818]",
          "text-[#cccccc]"
        )}
      >
        <Icon className={cn("h-3 w-3", colorClass)} />
        <span className="text-[#cccccc] text-xs">{value}</span>
      </div>
    );
  }

  return (
    <Popover modal={true}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled || readonly}
          className={cn(
            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs transition-colors h-auto leading-tight min-h-[20px]",
            "border border-[#2d2d30] hover:border-[#464649] hover:bg-[#1a1a1a]",
            "text-[#cccccc] focus:outline-none bg-[#181818]",
            (disabled || readonly) && "opacity-50 cursor-not-allowed"
          )}
        >
          {value ? (
            <>
              {(() => {
                const Icon = getStatusIcon(value);
                const colorClass = getStatusColor(value);
                return <Icon className={cn("h-3 w-3", colorClass)} />;
              })()}
              <span className="text-[#cccccc] text-xs">{value}</span>
            </>
          ) : (
            <>
              <Circle className="h-3 w-3 text-[#6e7681]" />
              <span className="text-[#6e7681] text-xs">Status</span>
            </>
          )}
        </button>
      </PopoverTrigger>
      
      <PopoverContent 
        className="w-60 p-1 bg-[#1c1c1e] border-[#2d2d30] shadow-xl"
        align="start"
        side="bottom"
        sideOffset={4}
      >
        <div className="text-xs text-[#9ca3af] px-2 py-1.5 border-b border-[#2d2d30] mb-1 font-medium">
          Change status
        </div>
        
        <div className="max-h-64 overflow-y-auto scrollbar-thin scrollbar-thumb-[#444] scrollbar-track-transparent space-y-0.5">
          {statuses.length > 0 ? (
            statuses
              .sort((a, b) => a.order - b.order)
              .map((s) => {
                const Icon = getStatusIcon(s.displayName || s.name);
                const colorClass = getStatusColor(s.displayName || s.name, s.color);
                const statusName = s.displayName || s.name;
                
                return (
                  <button
                    key={s.id}
                    type="button"
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-[#2a2a2a] transition-colors text-left"
                    onClick={() => onChange(statusName)}
                  >
                    <Icon className={cn("h-3.5 w-3.5", colorClass)} />
                    <span className="text-[#cccccc] flex-1">{statusName}</span>
                    {value === statusName && (
                      <span className="text-xs text-[#6e7681]">✓</span>
                    )}
                  </button>
                );
              })
          ) : (
            // Fallback options
            <>
              {["Todo", "In Progress", "Done"].map((status) => {
                const Icon = getStatusIcon(status);
                const colorClass = getStatusColor(status);
                
                return (
                  <button
                    key={status}
                    type="button"
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-[#2a2a2a] transition-colors text-left"
                    onClick={() => onChange(status)}
                  >
                    <Icon className={cn("h-3.5 w-3.5", colorClass)} />
                    <span className="text-[#cccccc] flex-1">{status}</span>
                    {value === status && (
                      <span className="text-xs text-[#6e7681]">✓</span>
                    )}
                  </button>
                );
              })}
            </>
          )}
          
          {isLoading && (
            <div className="px-2 py-4 text-center text-[#6e7681] text-sm">
              Loading statuses...
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
} 