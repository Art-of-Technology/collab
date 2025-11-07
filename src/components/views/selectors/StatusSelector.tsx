"use client";

import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Circle, CheckCircle2, XCircle, Timer, Archive, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { getProjectStatuses } from "@/actions/status";

interface StatusSelectorProps {
  value: string[];
  projectIds: string[];
  onChange: (statuses: string[]) => void;
  disabled?: boolean;
}


export function StatusSelector({
  value = [],
  onChange,
  disabled = false,
  projectIds = [],
}: StatusSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  const { data: statuses = [], isLoading, isError } = useQuery({
    queryKey: ['statuses', projectIds],
    queryFn: () => getProjectStatuses(projectIds),
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: projectIds.length > 0
  });

  if (isError) return null;
  
  // Create unique statuses map using Name as key to ensure lookup by Name works correctly
  const uniqueStatuses = Array.from(new Map(statuses.map(s => [s.name, s])).values());
  
  const selectedStatuses = value.map(v => {
    return uniqueStatuses.find(s => s.id === v) || null
  }).filter(Boolean) as typeof uniqueStatuses;

  const toggleStatus = (statusName: string) => {
    // Get all status IDs that match this status name across all projects
    const matchingStatusIds = statuses
      .filter((status: any) => status.name === statusName)
      .map((status: any) => status.id);

    // Check if any of the matching status IDs are currently selected
    const isCurrentlySelected = matchingStatusIds.some(id => value.includes(id));

    if (isCurrentlySelected) {
      // Remove all matching status IDs
      const newValues = value.filter(v => !matchingStatusIds.includes(v));
      onChange(newValues);
    } else {
      // Add all matching status IDs
      const newValues = [...value, ...matchingStatusIds];
      onChange(newValues);
    }
  };

  const statusIcon = (status: any) => {
    const iconMap = {
      'circle': Circle,
      'archive': Archive,
      'check-circle-2': CheckCircle2,
      'timer': Timer,
      'x-circle': XCircle,
    }
    const Icon = iconMap[status.iconName as keyof typeof iconMap] || iconMap['circle'];
    return <Icon className={cn("h-3.5 w-3.5")} style={{ color: status.color }} />;
  }

  return (
    <Popover modal={true} open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs transition-colors h-auto leading-tight min-h-[20px]",
            "border border-[#2d2d30] hover:border-[#464649] hover:bg-[#1a1a1a]",
            "text-[#cccccc] focus:outline-none bg-[#181818]",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        >
          {selectedStatuses.length === 0 ? (
            <>
              <Circle className="h-3 w-3 text-[#6e7681]" />
              <span className="text-[#6e7681] text-xs">Status</span>
            </>
          ) : selectedStatuses.length === 1 ? (
            <>
              {(() => {
                return statusIcon(selectedStatuses[0]);
              })()}
              <span className="text-[#cccccc] text-xs">{selectedStatuses[0].displayName}</span>
            </>
          ) : (
            <>
              <div className="flex items-center gap-0.5">
                {selectedStatuses.slice(0, 2).map((status) => {
                  return <span key={status.id}>{statusIcon(status)}</span>
                })}
                {selectedStatuses.length > 2 && (
                  <div className="h-2.5 w-2.5 rounded-full bg-[#404040] flex items-center justify-center">
                    <span className="text-[8px] text-white font-medium">+</span>
                  </div>
                )}
              </div>
              <span className="text-[#cccccc] text-xs">{selectedStatuses.length} statuses</span>
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
          Filter by status
        </div>

        {isLoading ? (
          <div className="flex items-center w-full justify-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span className="text-[#6e7681] text-xs">Loading...</span>
          </div>
        ) : (
          <div className="max-h-64 overflow-y-auto scrollbar-thin scrollbar-thumb-[#444] scrollbar-track-transparent space-y-0.5">
            {/* Clear all option */}
            <button
              type="button"
              className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-[#2a2a2a] transition-colors text-left"
              onClick={() => onChange([])}
            >
              <Circle className="h-3.5 w-3.5 text-[#6e7681]" />
              <span className="text-[#9ca3af] flex-1">Clear status filter</span>
              {value.length === 0 && (
                <span className="text-xs text-[#6e7681]">✓</span>
              )}
            </button>


            {uniqueStatuses.map((status) => {
              // Get all status IDs that match this status name across all projects
              const matchingStatusIds = statuses
                .filter((s: any) => s.name === status.name)
                .map((s: any) => s.id);

              // Check if any of the matching status IDs are currently selected
              const isSelected = matchingStatusIds.some(id => value.includes(id));

              return (
                <button
                  key={status.name}
                  type="button"
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-[#2a2a2a] transition-colors text-left"
                  onClick={() => toggleStatus(status.name)}
                >
                  {statusIcon(status)}
                  <span className="text-[#cccccc] flex-1">{status.displayName}</span>
                  {isSelected && (
                    <span className="text-xs text-[#6e7681]">✓</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
