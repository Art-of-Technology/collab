import React from "react";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import type { TaskLabel } from "./label-selector";

interface SelectedLabelsDisplayProps {
  selectedLabels: TaskLabel[];
  onRemove?: (labelId: string, e: React.MouseEvent) => void;
}

export const SelectedLabelsDisplay: React.FC<SelectedLabelsDisplayProps> = ({ selectedLabels, onRemove }) => {
  if (selectedLabels.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {selectedLabels.map((label) => (
        <Badge
          key={label.id}
          variant="secondary"
          className="text-xs"
          style={{ backgroundColor: `${label.color}20`, borderColor: label.color }}
        >
          <div
            className="w-2 h-2 rounded-full mr-1"
            style={{ backgroundColor: label.color }}
          />
          {label.name}
          {onRemove && (
            <button
              onClick={(e) => onRemove(label.id, e)}
              className="ml-1 hover:bg-gray-200 rounded-full p-0.5"
              type="button"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </Badge>
      ))}
    </div>
  );
}; 