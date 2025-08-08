"use client";

import { forwardRef, useEffect, useState, useRef } from 'react';
import { CommandEmpty, CommandGroup, CommandItem, CommandList, Command } from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { CheckIcon, Flag } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Milestone {
  id: string;
  title: string;
  issueKey: string | null;
  status: string | null;
  taskBoard: {
    id: string;
    name: string;
  } | null;
}

interface MilestoneMentionSuggestionProps {
  query: string;
  onSelect: (milestone: Milestone) => void;
  workspaceId?: string;
  onEscape?: () => void;
}

export const MilestoneMentionSuggestion = forwardRef<HTMLDivElement, MilestoneMentionSuggestionProps>(
  ({ query, onSelect, workspaceId, onEscape }, ref) => {
    const [milestones, setMilestones] = useState<Milestone[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const [isKeyboardNavigation, setIsKeyboardNavigation] = useState(false);
    const commandRef = useRef<HTMLDivElement>(null);

    // Function to get status color
    const getStatusColor = (status: string | null): string => {
      if (!status) return 'bg-gray-100 text-gray-700';
      
      switch (status.toLowerCase()) {
        case 'done':
        case 'completed':
          return 'bg-green-100 text-green-700';
        case 'in progress':
        case 'in_progress':
          return 'bg-blue-100 text-blue-700';
        case 'backlog':
        case 'open':
          return 'bg-gray-100 text-gray-700';
        default:
          return 'bg-gray-100 text-gray-700';
      }
    };

    // Handle keyboard navigation
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (!milestones.length) return;

        // Arrow keys for navigation
        if (e.key === "ArrowDown") {
          e.preventDefault();
          e.stopPropagation();
          setIsKeyboardNavigation(true);
          setSelectedIndex((prev) => {
            // If no item is selected (-1), start from 0
            if (prev === -1) return 0;
            // Otherwise move to next item
            return prev < milestones.length - 1 ? prev + 1 : prev;
          });
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          e.stopPropagation();
          setIsKeyboardNavigation(true);
          setSelectedIndex((prev) => {
            // If no item is selected (-1), start from last item
            if (prev === -1) return milestones.length - 1;
            // Otherwise move to previous item
            return prev > 0 ? prev - 1 : prev;
          });
        } else if (e.key === "Enter" && selectedIndex >= 0 && milestones[selectedIndex]) {
          e.preventDefault();
          e.stopPropagation();
          onSelect(milestones[selectedIndex]);
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          onEscape?.();
        }
      };

      // Add event listener to document with capture phase
      document.addEventListener("keydown", handleKeyDown, true);
      return () => {
        document.removeEventListener("keydown", handleKeyDown, true);
      };
    }, [milestones, milestones.length, selectedIndex, onSelect, onEscape]);

    // Search milestones when query changes
    useEffect(() => {
      const fetchMilestones = async () => {
        setLoading(true);
        try {
          // Fetch milestones with the query (empty query will return all workspace milestones)
          const params = new URLSearchParams({ q: query || '' });
          if (workspaceId) {
            params.append('workspace', workspaceId);
          }
          
          const response = await fetch(`/api/milestones/search?${params}`);
          if (response.ok) {
            const searchedMilestones = await response.json();
            setMilestones(searchedMilestones);
            // Reset selected index when new results come in
            setSelectedIndex(-1);
            setIsKeyboardNavigation(false);
          } else {
            console.error('Failed to search milestones');
            setMilestones([]);
          }
        } catch (error) {
          console.error('Error searching milestones:', error);
          setMilestones([]);
        } finally {
          setLoading(false);
        }
      };
      
      fetchMilestones();
    }, [query, workspaceId]);

    // Scroll selected item into view
    useEffect(() => {
      if (commandRef.current && milestones.length > 0 && isKeyboardNavigation) {
        const selectedElement = commandRef.current.querySelector(`[data-index="${selectedIndex}"]`);
        if (selectedElement) {
          selectedElement.scrollIntoView({ block: 'nearest' });
        }
      }
    }, [selectedIndex, milestones.length, isKeyboardNavigation]);

    // Handle mouse enter to disable keyboard navigation styling
    const handleMouseEnter = (index: number) => {
      setIsKeyboardNavigation(false);
      setSelectedIndex(index);
    };

    return (
      <div ref={ref} className="z-50 overflow-hidden rounded-lg border shadow-lg animate-in fade-in-0 zoom-in-95 bg-popover">
        <Command ref={commandRef} className="w-[350px]" shouldFilter={false}>
          <div className="px-3 py-2 text-xs font-medium text-muted-foreground border-b">
            Mention a milestone
          </div>
          <CommandList className="max-h-[200px] overflow-y-auto">
            {loading ? (
              <div className="py-6 text-center flex items-center justify-center space-x-2">
                <div className="animate-spin h-3 w-3 rounded-full border-b-2 border-primary"></div>
                <span className="text-sm text-muted-foreground">Searching...</span>
              </div>
            ) : milestones.length === 0 ? (
              <div className="py-6 text-center">
                <Flag className="h-8 w-8 mx-auto text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground mt-2">No milestones found</p>
              </div>
            ) : (
              <CommandGroup>
                {milestones.map((milestone, index) => (
                  <div
                    key={milestone.id}
                    data-index={index}
                    onClick={() => onSelect(milestone)}
                    onMouseEnter={() => handleMouseEnter(index)}
                    className={cn(
                      "flex items-center gap-2 px-2 py-2 cursor-pointer rounded-sm",
                      // Our own hover and selected states
                      !isKeyboardNavigation && "hover:bg-accent/50",
                      isKeyboardNavigation && selectedIndex === index && "bg-accent"
                    )}
                  >
                    <div className="flex items-center gap-2 flex-1">
                      <Flag className="h-4 w-4 text-muted-foreground" />
                      <div className="flex flex-col gap-1 flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {milestone.issueKey && (
                            <Badge variant="outline" className="text-xs shrink-0">
                              {milestone.issueKey}
                            </Badge>
                          )}
                          <span className="text-sm font-medium truncate">{milestone.title}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {milestone.status && (
                            <Badge className={cn("text-xs", getStatusColor(milestone.status))}>
                              {milestone.status}
                            </Badge>
                          )}
                          {milestone.taskBoard && (
                            <span className="text-xs text-muted-foreground truncate">
                              {milestone.taskBoard.name}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {isKeyboardNavigation && selectedIndex === index && (
                      <CheckIcon className="h-4 w-4 text-primary" />
                    )}
                  </div>
                ))}
              </CommandGroup>
            )}
          </CommandList>
          {milestones.length > 0 && (
            <div className="px-2 py-1.5 text-xs border-t flex justify-between">
              <span className="text-muted-foreground">
                <kbd className="px-1.5 py-0.5 bg-muted rounded border">↑</kbd>
                <kbd className="px-1.5 py-0.5 bg-muted rounded border ml-1">↓</kbd> to navigate
              </span>
              <span className="text-muted-foreground">
                <kbd className="px-1.5 py-0.5 bg-muted rounded border">enter</kbd> to select
              </span>
            </div>
          )}
        </Command>
      </div>
    );
  }
);

MilestoneMentionSuggestion.displayName = "MilestoneMentionSuggestion"; 