"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Building2, ChevronDown, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Project {
  id: string;
  name: string;
  color?: string;
}

interface ViewProjectSelectorProps {
  value: string[];
  onChange: (projectIds: string[]) => void;
  projects: Project[];
  disabled?: boolean;
}

export function ViewProjectSelector({
  value,
  onChange,
  projects,
  disabled = false,
}: ViewProjectSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  const selectedProjects = useMemo(() => projects.filter(p => value.includes(p.id)), [projects, value]);
  const isAllSelected = selectedProjects.length === projects.length;

  const getDisplayText = useCallback(() => {
    if (isAllSelected) {
      return "All projects";
    }
    if (selectedProjects.length === 1) {
      return selectedProjects[0].name;
    }
    return `${selectedProjects.length} projects`;
  }, [isAllSelected, selectedProjects]);

  const toggleProject = useCallback((projectId: string) => {
    if (value.includes(projectId)) {
      onChange(value.filter(id => id !== projectId));
    } else {
      onChange([...value, projectId]);
    }
  }, [value, onChange]);

  const clearAll = useCallback(() => {
    onChange([]);
  }, [onChange]);

  const selectAllExplicit = useCallback(() => {
    onChange(projects.map(p => p.id));
  }, [projects, onChange]);
  
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
          <Building2 className="h-3 w-3 text-indigo-500" />
          <span className="text-collab-400 text-xs">{getDisplayText()}</span>
          <ChevronDown className="h-3 w-3 text-collab-500" />
        </Button>
      </PopoverTrigger>
      
      <PopoverContent 
        className="w-80 p-1 bg-collab-800 border-collab-600 shadow-lg"
        align="start"
        side="bottom"
        sideOffset={4}
      >
        <div className="text-xs text-gray-400 px-2 py-1.5 border-b border-collab-600 mb-1">
          Select projects 
        </div>
      
        <div className="space-y-0.5 max-h-64 overflow-y-auto">
          {/* Quick actions */}
          <div className="flex gap-1 p-1 border-b border-collab-600 mb-1">
            <Button
              variant="ghost"
              onClick={selectAllExplicit}
              className="text-xs px-2 py-1 rounded hover:bg-collab-600 text-collab-500 hover:text-collab-50 h-auto"
              aria-label="Select all projects"
            >
              All
            </Button>
            <Button
              variant="ghost"
              onClick={clearAll}
              className="text-xs px-2 py-1 rounded hover:bg-collab-600 text-collab-500 hover:text-collab-50 h-auto"
              aria-label="Clear project selection"
            >
              Clear
            </Button>
          </div>
          {/* Individual projects */}
          {projects.map((project) => {
            const isSelected = value.includes(project.id);
            
            return (
              <Button
                key={project.id}
                variant="ghost"
                className="w-full flex items-center gap-3 px-2 py-2 text-sm rounded-md hover:bg-collab-600 transition-colors text-left h-auto justify-start"
                onClick={() => toggleProject(project.id)}
                aria-pressed={isSelected}
              >
                <div className="w-4 h-4 flex items-center justify-center">
                  {isSelected && <Check className="h-3 w-3 text-green-500" />}
                </div>
                <div
                  className="w-3 h-3 rounded flex-shrink-0"
                  style={{ backgroundColor: project.color || '#6b7280' }}
                  aria-hidden="true"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-collab-50 font-medium truncate">{project.name}</div>
                </div>
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
