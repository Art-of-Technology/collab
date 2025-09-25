"use client";

import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { ISSUE_TYPE_CONFIG, ISSUE_TYPE_OPTIONS, type IssueType } from "@/constants/issue-types";

interface IssueTypeSelectorProps {
  value: IssueType;
  onChange: (value: IssueType) => void;
  disabled?: boolean;
  readonly?: boolean;
}


export function IssueTypeSelector({
  value,
  onChange,
  disabled = false,
  readonly = false,
}: IssueTypeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  const selectedConfig = ISSUE_TYPE_CONFIG[value] || ISSUE_TYPE_CONFIG.TASK;
  const Icon = selectedConfig.icon;

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
          {ISSUE_TYPE_OPTIONS.map((type) => {
            const config = ISSUE_TYPE_CONFIG[type];
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
