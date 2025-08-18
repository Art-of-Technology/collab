"use client";

import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Circle, Clock, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatusSelectorProps {
  value: string[];
  onChange: (statuses: string[]) => void;
  disabled?: boolean;
}

// Status configuration matching issue detail selector
const STATUS_OPTIONS = [
  { value: "todo", label: "Todo", icon: Circle, color: "text-slate-500" },
  { value: "backlog", label: "Backlog", icon: Circle, color: "text-slate-500" },
  { value: "in_progress", label: "In Progress", icon: Clock, color: "text-blue-500" },
  { value: "review", label: "Review", icon: Clock, color: "text-amber-500" },
  { value: "testing", label: "Testing", icon: Clock, color: "text-purple-500" },
  { value: "done", label: "Done", icon: CheckCircle2, color: "text-emerald-500" },
  { value: "completed", label: "Completed", icon: CheckCircle2, color: "text-emerald-500" },
  { value: "cancelled", label: "Cancelled", icon: XCircle, color: "text-red-500" },
  { value: "blocked", label: "Blocked", icon: XCircle, color: "text-red-500" },
];

function getStatusIcon(status: string) {
  const normalizedStatus = status?.toLowerCase().replace(/[_\s]/g, "_");
  const statusConfig = STATUS_OPTIONS.find(s => s.value === normalizedStatus);
  return statusConfig?.icon || Circle;
}

function getStatusColor(status: string) {
  const normalizedStatus = status?.toLowerCase().replace(/[_\s]/g, "_");
  const statusConfig = STATUS_OPTIONS.find(s => s.value === normalizedStatus);
  return statusConfig?.color || "text-slate-500";
}

function getStatusLabel(status: string) {
  const normalizedStatus = status?.toLowerCase().replace(/[_\s]/g, "_");
  const statusConfig = STATUS_OPTIONS.find(s => s.value === normalizedStatus);
  return statusConfig?.label || status;
}

export function StatusSelector({
  value = [],
  onChange,
  disabled = false,
}: StatusSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  const selectedStatuses = value.map(v => {
    const normalizedValue = v?.toLowerCase().replace(/[_\s]/g, "_");
    return STATUS_OPTIONS.find(s => s.value === normalizedValue) || 
           { value: v, label: v, icon: Circle, color: "text-slate-500" };
  });

  const toggleStatus = (statusValue: string) => {
    const newValues = value.includes(statusValue)
      ? value.filter(v => v !== statusValue)
      : [...value, statusValue];
    onChange(newValues);
  };

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
                const Icon = selectedStatuses[0].icon;
                const colorClass = selectedStatuses[0].color;
                return <Icon className={cn("h-3 w-3", colorClass)} />;
              })()}
              <span className="text-[#cccccc] text-xs">{selectedStatuses[0].label}</span>
            </>
          ) : (
            <>
              <div className="flex items-center gap-0.5">
                {selectedStatuses.slice(0, 2).map((status, index) => {
                  const Icon = status.icon;
                  const colorClass = status.color;
                  return <Icon key={status.value} className={cn("h-2.5 w-2.5", colorClass)} />;
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
          
          {STATUS_OPTIONS.map((status) => {
            const Icon = status.icon;
            const colorClass = status.color;
            const isSelected = value.some(v => v?.toLowerCase().replace(/[_\s]/g, "_") === status.value);
            
            return (
              <button
                key={status.value}
                type="button"
                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-[#2a2a2a] transition-colors text-left"
                onClick={() => toggleStatus(status.value)}
              >
                <Icon className={cn("h-3.5 w-3.5", colorClass)} />
                <span className="text-[#cccccc] flex-1">{status.label}</span>
                {isSelected && (
                  <span className="text-xs text-[#6e7681]">✓</span>
                )}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
