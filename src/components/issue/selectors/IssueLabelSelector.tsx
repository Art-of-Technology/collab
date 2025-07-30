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
import { Checkbox } from "@/components/ui/checkbox";
import { Tags, Search, X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { IssueSelectorProps, IssueLabel } from "@/types/issue";

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

  const handleRemoveLabel = (labelId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onChange(value.filter(id => id !== labelId));
  };

  // Label display component
  const LabelBadge = ({ 
    label, 
    showRemove = false, 
    onRemove 
  }: { 
    label: IssueLabel; 
    showRemove?: boolean;
    onRemove?: (e: React.MouseEvent) => void;
  }) => (
    <Badge
      variant="outline"
      className={cn(
        "flex items-center gap-1.5 font-medium border-current/20",
        "transition-all duration-200"
      )}
      style={{
        backgroundColor: `${label.color}15`,
        borderColor: `${label.color}40`,
        color: label.color
      }}
    >
      <div 
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: label.color }}
      />
      <span className="text-xs">{label.name}</span>
      {showRemove && onRemove && (
        <Button
          variant="ghost"
          size="sm"
          className="h-3 w-3 p-0 hover:bg-current/20 ml-1"
          onClick={onRemove}
        >
          <X className="h-2 w-2" />
        </Button>
      )}
    </Badge>
  );

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal min-h-[40px] h-auto py-2",
            "border-border/50 bg-background/50",
            "hover:border-border/80 hover:bg-background/80",
            "focus:border-primary/50 focus:bg-background",
            "transition-all duration-200"
          )}
          disabled={disabled}
        >
          <Tags className="mr-2 h-4 w-4 flex-shrink-0" />
          <div className="flex-1 flex flex-wrap gap-1">
            {selectedLabels.length > 0 ? (
              selectedLabels.map((label) => (
                <LabelBadge
                  key={label.id}
                  label={label}
                  showRemove={true}
                  onRemove={(e) => handleRemoveLabel(label.id, e)}
                />
              ))
            ) : (
              <span className="text-muted-foreground text-sm">No labels</span>
            )}
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-80 p-0 shadow-lg border-border/50" 
        align="start"
        side="bottom"
        sideOffset={4}
      >
        <div className="p-3 border-b border-border/50">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search labels..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 border-border/50 focus:border-primary/50"
            />
          </div>
        </div>

        <div className="max-h-60 overflow-y-auto">
          {isLoading ? (
            <div className="p-4 text-center text-muted-foreground">
              Loading labels...
            </div>
          ) : filteredLabels.length > 0 ? (
            <div className="p-2">
              {filteredLabels.map((label) => (
                <div
                  key={label.id}
                  className="flex items-center space-x-3 rounded-md p-2 hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => handleLabelToggle(label.id)}
                >
                  <Checkbox
                    checked={value.includes(label.id)}
                    onChange={() => handleLabelToggle(label.id)}
                  />
                  <LabelBadge label={label} />
                </div>
              ))}
            </div>
          ) : searchQuery ? (
            <div className="p-4 text-center text-muted-foreground">
              <div className="space-y-2">
                <p>No labels found for "{searchQuery}"</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => {
                    // TODO: Implement create label functionality
                    console.log("Create label:", searchQuery);
                  }}
                >
                  <Plus className="h-3 w-3" />
                  Create "{searchQuery}"
                </Button>
              </div>
            </div>
          ) : (
            <div className="p-4 text-center text-muted-foreground">
              <div className="space-y-2">
                <p>No labels available</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => {
                    // TODO: Implement create label functionality
                    console.log("Create first label");
                  }}
                >
                  <Plus className="h-3 w-3" />
                  Create label
                </Button>
              </div>
            </div>
          )}
        </div>

        {selectedLabels.length > 0 && (
          <div className="border-t border-border/50 p-3">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground hover:text-foreground"
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