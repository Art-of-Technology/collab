"use client";

import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ArrowDown, ArrowUp, Minus, Flag } from "lucide-react";
import { cn } from "@/lib/utils";

interface PrioritySelectorProps {
  value: string[];
  onChange: (priorities: string[]) => void;
  disabled?: boolean;
}

// Priority configuration matching issue detail selector
const PRIORITY_OPTIONS = [
  { value: "LOW", label: "Low", icon: ArrowDown, color: "text-slate-500" },
  { value: "MEDIUM", label: "Medium", icon: Minus, color: "text-blue-600" },
  { value: "HIGH", label: "High", icon: ArrowUp, color: "text-amber-600" },
  { value: "URGENT", label: "Urgent", icon: Flag, color: "text-red-600" },
];

function getPriorityConfig(priority: string) {
  const normalizedPriority = priority?.toUpperCase();
  return PRIORITY_OPTIONS.find(p => p.value === normalizedPriority) || PRIORITY_OPTIONS[1]; // default to MEDIUM
}

export function PrioritySelector({
  value = [],
  onChange,
  disabled = false,
}: PrioritySelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  const selectedPriorities = value.map(v => getPriorityConfig(v));

  const togglePriority = (priorityValue: string) => {
    const newValues = value.includes(priorityValue)
      ? value.filter(v => v !== priorityValue)
      : [...value, priorityValue];
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
          {selectedPriorities.length === 0 ? (
            <>
              <Minus className="h-3 w-3 text-[#6e7681]" />
              <span className="text-[#6e7681] text-xs">Priority</span>
            </>
          ) : selectedPriorities.length === 1 ? (
            <>
              {(() => {
                const Icon = selectedPriorities[0].icon;
                const colorClass = selectedPriorities[0].color;
                return <Icon className={cn("h-3 w-3", colorClass)} />;
              })()}
              <span className="text-[#cccccc] text-xs">{selectedPriorities[0].label}</span>
            </>
          ) : (
            <>
              <div className="flex items-center gap-0.5">
                {selectedPriorities.slice(0, 2).map((priority, index) => {
                  const Icon = priority.icon;
                  const colorClass = priority.color;
                  return <Icon key={priority.value} className={cn("h-2.5 w-2.5", colorClass)} />;
                })}
                {selectedPriorities.length > 2 && (
                  <div className="h-2.5 w-2.5 rounded-full bg-[#404040] flex items-center justify-center">
                    <span className="text-[8px] text-white font-medium">+</span>
                  </div>
                )}
              </div>
              <span className="text-[#cccccc] text-xs">{selectedPriorities.length} priorities</span>
            </>
          )}
        </button>
      </PopoverTrigger>
      
      <PopoverContent 
        className="w-56 p-1 bg-[#1c1c1e] border-[#2d2d30] shadow-xl"
        align="start"
        side="bottom"
        sideOffset={4}
      >
        <div className="text-xs text-[#9ca3af] px-2 py-1.5 border-b border-[#2d2d30] mb-1 font-medium">
          Filter by priority
        </div>
        
        <div className="space-y-0.5">
          {/* Clear all option */}
          <button
            type="button"
            className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-[#2a2a2a] transition-colors text-left"
            onClick={() => onChange([])}
          >
            <Minus className="h-3.5 w-3.5 text-[#6e7681]" />
            <span className="text-[#9ca3af] flex-1">Clear priority filter</span>
            {value.length === 0 && (
              <span className="text-xs text-[#6e7681]">✓</span>
            )}
          </button>
          
          {PRIORITY_OPTIONS.map((priority) => {
            const Icon = priority.icon;
            const colorClass = priority.color;
            const isSelected = value.includes(priority.value);
            
            return (
              <button
                key={priority.value}
                type="button"
                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-[#2a2a2a] transition-colors text-left"
                onClick={() => togglePriority(priority.value)}
              >
                <Icon className={cn("h-3.5 w-3.5", colorClass)} />
                <span className="text-[#cccccc] flex-1">{priority.label}</span>
                <span className="text-xs text-[#6e7681]">
                  {priority.value === 'LOW' && 'P4'}
                  {priority.value === 'MEDIUM' && 'P3'}
                  {priority.value === 'HIGH' && 'P2'}
                  {priority.value === 'URGENT' && 'P1'}
                </span>
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
