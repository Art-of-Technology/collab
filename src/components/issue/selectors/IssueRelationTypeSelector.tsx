"use client";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Check, ChevronDown } from "lucide-react";
import type { IssueRelationType } from "@/components/issue/sections/relations/types/relation";

interface RelationTypeOption {
  value: IssueRelationType;
  label: string;
  description: string;
  color: string;
}

const RELATION_TYPE_OPTIONS: RelationTypeOption[] = [
  {
    value: 'child',
    label: 'Sub-issue',
    description: 'Break down into smaller tasks',
    color: 'bg-green-500',
  },
  {
    value: 'parent',
    label: 'Parent',
    description: 'This issue is part of a larger issue',
    color: 'bg-blue-500',
  },
  {
    value: 'blocks',
    label: 'Blocks',
    description: 'Prevents other issues from progressing',
    color: 'bg-red-500',
  },
  {
    value: 'blocked_by',
    label: 'Blocked by',
    description: 'Cannot progress due to other issues',
    color: 'bg-orange-500',
  },
  {
    value: 'relates_to',
    label: 'Related',
    description: 'Loosely connected to other issues',
    color: 'bg-purple-500',
  },
  {
    value: 'duplicates',
    label: 'Duplicates',
    description: 'Same as another issue',
    color: 'bg-gray-500',
  },
  {
    value: 'duplicated_by',
    label: 'Duplicated by',
    description: 'Another issue is the same as this',
    color: 'bg-gray-500',
  },
];

interface IssueRelationTypeSelectorProps {
  value: IssueRelationType;
  onChange: (value: IssueRelationType) => void;
  disabled?: boolean;
  className?: string;
}

export function IssueRelationTypeSelector({
  value,
  onChange,
  disabled = false,
  className,
}: IssueRelationTypeSelectorProps) {
  const selectedOption = RELATION_TYPE_OPTIONS.find(opt => opt.value === value);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          disabled={disabled}
          className={cn(
            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs transition-colors h-auto leading-tight min-h-[20px] border border-collab-600 hover:border-collab-600 hover:bg-collab-800 text-collab-400 focus:outline-none bg-collab-800",
            className
          )}
        >
          <div className={cn("w-2 h-2 rounded-full flex-shrink-0", selectedOption?.color)} />
          <span className="font-medium">{selectedOption?.label}</span>
          <ChevronDown className="h-3 w-3 text-collab-500 ml-0.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-64 p-1 bg-collab-800 border-collab-600"
        align="start"
      >
        <div className="space-y-0.5">
          {RELATION_TYPE_OPTIONS.map((option) => {
            const isSelected = option.value === value;

            return (
              <Button
                key={option.value}
                variant="ghost"
                onClick={() => onChange(option.value)}
                className={cn(
                  "w-full flex items-start gap-2 px-2 py-2 rounded text-left h-auto justify-start",
                  "hover:bg-collab-600 transition-colors",
                  isSelected && "bg-collab-600"
                )}
              >
                <div className={cn("w-2 h-2 rounded-full mt-1 flex-shrink-0", option.color)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "text-xs font-medium",
                      isSelected ? "text-collab-50" : "text-collab-400"
                    )}>
                      {option.label}
                    </span>
                    {isSelected && (
                      <Check className="h-3 w-3 text-green-500 ml-auto flex-shrink-0" />
                    )}
                  </div>
                  <p className="text-[10px] text-collab-500 mt-0.5 leading-snug">
                    {option.description}
                  </p>
                </div>
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

