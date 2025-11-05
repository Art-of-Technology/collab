"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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

  const selectedProjects = projects.filter(p => value.includes(p.id));
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
          <Building2 className="h-3 w-3 text-[#6366f1]" />
          <span className="text-[#cccccc] text-xs">{getDisplayText()}</span>
          <ChevronDown className="h-3 w-3 text-[#6e7681]" />
        </button>
      </PopoverTrigger>
      
      <PopoverContent 
        className="w-80 p-1 bg-[#1c1c1e] border-[#333] shadow-lg"
        align="start"
        side="bottom"
        sideOffset={4}
      >
        <div className="text-xs text-[#9ca3af] px-2 py-1.5 border-b border-[#333] mb-1">
          Select projects 
        </div>
      
        <div className="space-y-0.5 max-h-64 overflow-y-auto">
          {/* Quick actions */}
          <div className="flex gap-1 p-1 border-b border-[#333] mb-1">
            <button
              type="button"
              onClick={selectAllExplicit}
              className="text-xs px-2 py-1 rounded hover:bg-[#2a2a2a] text-[#6e7681] hover:text-[#e6edf3]"
              aria-label="Select all projects"
            >
              All
            </button>
            <button
              type="button"
              onClick={clearAll}
              className="text-xs px-2 py-1 rounded hover:bg-[#2a2a2a] text-[#6e7681] hover:text-[#e6edf3]"
              aria-label="Clear project selection"
            >
              Clear
            </button>
          </div>
          {/* Individual projects */}
          {projects.map((project) => {
            const isSelected = value.includes(project.id);
            
            return (
              <button
                key={project.id}
                type="button"
                className="w-full flex items-center gap-3 px-2 py-2 text-sm rounded-md hover:bg-[#2a2a2a] transition-colors text-left"
                onClick={() => toggleProject(project.id)}
                aria-pressed={isSelected}
              >
                <div className="w-4 h-4 flex items-center justify-center">
                  {isSelected && <Check className="h-3 w-3 text-[#22c55e]" />}
                </div>
                <div 
                  className="w-3 h-3 rounded flex-shrink-0"
                  style={{ backgroundColor: project.color || '#6b7280' }}
                  aria-hidden="true"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-[#e6edf3] font-medium truncate">{project.name}</div>
                </div>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
