/* eslint-disable */
"use client";

import React, { useState, useEffect } from "react";
import { Check, ChevronsUpDown, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { createLabel, getWorkspaceLabels } from "@/actions/label";
import { useToast } from "@/hooks/use-toast";
import { SelectedLabelsDisplay } from "@/components/ui/SelectedLabelsDisplay";

export interface TaskLabel {
  id: string;
  name: string;
  color: string;
}

interface LabelSelectorProps {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  workspaceId?: string;
}

const DEFAULT_COLORS = [
  "#6366F1", // Indigo
  "#8B5CF6", // Violet  
  "#EC4899", // Pink we already have
  "#EF4444", // Red
  "#F97316", // Orange
  "#EAB308", // Yellow
  "#22C55E", // Green
  "#06B6D4", // Cyan
  "#3B82F6", // Blue
  "#6B7280", // Gray
];

export function LabelSelector({
  value = [],
  onChange,
  placeholder = "Select labels...",
  disabled = false,
  workspaceId,
}: LabelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [labels, setLabels] = useState<TaskLabel[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [newLabelName, setNewLabelName] = useState("");
  const [isCreatingLabel, setIsCreatingLabel] = useState(false);
  const { toast } = useToast();

  // Load labels when component mounts or workspace changes
  useEffect(() => {
    loadLabels();
  }, [workspaceId]);

  const loadLabels = async () => {
    try {
      setLoading(true);
      const response = await getWorkspaceLabels();
      setLabels(response.labels);
    } catch (error) {
      console.error("Failed to load labels:", error);
      toast({
        title: "Error",
        description: "Failed to load labels",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateLabel = async () => {
    if (!newLabelName.trim()) {
      toast({
        title: "Error",
        description: "Label name is required",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsCreatingLabel(true);
      const randomColor = DEFAULT_COLORS[Math.floor(Math.random() * DEFAULT_COLORS.length)];
      const newLabel = await createLabel({
        name: newLabelName.trim(),
        color: randomColor,
        workspaceId,
      });

      // Add the new label to the list
      setLabels(prev => [...prev, newLabel]);
      
      // Add it to the selected values
      onChange([...value, newLabel.id]);
      
      // Clear the input
      setNewLabelName("");
      
      toast({
        title: "Success",
        description: "Label created successfully",
      });
    } catch (error: any) {
      console.error("Failed to create label:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create label",
        variant: "destructive",
      });
    } finally {
      setIsCreatingLabel(false);
    }
  };

  const handleToggleLabel = (labelId: string) => {
    if (value.includes(labelId)) {
      onChange(value.filter(id => id !== labelId));
    } else {
      onChange([...value, labelId]);
    }
  };

  const handleRemoveLabel = (labelId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onChange(value.filter(id => id !== labelId));
  };

  const selectedLabels = labels.filter(label => value.includes(label.id));
  const filteredLabels = labels.filter(label =>
    label.name.toLowerCase().includes(searchValue.toLowerCase())
  );

  return (
    <div className="space-y-2">
      {/* Selected Labels Display */}
      <SelectedLabelsDisplay selectedLabels={selectedLabels} onRemove={handleRemoveLabel} />

      {/* Label Selector */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn(
              "w-full justify-between min-w-0 px-2",
              selectedLabels.length === 0 && "text-muted-foreground"
            )}
            disabled={disabled}
          >
            <span className="truncate">
              {selectedLabels.length > 0
                ? `${selectedLabels.length} label${selectedLabels.length > 1 ? 's' : ''} selected`
                : placeholder}
            </span>
            <ChevronsUpDown className="ml-1 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0" align="start">
          <Command>
            <CommandInput
              placeholder="Search labels..."
              value={searchValue}
              onValueChange={setSearchValue}
            />
            <CommandList>
              <CommandEmpty>
                {loading ? "Loading labels..." : "No labels found."}
              </CommandEmpty>
              <CommandGroup>
                {filteredLabels.map((label) => (
                  <CommandItem
                    key={label.id}
                    value={label.name}
                    onSelect={() => handleToggleLabel(label.id)}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value.includes(label.id) ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <div
                      className="w-3 h-3 rounded-full mr-2"
                      style={{ backgroundColor: label.color }}
                    />
                    {label.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
            
            {/* Add New Label Section */}
            <div className="border-t p-3 space-y-2">
              <div className="flex gap-2">
                <Input
                  placeholder="New label name..."
                  value={newLabelName}
                  onChange={(e) => setNewLabelName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleCreateLabel();
                    }
                  }}
                  className="flex-1"
                />
                <Button
                  onClick={handleCreateLabel}
                  disabled={isCreatingLabel || !newLabelName.trim()}
                  size="sm"
                  className="shrink-0"
                >
                  {isCreatingLabel ? (
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white" />
                  ) : (
                    <Plus className="h-3 w-3" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Press Enter or click + to create a new label
              </p>
            </div>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
} 