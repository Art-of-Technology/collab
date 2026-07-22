"use client";

import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Eye, ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface ViewDisplayPropertiesSelectorProps {
  value: string[];
  onChange: (properties: string[]) => void;
  disabled?: boolean;
}

const DISPLAY_PROPERTIES = [
  { key: "Priority", label: "Priority", description: "Show priority indicators" },
  { key: "Status", label: "Status", description: "Show current status" },
  { key: "Assignee", label: "Assignee", description: "Show assigned person" },
  { key: "Labels", label: "Labels", description: "Show issue labels" },
  { key: "Due Date", label: "Due Date", description: "Show due dates" },
  { key: "Project", label: "Project", description: "Show project information" },
  { key: "Reporter", label: "Reporter", description: "Show who created the issue" },
  { key: "Created", label: "Created", description: "Show creation date" },
  { key: "Updated", label: "Updated", description: "Show last update date" }
] as const;

export function ViewDisplayPropertiesSelector({
  value,
  onChange,
  disabled = false,
}: ViewDisplayPropertiesSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  const getDisplayText = () => {
    if (value.length === 0) {
      return "No properties";
    }
    if (value.length === 1) {
      const property = DISPLAY_PROPERTIES.find(p => p.key === value[0]);
      return property?.label || value[0];
    }
    return `${value.length} properties`;
  };

  const toggleProperty = (propertyKey: string) => {
    if (value.includes(propertyKey)) {
      onChange(value.filter(p => p !== propertyKey));
    } else {
      onChange([...value, propertyKey]);
    }
  };

  const selectDefault = () => {
    onChange(["Priority", "Status", "Assignee"]);
  };

  const selectAll = () => {
    onChange(DISPLAY_PROPERTIES.map(p => p.key));
  };

  const clearAll = () => {
    onChange([]);
  };

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
          <Eye className="h-3 w-3 text-green-500" />
          <span className="text-collab-400 text-xs">{getDisplayText()}</span>
          <ChevronDown className="h-3 w-3 text-collab-500" />
        </Button>
      </PopoverTrigger>
      
      <PopoverContent 
        className="w-72 p-1 bg-collab-800 border-collab-600 shadow-lg"
        align="start"
        side="bottom"
        sideOffset={4}
      >
        <div className="text-xs text-gray-400 px-2 py-1.5 border-b border-collab-600 mb-1">
          Display properties
        </div>

        {/* Quick actions */}
        <div className="flex gap-1 p-1 border-b border-collab-600 mb-1">
          <Button
            variant="ghost"
            onClick={selectDefault}
            className="text-xs px-2 py-1 rounded hover:bg-collab-600 text-collab-500 hover:text-collab-50 h-auto"
          >
            Default
          </Button>
          <Button
            variant="ghost"
            onClick={selectAll}
            className="text-xs px-2 py-1 rounded hover:bg-collab-600 text-collab-500 hover:text-collab-50 h-auto"
          >
            All
          </Button>
          <Button
            variant="ghost"
            onClick={clearAll}
            className="text-xs px-2 py-1 rounded hover:bg-collab-600 text-collab-500 hover:text-collab-50 h-auto"
          >
            Clear
          </Button>
        </div>
        
        <div className="space-y-0.5 max-h-64 overflow-y-auto">
          {DISPLAY_PROPERTIES.map((property) => {
            const isSelected = value.includes(property.key);
            
            return (
              <Button
                key={property.key}
                variant="ghost"
                className="w-full flex items-center gap-3 px-2 py-2 text-sm rounded-md hover:bg-collab-600 transition-colors text-left h-auto justify-start"
                onClick={() => toggleProperty(property.key)}
              >
                <div className="w-4 h-4 flex items-center justify-center">
                  {isSelected && <Check className="h-3 w-3 text-green-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-collab-50 font-medium">{property.label}</div>
                  <div className="text-xs text-collab-500 truncate">{property.description}</div>
                </div>
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
