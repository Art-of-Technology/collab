"use client";

import { useState, useEffect } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
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
        <Button
          type="button"
          variant="ghost"
          disabled={disabled}
          className={cn(
            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs transition-colors h-auto leading-tight min-h-[20px]",
            "border border-collab-600 hover:border-collab-600 hover:bg-collab-800",
            "text-collab-400 focus:outline-none bg-collab-800",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        >
          <Home className="h-3 w-3 text-collab-500" />
          <span className="text-collab-400 text-xs truncate max-w-[100px]">
            {selectedProject ? selectedProject.name : "Project"}
          </span>
        </Button>
      </PopoverTrigger>
      
      <PopoverContent 
        className="w-60 p-1 bg-collab-800 border-collab-600 shadow-xl"
        align="start"
        side="bottom"
        sideOffset={4}
      >
        <div className="text-xs text-gray-400 px-2 py-1.5 border-b border-collab-600 mb-1 font-medium">
          Select project
        </div>
        
        <div className="max-h-64 overflow-y-auto scrollbar-thin scrollbar-thumb-collab-600 scrollbar-track-transparent">
          <Button
            type="button"
            variant="ghost"
            className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-collab-600 transition-colors text-left h-auto justify-start"
            onClick={() => {
              onChange(undefined);
              setIsOpen(false);
            }}
          >
            <div className="w-4 h-4 rounded border border-dashed border-collab-600 flex items-center justify-center">
              <span className="text-xs text-collab-500">×</span>
            </div>
            <span className="text-gray-400">No project</span>
            {!value && (
              <span className="ml-auto text-xs text-collab-500">✓</span>
            )}
          </Button>

          {projects.map((project) => (
            <Button
              key={project.id}
              type="button"
              variant="ghost"
              className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-collab-600 transition-colors text-left h-auto justify-start"
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
              <span className="text-collab-50">{project.name}</span>
              {value === project.id && (
                <span className="ml-auto text-xs text-collab-500">✓</span>
              )}
            </Button>
          ))}
          
          {isLoading && (
            <div className="px-2 py-4 text-center text-collab-500 text-sm">
              Loading projects...
            </div>
          )}
          
          {!isLoading && projects.length === 0 && (
            <div className="px-2 py-4 text-center text-collab-500 text-sm">
              No projects found
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
