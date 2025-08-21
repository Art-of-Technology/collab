"use client";

import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { 
  CheckSquare, 
  Circle, 
  GitBranch, 
  Bug, 
  Flag, 
  Square,
  ChevronDown 
} from "lucide-react";
import { cn } from "@/lib/utils";

type IssueType = "TASK" | "EPIC" | "STORY" | "BUG" | "MILESTONE" | "SUBTASK";

interface IssueTypeSelectorProps {
  value: IssueType;
  onChange: (value: IssueType) => void;
  disabled?: boolean;
  readonly?: boolean;
}

const TYPE_CONFIG = {
  TASK: {
    label: "Task",
    icon: CheckSquare,
    color: "#6366f1",
    description: "A task that needs to be done"
  },
  STORY: {
    label: "Story",
    icon: Circle,
    color: "#22c55e",
    description: "A user story or feature"
  },
  EPIC: {
    label: "Epic",
    icon: GitBranch,
    color: "#a855f7",
    description: "A large body of work"
  },
  BUG: {
    label: "Bug",
    icon: Bug,
    color: "#ef4444",
    description: "A problem that needs fixing"
  },
  DEFECT: {
    label: "Bug",
    icon: Bug,
    color: "#ef4444",
    description: "A problem that needs fixing"
  },
  MILESTONE: {
    label: "Milestone",
    icon: Flag,
    color: "#f59e0b",
    description: "A significant point in development"
  },
  SUBTASK: {
    label: "Sub-task",
    icon: Square,
    color: "#6b7280",
    description: "A smaller task within a larger issue"
  }
} as const;

export function IssueTypeSelector({
  value,
  onChange,
  disabled = false,
  readonly = false,
}: IssueTypeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  const selectedConfig = TYPE_CONFIG[value] || TYPE_CONFIG.TASK;
  const Icon = selectedConfig.icon;

  const options: IssueType[] = ["TASK", "STORY", "EPIC", "BUG", "MILESTONE", "SUBTASK"];

  // If readonly, just return the same styling as the button but non-interactive
  if (readonly) {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs h-auto leading-tight min-h-[20px]",
          "border border-[#2d2d30] bg-[#181818]",
          "text-[#cccccc]"
        )}
      >
        <Icon 
          className="h-3 w-3" 
          style={{ color: selectedConfig.color }}
        />
        <span className="text-[#cccccc] text-xs">{selectedConfig.label}</span>
      </div>
    );
  }

  return (
    <Popover modal={true} open={isOpen} onOpenChange={setIsOpen}>
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
          <Icon 
            className="h-3 w-3" 
            style={{ color: selectedConfig.color }}
          />
          <span className="text-[#cccccc] text-xs">{selectedConfig.label}</span>
        </button>
      </PopoverTrigger>
      
      <PopoverContent 
        className="w-64 p-1 bg-[#1c1c1e] border-[#333] shadow-lg"
        align="start"
        side="bottom"
        sideOffset={4}
      >
        <div className="text-xs text-[#9ca3af] px-2 py-1.5 border-b border-[#333] mb-1">
          Change issue type
        </div>
        
        <div className="space-y-0.5">
          {options.map((type) => {
            const config = TYPE_CONFIG[type];
            const TypeIcon = config.icon;
            
            return (
              <button
                key={type}
                type="button"
                className="w-full flex items-center gap-3 px-2 py-2 text-sm rounded-md hover:bg-[#2a2a2a] transition-colors text-left"
                onClick={() => {
                  onChange(type);
                  setIsOpen(false);
                }}
              >
                <TypeIcon 
                  className="h-4 w-4 flex-shrink-0" 
                  style={{ color: config.color }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-[#e6edf3] font-medium">{config.label}</div>
                  <div className="text-xs text-[#6e7681] truncate">{config.description}</div>
                </div>
                {value === type && (
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
