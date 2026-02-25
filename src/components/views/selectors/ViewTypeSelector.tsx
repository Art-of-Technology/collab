"use client";

import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { List, Kanban, Calendar, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type ViewType = "LIST" | "KANBAN" | "PLANNING";

interface ViewTypeSelectorProps {
  value: ViewType;
  onChange: (type: ViewType | string) => void;
  disabled?: boolean;
}

const VIEW_TYPE_CONFIG = {
  LIST: {
    label: "List",
    icon: List,
    color: "#6366f1",
    description: "Classic list view with rows"
  },
  KANBAN: {
    label: "Board",
    icon: Kanban,
    color: "#22c55e",
    description: "Kanban board with columns"
  },
  PLANNING: {
    label: "Planning",
    icon: Calendar,
    color: "#f59e0b",
    description: "Team planning and daily sync"
  }
} as const;

export function ViewTypeSelector({
  value,
  onChange,
  disabled = false,
}: ViewTypeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  const selectedConfig = VIEW_TYPE_CONFIG[value as ViewType] || VIEW_TYPE_CONFIG.LIST;
  const Icon = selectedConfig.icon;

  const options: ViewType[] = ["LIST", "KANBAN", "PLANNING"];

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
          <Icon
            className="h-3 w-3"
            style={{ color: selectedConfig.color }}
          />
          <span className="text-collab-400 text-xs">{selectedConfig.label}</span>
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
          Change view type
        </div>
        
        <div className="space-y-0.5">
          {options.map((type) => {
            const config = VIEW_TYPE_CONFIG[type];
            const TypeIcon = config.icon;
            
            return (
              <Button
                key={type}
                variant="ghost"
                className="w-full flex items-center gap-3 px-2 py-2 text-sm rounded-md hover:bg-collab-600 transition-colors text-left h-auto justify-start"
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
                  <div className="text-collab-50 font-medium">{config.label}</div>
                  <div className="text-xs text-collab-500 truncate">{config.description}</div>
                </div>
                {value === type && (
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
