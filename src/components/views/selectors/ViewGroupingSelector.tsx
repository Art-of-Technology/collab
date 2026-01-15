"use client";

import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Group, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface ViewGroupingSelectorProps {
  value: string;
  onChange: (grouping: string) => void;
  displayType: string;
  disabled?: boolean;
}

const GROUPING_OPTIONS = {
  none: { label: "No grouping", description: "Show all items in a flat list" },
  status: { label: "Status", description: "Group by issue status" },
  priority: { label: "Priority", description: "Group by priority level" },
  assignee: { label: "Assignee", description: "Group by assigned person" },
  type: { label: "Type", description: "Group by issue type" },
  project: { label: "Project", description: "Group by project" },
  label: { label: "Label", description: "Group by labels" }
} as const;

export function ViewGroupingSelector({
  value,
  onChange,
  displayType,
  disabled = false,
}: ViewGroupingSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  const selectedOption = GROUPING_OPTIONS[value as keyof typeof GROUPING_OPTIONS] || GROUPING_OPTIONS.none;

  // Get available options based on display type
  const getAvailableOptions = () => {
    const allOptions = Object.keys(GROUPING_OPTIONS) as Array<keyof typeof GROUPING_OPTIONS>;
    
    if (displayType === 'KANBAN') {
      // Kanban works best with status/type grouping
      return allOptions.filter(key => ['status', 'type', 'priority', 'assignee'].includes(key));
    }
    
    return allOptions;
  };

  const availableOptions = getAvailableOptions();

  return (
    <Popover modal={true} open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          disabled={disabled}
          className={cn(
            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs transition-colors h-auto leading-tight min-h-[20px]",
            "border border-[#2d2d30] hover:border-[#464649] hover:bg-[#1a1a1a]",
            "text-[#cccccc] focus:outline-none bg-[#181818]",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        >
          <Group className="h-3 w-3 text-[#8b5cf6]" />
          <span className="text-[#cccccc] text-xs">{selectedOption.label}</span>
          <ChevronDown className="h-3 w-3 text-[#6e7681]" />
        </Button>
      </PopoverTrigger>
      
      <PopoverContent 
        className="w-64 p-1 bg-[#1c1c1e] border-[#333] shadow-lg"
        align="start"
        side="bottom"
        sideOffset={4}
      >
        <div className="text-xs text-[#9ca3af] px-2 py-1.5 border-b border-[#333] mb-1">
          Group by
        </div>
        
        <div className="space-y-0.5">
          {availableOptions.map((key) => {
            const option = GROUPING_OPTIONS[key];
            
            return (
              <Button
                key={key}
                variant="ghost"
                className="w-full flex items-center gap-3 px-2 py-2 text-sm rounded-md hover:bg-[#2a2a2a] transition-colors text-left h-auto justify-start"
                onClick={() => {
                  onChange(key);
                  setIsOpen(false);
                }}
              >
                <Group className="h-4 w-4 flex-shrink-0 text-[#8b5cf6]" />
                <div className="flex-1 min-w-0">
                  <div className="text-[#e6edf3] font-medium">{option.label}</div>
                  <div className="text-xs text-[#6e7681] truncate">{option.description}</div>
                </div>
                {value === key && (
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
