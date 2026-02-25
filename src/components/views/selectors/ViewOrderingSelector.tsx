"use client";

import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ArrowUpDown, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface ViewOrderingSelectorProps {
  value: string;
  onChange: (ordering: string) => void;
  displayType: string;
  disabled?: boolean;
}

const ORDERING_OPTIONS = {
  manual: { label: "Manual", description: "Drag and drop ordering" },
  priority: { label: "Priority", description: "Order by priority level" },
  status: { label: "Status", description: "Order by status" },
  assignee: { label: "Assignee", description: "Order by assigned person" },
  created: { label: "Created", description: "Order by creation date" },
  updated: { label: "Updated", description: "Order by last update" },
  dueDate: { label: "Due date", description: "Order by due date" },
  startDate: { label: "Start date", description: "Order by start date" },
  title: { label: "Title", description: "Alphabetical order" }
} as const;

// Only show canonical keys in the UI to avoid duplicates like created/createdAt
const CANONICAL_ORDER_KEYS = [
  'manual',
  'priority',
  'assignee',
  'created',
  'updated',
  'dueDate',
  'startDate',
  'title'
] as const;

export function ViewOrderingSelector({
  value,
  onChange,
  displayType,
  disabled = false,
}: ViewOrderingSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Normalize persisted values to canonical keys for display
  const normalizedValue = (value === 'createdAt' ? 'created' : value === 'updatedAt' ? 'updated' : value) as keyof typeof ORDERING_OPTIONS;
  const selectedOption = ORDERING_OPTIONS[normalizedValue] || ORDERING_OPTIONS.manual;

  // Get available options based on display type
  const getAvailableOptions = () => {
    const allOptions = CANONICAL_ORDER_KEYS as unknown as Array<keyof typeof ORDERING_OPTIONS>;
    
    if (displayType === 'TIMELINE') {
      // Timeline typically uses date-based ordering
      return allOptions.filter(key => ['startDate', 'dueDate', 'created', 'updated', 'priority'].includes(key as string)) as Array<keyof typeof ORDERING_OPTIONS>;
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
            "border border-collab-600 hover:border-collab-600 hover:bg-collab-800",
            "text-collab-400 focus:outline-none bg-collab-800",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        >
          <ArrowUpDown className="h-3 w-3 text-amber-500" />
          <span className="text-collab-400 text-xs">Order by: {selectedOption.label}</span>
          <ChevronDown className="h-3 w-3 text-collab-500" />
        </Button>
      </PopoverTrigger>
      
      <PopoverContent 
        className="w-64 p-1 bg-collab-800 border-collab-600 shadow-lg"
        align="start"
        side="bottom"
        sideOffset={4}
      >
        <div className="text-xs text-gray-400 px-2 py-1.5 border-b border-collab-600 mb-1">
          Sort by
        </div>
        
        <div className="space-y-0.5">
          {availableOptions.map((key) => {
            const option = ORDERING_OPTIONS[key];
            
            return (
              <Button
                key={key}
                variant="ghost"
                className="w-full flex items-center gap-3 px-2 py-2 text-sm rounded-md hover:bg-collab-600 transition-colors text-left h-auto justify-start"
                onClick={() => {
                  onChange(key);
                  setIsOpen(false);
                }}
              >
                <ArrowUpDown className="h-4 w-4 flex-shrink-0 text-amber-500" />
                <div className="flex-1 min-w-0">
                  <div className="text-collab-50 font-medium">{option.label}</div>
                  <div className="text-xs text-collab-500 truncate">{option.description}</div>
                </div>
                {(normalizedValue === key) && (
                  <span className="text-xs text-collab-500">✓</span>
                )}
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
