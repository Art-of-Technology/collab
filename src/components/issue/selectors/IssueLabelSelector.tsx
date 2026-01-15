"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import { Tags, Search, X, Plus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { IssueSelectorProps, IssueLabel } from "@/types/issue";
import { createLabel } from "@/actions/label";
import { useToast } from "@/hooks/use-toast";

interface IssueLabelSelectorProps extends Omit<IssueSelectorProps, 'value' | 'onChange'> {
  value: string[];
  onChange: (labelIds: string[]) => void;
  workspaceId?: string;
}

export function IssueLabelSelector({
  value = [],
  onChange,
  disabled = false,
  workspaceId
}: IssueLabelSelectorProps) {
  const [labels, setLabels] = useState<IssueLabel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!workspaceId) return;

    const fetchLabels = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/workspaces/${workspaceId}/labels`);
        if (!response.ok) {
          throw new Error("Failed to fetch workspace labels");
        }
        const data = await response.json();
        setLabels(data.labels || []);
      } catch (error) {
        console.error("Error fetching workspace labels:", error);
        setLabels([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchLabels();
  }, [workspaceId]);

  const selectedLabels = labels.filter(label => value.includes(label.id));
  const filteredLabels = labels.filter(label => 
    label.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleLabelToggle = (labelId: string) => {
    if (value.includes(labelId)) {
      onChange(value.filter(id => id !== labelId));
    } else {
      onChange([...value, labelId]);
    }
  };

  const DEFAULT_COLORS = [
    "#6366F1", // Indigo
    "#8B5CF6", // Violet  
    "#EC4899", // Pink
    "#EF4444", // Red
    "#F97316", // Orange
    "#EAB308", // Yellow
    "#22C55E", // Green
    "#06B6D4", // Cyan
    "#3B82F6", // Blue
    "#6B7280", // Gray
  ];

  const handleCreateLabel = async (labelName: string) => {
    if (!labelName.trim() || !workspaceId) {
      toast({
        title: "Error",
        description: !labelName.trim() ? "Label name is required" : "Workspace ID is required",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsCreating(true);
      const randomColor = DEFAULT_COLORS[Math.floor(Math.random() * DEFAULT_COLORS.length)];
      
      const newLabel = await createLabel({
        name: labelName.trim(),
        color: randomColor,
        workspaceId,
      });

      // Add the new label to the labels list
      setLabels(prev => [...prev, newLabel]);
      
      // Add the new label to selected values
      onChange([...value, newLabel.id]);
      
      // Clear search and close popover
      setSearchQuery("");
      setIsOpen(false);
      
      toast({
        title: "Success",
        description: `Label "${newLabel.name}" created successfully`,
      });
    } catch (error: any) {
      console.error("Failed to create label:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create label",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleRemoveLabel = (labelId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onChange(value.filter(id => id !== labelId));
  };



  return (
    <Popover modal={true} open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          disabled={disabled}
          className={cn(
            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs transition-colors h-auto leading-tight min-h-[20px]",
            "border border-[#2d2d30] hover:border-[#464649] hover:bg-[#1a1a1a]",
            "text-[#cccccc] focus:outline-none bg-[#181818]",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        >
          {selectedLabels.length === 0 ? (
            <>
              <Tags className="h-3 w-3 text-[#6e7681]" />
              <span className="text-[#6e7681] text-xs">Labels</span>
            </>
          ) : selectedLabels.length === 1 ? (
            <>
              <div
                className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: selectedLabels[0].color }}
              />
              <span className="text-[#cccccc] text-xs truncate max-w-[80px]">{selectedLabels[0].name}</span>
            </>
          ) : (
            <>
              <div className="flex items-center -space-x-1">
                {selectedLabels.slice(0, 3).map((label, index) => (
                  <div
                    key={label.id}
                    className="h-2.5 w-2.5 rounded-full border border-[#181818] flex-shrink-0"
                    style={{
                      backgroundColor: label.color,
                      zIndex: 3 - index
                    }}
                  />
                ))}
                {selectedLabels.length > 3 && (
                  <div className="h-2.5 w-2.5 rounded-full bg-[#404040] border border-[#181818] flex items-center justify-center">
                    <span className="text-[8px] text-white font-medium">+</span>
                  </div>
                )}
              </div>
              <span className="text-[#cccccc] text-xs">{selectedLabels.length} labels</span>
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-80 p-0 bg-[#1c1c1e] border-[#2d2d30] shadow-xl" 
        align="start"
        side="bottom"
        sideOffset={4}
      >
        <div className="p-3 border-b border-[#2d2d30]">
          <div className="text-xs text-[#9ca3af] mb-2 font-medium">
            Labels
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-[#6e7681]" />
            <Input
              placeholder="Search labels..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-7 text-xs bg-[#0e0e0e] border-[#2d2d30] focus:border-[#464649] text-[#cccccc]"
            />
          </div>
        </div>

        <div className="max-h-60 overflow-y-auto scrollbar-thin scrollbar-thumb-[#444] scrollbar-track-transparent p-1">
          {isLoading ? (
            <div className="px-2 py-4 text-center text-[#6e7681] text-xs">
              Loading labels...
            </div>
          ) : filteredLabels.length > 0 ? (
            <div className="space-y-0.5">
              {filteredLabels.map((label) => (
                <div
                  key={label.id}
                  className="flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-[#2a2a2a] cursor-pointer transition-colors group"
                  onClick={() => handleLabelToggle(label.id)}
                >
                  <div className="flex items-center gap-2 flex-1">
                    <div 
                      className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: label.color }}
                    />
                    <span className="text-[#cccccc]">{label.name}</span>
                  </div>
                  {value.includes(label.id) && (
                    <span className="text-xs text-[#6e7681]">✓</span>
                  )}
                </div>
              ))}
            </div>
          ) : searchQuery ? (
            <div className="px-2 py-4 text-center text-[#6e7681] text-xs">
              <div className="space-y-2">
                <p>No labels found for "{searchQuery}"</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 h-6 text-xs bg-[#0e0e0e] border-[#2d2d30] hover:bg-[#1a1a1a] text-[#cccccc]"
                  onClick={() => handleCreateLabel(searchQuery)}
                  disabled={isCreating}
                >
                  {isCreating ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Plus className="h-3 w-3" />
                  )}
                  {isCreating ? "Creating..." : `Create "${searchQuery}"`}
                </Button>
              </div>
            </div>
          ) : (
            <div className="px-2 py-4 text-center text-[#6e7681] text-xs">
              <div className="space-y-2">
                <p>No labels available</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 h-6 text-xs bg-[#0e0e0e] border-[#2d2d30] hover:bg-[#1a1a1a] text-[#cccccc]"
                  onClick={() => handleCreateLabel("New Label")}
                  disabled={isCreating}
                >
                  {isCreating ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Plus className="h-3 w-3" />
                  )}
                  {isCreating ? "Creating..." : "Create label"}
                </Button>
              </div>
            </div>
          )}
        </div>

        {selectedLabels.length > 0 && (
          <div className="border-t border-[#2d2d30] p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-[#6e7681] hover:text-[#cccccc] hover:bg-[#2a2a2a] h-7 text-xs"
              onClick={() => onChange([])}
            >
              <X className="h-3 w-3 mr-2" />
              Clear all labels
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
} 