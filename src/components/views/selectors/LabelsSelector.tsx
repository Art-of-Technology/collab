"use client";

import { useState, useMemo } from "react";
import { Tags, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlobalFilterSelector, FilterOption } from "@/components/ui/GlobalFilterSelector";
import { createLabel } from "@/actions/label";
import { useToast } from "@/hooks/use-toast";

interface LabelsSelectorProps {
  value: string[];
  onChange: (labels: string[]) => void;
  disabled?: boolean;
  labels?: Array<{
    id: string;
    name: string;
    color: string;
  }>;
  workspaceId?: string;
  onLabelCreated?: (label: { id: string; name: string; color: string }) => void;
}

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

export function LabelsSelector({
  value = [],
  onChange,
  disabled = false,
  labels = [],
  workspaceId,
  onLabelCreated,
}: LabelsSelectorProps) {
  const [isCreating, setIsCreating] = useState(false);
  const { toast } = useToast();

  // Convert to FilterOption format
  const options: FilterOption[] = useMemo(() => {
    return labels.map(label => ({
      id: label.id,
      label: label.name,
      color: label.color,
    }));
  }, [labels]);

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

      // Add the new label to selected values
      onChange([...value, newLabel.id]);

      // Notify parent component about the new label
      if (onLabelCreated) {
        onLabelCreated(newLabel);
      }

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

  // Custom empty/no results rendering for create functionality
  const renderNoResults = (searchQuery: string) => (
    <div className="px-2 py-4 text-center text-[#6e7681] text-xs">
      <div className="space-y-2">
        <p>No labels found for "{searchQuery}"</p>
        {workspaceId && (
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
        )}
      </div>
    </div>
  );

  const renderEmptyState = () => (
    <div className="px-2 py-4 text-center text-[#6e7681] text-xs">
      <div className="space-y-2">
        <p>No labels available</p>
        {workspaceId && (
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
        )}
      </div>
    </div>
  );

  return (
    <GlobalFilterSelector
      value={value}
      onChange={onChange as (value: string | string[]) => void}
      options={options}
      label="Labels"
      pluralLabel="labels"
      emptyIcon={Tags}
      selectionMode="multi"
      showSearch={true}
      searchPlaceholder="Search labels..."
      allowClear={true}
      disabled={disabled}
      popoverWidth="w-80"
      filterHeader="Filter by labels"
      renderNoResults={renderNoResults}
      renderEmptyState={renderEmptyState}
    />
  );
}
