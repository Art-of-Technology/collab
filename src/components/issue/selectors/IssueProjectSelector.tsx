"use client";

import { useState, useEffect } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Home, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface Project {
  id: string;
  name: string;
  color?: string;
}

interface IssueProjectSelectorProps {
  value?: string;
  onChange: (value?: string) => void;
  workspaceId: string;
  disabled?: boolean;
}

export function IssueProjectSelector({
  value,
  onChange,
  workspaceId,
  disabled = false,
}: IssueProjectSelectorProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!workspaceId) return;

    const fetchProjects = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/workspaces/${workspaceId}/projects`);
        if (!response.ok) {
          throw new Error("Failed to fetch projects");
        }
        const data = await response.json();
        setProjects(data.projects || []);
      } catch (error) {
        console.error("Error fetching projects:", error);
        setProjects([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProjects();
  }, [workspaceId]);

  const selectedProject = projects.find(project => project.id === value);

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
          <Home className="h-3 w-3 text-[#6e7681]" />
          <span className="text-[#cccccc] text-xs truncate max-w-[100px]">
            {selectedProject ? selectedProject.name : "Project"}
          </span>
        </button>
      </PopoverTrigger>
      
      <PopoverContent 
        className="w-60 p-1 bg-[#1c1c1e] border-[#2d2d30] shadow-xl"
        align="start"
        side="bottom"
        sideOffset={4}
      >
        <div className="text-xs text-[#9ca3af] px-2 py-1.5 border-b border-[#2d2d30] mb-1 font-medium">
          Select project
        </div>
        
        <div className="max-h-64 overflow-y-auto scrollbar-thin scrollbar-thumb-[#444] scrollbar-track-transparent">
          <button
            type="button"
            className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-[#2a2a2a] transition-colors text-left"
            onClick={() => {
              onChange(undefined);
              setIsOpen(false);
            }}
          >
            <div className="w-4 h-4 rounded border border-dashed border-[#555] flex items-center justify-center">
              <span className="text-xs text-[#6e7681]">×</span>
            </div>
            <span className="text-[#9ca3af]">No project</span>
            {!value && (
              <span className="ml-auto text-xs text-[#6e7681]">✓</span>
            )}
          </button>
          
          {projects.map((project) => (
            <button
              key={project.id}
              type="button"
              className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-[#2a2a2a] transition-colors text-left"
              onClick={() => {
                onChange(project.id);
                setIsOpen(false);
              }}
            >
              <div 
                className="w-4 h-4 rounded flex items-center justify-center"
                style={{ backgroundColor: project.color || "#6366f1" }}
              >
                <Home className="h-2.5 w-2.5 text-white" />
              </div>
              <span className="text-[#e6edf3]">{project.name}</span>
              {value === project.id && (
                <span className="ml-auto text-xs text-[#6e7681]">✓</span>
              )}
            </button>
          ))}
          
          {isLoading && (
            <div className="px-2 py-4 text-center text-[#6e7681] text-sm">
              Loading projects...
            </div>
          )}
          
          {!isLoading && projects.length === 0 && (
            <div className="px-2 py-4 text-center text-[#6e7681] text-sm">
              No projects found
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
