"use client";

import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Filter, ChevronDown, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Project {
  id: string;
  name: string;
  color?: string;
}

interface ViewFiltersSelectorProps {
  value: Record<string, string[]>;
  onChange: (filters: Record<string, string[]>) => void;
  projects: Project[];
  disabled?: boolean;
}

const FILTER_OPTIONS = [
  { key: "status", label: "Status", options: ["Todo", "In Progress", "Done", "Blocked"] },
  { key: "priority", label: "Priority", options: ["Low", "Medium", "High", "Urgent"] },
  { key: "assignee", label: "Assignee", options: [] }, // Will be populated from workspace
  { key: "label", label: "Labels", options: [] }, // Will be populated from workspace
  { key: "type", label: "Type", options: ["Task", "Story", "Epic", "Bug", "Milestone"] }
] as const;

export function ViewFiltersSelector({
  value,
  onChange,
  projects,
  disabled = false,
}: ViewFiltersSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  const activeFilterCount = Object.keys(value).reduce((count, key) => {
    return count + (value[key]?.length || 0);
  }, 0);

  const getDisplayText = () => {
    if (activeFilterCount === 0) {
      return "No filters";
    }
    if (activeFilterCount === 1) {
      return "1 filter";
    }
    return `${activeFilterCount} filters`;
  };

  const toggleFilter = (filterKey: string, filterValue: string) => {
    const currentValues = value[filterKey] || [];
    const newValues = currentValues.includes(filterValue)
      ? currentValues.filter(v => v !== filterValue)
      : [...currentValues, filterValue];
    
    if (newValues.length === 0) {
      const { [filterKey]: removed, ...rest } = value;
      onChange(rest);
    } else {
      onChange({
        ...value,
        [filterKey]: newValues
      });
    }
  };

  const removeFilter = (filterKey: string, filterValue?: string) => {
    if (!filterValue) {
      const { [filterKey]: removed, ...rest } = value;
      onChange(rest);
    } else {
      const currentValues = value[filterKey] || [];
      const newValues = currentValues.filter(v => v !== filterValue);
      if (newValues.length === 0) {
        const { [filterKey]: removed, ...rest } = value;
        onChange(rest);
      } else {
        onChange({
          ...value,
          [filterKey]: newValues
        });
      }
    }
  };

  const clearAllFilters = () => {
    onChange({});
  };

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
            disabled && "opacity-50 cursor-not-allowed",
            activeFilterCount > 0 && "border-[#f59e0b]/30 bg-[#f59e0b]/5"
          )}
        >
          <Filter className={cn(
            "h-3 w-3",
            activeFilterCount > 0 ? "text-[#f59e0b]" : "text-[#ef4444]"
          )} />
          <span className="text-[#cccccc] text-xs">{getDisplayText()}</span>
          <ChevronDown className="h-3 w-3 text-[#6e7681]" />
        </Button>
      </PopoverTrigger>
      
      <PopoverContent 
        className="w-80 p-1 bg-[#1c1c1e] border-[#333] shadow-lg"
        align="start"
        side="bottom"
        sideOffset={4}
      >
        <div className="flex items-center justify-between px-2 py-1.5 border-b border-[#333] mb-1">
          <span className="text-xs text-[#9ca3af]">Filters</span>
          {activeFilterCount > 0 && (
            <Button
              variant="ghost"
              onClick={clearAllFilters}
              className="text-xs text-[#6e7681] hover:text-[#e6edf3] h-auto py-0 px-1"
            >
              Clear all
            </Button>
          )}
        </div>

        {/* Active filters */}
        {activeFilterCount > 0 && (
          <div className="px-2 py-1 mb-2">
            <div className="text-xs text-[#9ca3af] mb-2">Active filters:</div>
            <div className="flex flex-wrap gap-1">
              {Object.entries(value).map(([filterKey, filterValues]) => (
                filterValues.map(filterValue => (
                  <div
                    key={`${filterKey}-${filterValue}`}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-[#f59e0b]/20 border border-[#f59e0b]/30 rounded text-xs"
                  >
                    <span className="text-[#f59e0b]">{filterKey}:</span>
                    <span className="text-[#e6edf3]">{filterValue}</span>
                    <Button
                      variant="ghost"
                      onClick={() => removeFilter(filterKey, filterValue)}
                      className="text-[#6e7681] hover:text-[#f85149] h-auto p-0 w-auto"
                    >
                      <X className="h-2.5 w-2.5" />
                    </Button>
                  </div>
                ))
              ))}
            </div>
          </div>
        )}
        
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {FILTER_OPTIONS.map((filter) => (
            <div key={filter.key}>
              <div className="text-xs font-medium text-[#e6edf3] px-2 py-1">
                {filter.label}
              </div>
              <div className="space-y-0.5">
                {filter.options.map((option) => {
                  const isSelected = value[filter.key]?.includes(option) || false;
                  
                  return (
                    <Button
                      key={option}
                      variant="ghost"
                      className="w-full flex items-center gap-3 px-2 py-1.5 text-sm rounded-md hover:bg-[#2a2a2a] transition-colors text-left h-auto justify-start"
                      onClick={() => toggleFilter(filter.key, option)}
                    >
                      <div className="w-4 h-4 flex items-center justify-center">
                        {isSelected && <Check className="h-3 w-3 text-[#22c55e]" />}
                      </div>
                      <span className="text-[#e6edf3] text-xs">{option}</span>
                    </Button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
