"use client";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Archive, Folder, Filter } from "lucide-react";

export type ProjectStatusFilter = 'active' | 'archived' | 'all';

interface ProjectStatusSelectorProps {
  value: ProjectStatusFilter;
  onChange: (value: ProjectStatusFilter) => void;
  counts: {
    active: number;
    archived: number;
    all: number;
  };
  disabled?: boolean;
  readonly?: boolean;
  className?: string;
}

const STATUS_CONFIG = {
  active: {
    label: 'Active',
    icon: Folder,
    iconClassName: 'text-green-500'
  },
  archived: {
    label: 'Archived', 
    icon: Archive,
    iconClassName: 'text-gray-500'
  },
  all: {
    label: 'All',
    icon: Filter,
    iconClassName: 'text-blue-500'
  }
} as const;

export function ProjectStatusSelector({
  value,
  onChange,
  counts,
  disabled = false,
  readonly = false,
  className
}: ProjectStatusSelectorProps) {
  const currentConfig = STATUS_CONFIG[value];
  const Icon = currentConfig.icon;

  // If readonly, just return the same styling as the button but non-interactive
  if (readonly) {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs h-auto leading-tight min-h-[20px]",
          "border border-[#2d2d30] bg-[#181818]",
          "text-[#cccccc]",
          className
        )}
      >
        <Icon className={cn("h-3 w-3", currentConfig.iconClassName)} />
        <span className="text-[#cccccc] text-xs">{currentConfig.label}</span>
        <span className="text-[#6e7681] text-xs">({counts[value]})</span>
      </div>
    );
  }

  return (
    <Popover modal={true}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          type="button"
          disabled={disabled || readonly}
          className={cn(
            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs h-auto leading-tight min-h-[20px]",
            "border border-[#2d2d30] hover:border-[#464649] hover:bg-[#1a1a1a]",
            "text-[#cccccc] bg-[#181818]",
            (disabled || readonly) && "opacity-50 cursor-not-allowed",
            className
          )}
        >
          <Icon className={cn("h-3 w-3", currentConfig.iconClassName)} />
          <span className="text-[#cccccc] text-xs">{currentConfig.label}</span>
          <span className="text-[#6e7681] text-xs">({counts[value]})</span>
        </Button>
      </PopoverTrigger>
      
      <PopoverContent 
        className="w-56 p-1 bg-[#1c1c1e] border-[#2d2d30] shadow-xl"
        align="start"
        side="bottom"
        sideOffset={4}
      >
        <div className="text-xs text-[#9ca3af] px-2 py-1.5 border-b border-[#2d2d30] mb-1 font-medium">
          Filter projects
        </div>
        
        <div className="space-y-0.5">
          {(Object.keys(STATUS_CONFIG) as ProjectStatusFilter[]).map((status) => {
            const config = STATUS_CONFIG[status];
            const StatusIcon = config.icon;
            const count = counts[status];

            return (
              <Button
                key={status}
                variant="ghost"
                type="button"
                className="w-full justify-start h-auto gap-2 px-2 py-1.5 text-xs hover:bg-[#2a2a2a]"
                onClick={() => onChange(status)}
              >
                <StatusIcon className={cn("h-3.5 w-3.5", config.iconClassName)} />
                <span className="text-[#cccccc] flex-1">{config.label}</span>
                <span className="text-xs text-[#6e7681]">
                  {count}
                </span>
                {value === status && (
                  <span className="text-xs text-[#6e7681]">✓</span>
                )}
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
