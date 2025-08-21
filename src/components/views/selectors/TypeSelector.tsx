"use client";

import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Target, BookOpen, CheckSquare, Bug, Milestone, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface TypeSelectorProps {
  value: string[];
  onChange: (types: string[]) => void;
  disabled?: boolean;
}

// Type configuration matching issue detail selector
const TYPE_OPTIONS = [
  { value: "TASK", label: "Task", icon: CheckSquare, color: "text-emerald-600" },
  { value: "STORY", label: "Story", icon: BookOpen, color: "text-blue-600" },
  { value: "EPIC", label: "Epic", icon: Target, color: "text-purple-600" },
  { value: "DEFECT", label: "Bug", icon: Bug, color: "text-red-600" },
  { value: "MILESTONE", label: "Milestone", icon: Milestone, color: "text-amber-600" },
  { value: "SUBTASK", label: "Subtask", icon: ChevronDown, color: "text-slate-600" },
];

function getTypeConfig(type: string) {
  const normalizedType = type?.toUpperCase();
  return TYPE_OPTIONS.find(t => t.value === normalizedType) || TYPE_OPTIONS[0]; // default to TASK
}

export function TypeSelector({
  value = [],
  onChange,
  disabled = false,
}: TypeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  const selectedTypes = value.map(v => getTypeConfig(v));

  const toggleType = (typeValue: string) => {
    const newValues = value.includes(typeValue)
      ? value.filter(v => v !== typeValue)
      : [...value, typeValue];
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
          {selectedTypes.length === 0 ? (
            <>
              <CheckSquare className="h-3 w-3 text-[#6e7681]" />
              <span className="text-[#6e7681] text-xs">Type</span>
            </>
          ) : selectedTypes.length === 1 ? (
            <>
              {(() => {
                const Icon = selectedTypes[0].icon;
                const colorClass = selectedTypes[0].color;
                return <Icon className={cn("h-3 w-3", colorClass)} />;
              })()}
              <span className="text-[#cccccc] text-xs">{selectedTypes[0].label}</span>
            </>
          ) : (
            <>
              <div className="flex items-center gap-0.5">
                {selectedTypes.slice(0, 2).map((type, index) => {
                  const Icon = type.icon;
                  const colorClass = type.color;
                  return <Icon key={type.value} className={cn("h-2.5 w-2.5", colorClass)} />;
                })}
                {selectedTypes.length > 2 && (
                  <div className="h-2.5 w-2.5 rounded-full bg-[#404040] flex items-center justify-center">
                    <span className="text-[8px] text-white font-medium">+</span>
                  </div>
                )}
              </div>
              <span className="text-[#cccccc] text-xs">{selectedTypes.length} types</span>
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
          Filter by type
        </div>
        
        <div className="space-y-0.5">
          {/* Clear all option */}
          <button
            type="button"
            className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-[#2a2a2a] transition-colors text-left"
            onClick={() => onChange([])}
          >
            <CheckSquare className="h-3.5 w-3.5 text-[#6e7681]" />
            <span className="text-[#9ca3af] flex-1">Clear type filter</span>
            {value.length === 0 && (
              <span className="text-xs text-[#6e7681]">✓</span>
            )}
          </button>
          
          {TYPE_OPTIONS.map((type) => {
            const Icon = type.icon;
            const colorClass = type.color;
            const isSelected = value.includes(type.value);
            
            return (
              <button
                key={type.value}
                type="button"
                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-[#2a2a2a] transition-colors text-left"
                onClick={() => toggleType(type.value)}
              >
                <Icon className={cn("h-3.5 w-3.5", colorClass)} />
                <span className="text-[#cccccc] flex-1">{type.label}</span>
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
