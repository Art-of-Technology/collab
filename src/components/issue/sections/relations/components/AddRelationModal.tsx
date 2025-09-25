"use client";

import { useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Search, X, CheckSquare, Circle, GitBranch, Bug, Flag } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { IssueProjectSelector } from "@/components/issue/selectors/IssueProjectSelector";
import type { AddRelationModalProps, RelationItem, RelatedItemType, IssueRelationType } from "../types/relation";
import { getRelationConfig } from "../utils/relationConfig";
import { useCrossWorkspaceRelationSearch } from "../hooks/useCrossWorkspaceRelationSearch";
import { SearchRelationItem } from "./SearchRelationItem";
import { SelectedRelationItem } from "./SelectedRelationItem";

export function AddRelationModal({
  isOpen,
  onClose,
  onAdd,
  relationType,
  workspaceId,
  currentIssueId,
  excludeIds = []
}: AddRelationModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedItems, setSelectedItems] = useState<RelationItem[]>([]);
  const [selectedRelationTypes, setSelectedRelationTypes] = useState<Record<string, IssueRelationType>>({});
  const [typeFilter, setTypeFilter] = useState<RelatedItemType | "all">("all");
  const [projectFilter, setProjectFilter] = useState<string | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const config = getRelationConfig(relationType);
  
  // Prepare search filters
  const searchFilters = useMemo(() => ({
    type: typeFilter === "all" ? undefined : [typeFilter],
    project: projectFilter ? [projectFilter] : undefined,
  }), [typeFilter, projectFilter]);

  // Prepare exclude IDs (current issue + existing relations + selected items)
  const allExcludeIds = useMemo(() => [
    currentIssueId,
    ...excludeIds,
    ...selectedItems.map(item => item.id)
  ], [currentIssueId, excludeIds, selectedItems]);

  // Cross-workspace search hook
  const { data: searchResults = [], isLoading } = useCrossWorkspaceRelationSearch(
    searchQuery,
    searchFilters,
    allExcludeIds,
    isOpen && searchQuery.length >= 2
  );

  const handleToggleItem = useCallback((item: RelationItem) => {
    setSelectedItems(prev => {
      const isSelected = prev.some(selected => selected.id === item.id);
      if (isSelected) {
        // Remove from selected items and relation types
        setSelectedRelationTypes(prevTypes => {
          const newTypes = { ...prevTypes };
          delete newTypes[item.id];
          return newTypes;
        });
        return prev.filter(selected => selected.id !== item.id);
      } else {
        // Add to selected items with default relation type
        setSelectedRelationTypes(prevTypes => ({
          ...prevTypes,
          [item.id]: relationType ?? 'child' // Default to child relation
        }));
        return [...prev, item];
      }
    });
  }, [relationType]);

  const handleRemoveSelected = useCallback((itemId: string) => {
    setSelectedItems(prev => prev.filter(item => item.id !== itemId));
    setSelectedRelationTypes(prevTypes => {
      const newTypes = { ...prevTypes };
      delete newTypes[itemId];
      return newTypes;
    });
  }, []);

  const handleRelationTypeChange = useCallback((itemId: string, newRelationType: IssueRelationType) => {
    setSelectedRelationTypes(prev => ({
      ...prev,
      [itemId]: newRelationType
    }));
  }, []);

  const handleSubmit = async () => {
    if (selectedItems.length === 0) return;

    setIsSubmitting(true);
    try {
      // Prepare relations with their types
      const relations = selectedItems.map(item => ({
        item,
        relationType: selectedRelationTypes[item.id] ?? relationType ?? 'child'
      }));
      await onAdd(relations);
      handleClose();
    } catch (error) {
      console.error("Failed to add relations:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setSearchQuery("");
    setSelectedItems([]);
    setSelectedRelationTypes({});
    setTypeFilter("all");
    setProjectFilter(undefined);
    onClose();
  };

  const isSelected = useCallback((item: RelationItem) => {
    return selectedItems.some(selected => selected.id === item.id);
  }, [selectedItems]);

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl w-full p-0 bg-[#0e0e0e] border-[#1a1a1a] overflow-hidden max-h-[80vh] flex flex-col">
        <VisuallyHidden>
          <DialogTitle>Add {config.label}</DialogTitle>
        </VisuallyHidden>
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1a1a1a]">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-sm bg-purple-500 flex items-center justify-center">
              <span className="text-xs text-white font-medium">+</span>
            </div>
            <span className="text-[#9ca3af] text-sm">Add {config.label}</span>
          </div>
          <button
            onClick={handleClose}
            className="text-[#6e7681] hover:text-white transition-colors p-1 rounded-md hover:bg-[#1a1a1a]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="px-4 py-4 flex-1 overflow-hidden flex flex-col">
          <p className="text-sm text-[#8b949e] mb-4">
            {config.description}
          </p>

          {/* Search Input */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-3 h-4 w-4 text-[#8b949e]" />
            <Input
              placeholder={config.searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-[#0e0e0e] border-[#1a1a1a] text-[#e1e7ef] placeholder-[#8b949e] focus:border-[#333] focus:ring-0"
            />
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-1 mb-4">
            {/* Type Filter with All Types Option */}
            <Popover modal={true}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs transition-colors h-auto leading-tight min-h-[20px] border border-[#2d2d30] hover:border-[#464649] hover:bg-[#1a1a1a] text-[#cccccc] focus:outline-none bg-[#181818]"
                >
                  {typeFilter === "all" ? (
                    <>
                      <div className="h-3 w-3 rounded-sm bg-gradient-to-r from-blue-500 to-purple-500"></div>
                      <span className="text-[#cccccc] text-xs">All types</span>
                    </>
                  ) : typeFilter === "issue" ? (
                    <>
                      <CheckSquare className="h-3 w-3" style={{ color: "#6366f1" }} />
                      <span className="text-[#cccccc] text-xs">Issue</span>
                    </>
                  ) : typeFilter === "story" ? (
                    <>
                      <Circle className="h-3 w-3" style={{ color: "#22c55e" }} />
                      <span className="text-[#cccccc] text-xs">Story</span>
                    </>
                  ) : typeFilter === "epic" ? (
                    <>
                      <GitBranch className="h-3 w-3" style={{ color: "#a855f7" }} />
                      <span className="text-[#cccccc] text-xs">Epic</span>
                    </>
                  ) : typeFilter === "milestone" ? (
                    <>
                      <Flag className="h-3 w-3" style={{ color: "#f59e0b" }} />
                      <span className="text-[#cccccc] text-xs">Milestone</span>
                    </>
                  ) : typeFilter === "defect" ? (
                    <>
                      <Bug className="h-3 w-3" style={{ color: "#ef4444" }} />
                      <span className="text-[#cccccc] text-xs">Bug</span>
                    </>
                  ) : (
                    <>
                      <div className="h-3 w-3 rounded-sm bg-gradient-to-r from-blue-500 to-purple-500"></div>
                      <span className="text-[#cccccc] text-xs">All types</span>
                    </>
                  )}
                </button>
              </PopoverTrigger>
              
              <PopoverContent 
                className="w-48 p-1 bg-[#1c1c1e] border-[#333] shadow-lg"
                align="start"
                side="bottom"
                sideOffset={4}
              >
                <div className="text-xs text-[#9ca3af] px-2 py-1.5 border-b border-[#333] mb-1">
                  Filter by type
                </div>
                
                <div className="space-y-0.5">
                  <button
                    type="button"
                    className="w-full flex items-center gap-3 px-2 py-2 text-sm rounded-md hover:bg-[#2a2a2a] transition-colors text-left"
                    onClick={() => setTypeFilter("all")}
                  >
                    <div className="h-4 w-4 rounded-sm bg-gradient-to-r from-blue-500 to-purple-500 flex-shrink-0"></div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[#e6edf3] font-medium">All types</div>
                    </div>
                    {typeFilter === "all" && (
                      <span className="text-xs text-[#6e7681]">✓</span>
                    )}
                  </button>
                  
                  {[
                    { value: "issue", label: "Issue", icon: CheckSquare, color: "#6366f1" },
                    { value: "story", label: "Story", icon: Circle, color: "#22c55e" },
                    { value: "epic", label: "Epic", icon: GitBranch, color: "#a855f7" },
                    { value: "milestone", label: "Milestone", icon: Flag, color: "#f59e0b" },
                    { value: "defect", label: "Bug", icon: Bug, color: "#ef4444" }
                  ].map((type) => {
                    const Icon = type.icon;
                    return (
                      <button
                        key={type.value}
                        type="button"
                        className="w-full flex items-center gap-3 px-2 py-2 text-sm rounded-md hover:bg-[#2a2a2a] transition-colors text-left"
                        onClick={() => setTypeFilter(type.value as RelatedItemType)}
                      >
                        <Icon 
                          className="h-4 w-4 flex-shrink-0" 
                          style={{ color: type.color }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-[#e6edf3] font-medium">{type.label}</div>
                        </div>
                        {typeFilter === type.value && (
                          <span className="text-xs text-[#6e7681]">✓</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
            
            <IssueProjectSelector 
              value={projectFilter} 
              onChange={setProjectFilter}
              workspaceId={workspaceId}
            />
          </div>

          {/* Selected Items */}
          {selectedItems.length > 0 && (
            <div className="space-y-2 mb-4 flex-shrink-0">
              <h4 className="text-sm font-medium text-[#e1e7ef]">
                Selected ({selectedItems.length})
              </h4>
              <div className="space-y-1">
                {selectedItems.map((item) => (
                  <SelectedRelationItem
                    key={item.id}
                    item={item}
                    relationType={relationType ?? selectedRelationTypes[item.id] ?? 'child'}
                    canChangeRelationType={relationType === null}
                    onRelationTypeChange={handleRelationTypeChange}
                    onRemove={handleRemoveSelected}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Search Results */}
          <div className="border border-[#1a1a1a] rounded-lg flex-1 min-h-0 overflow-y-auto mb-4">
            {searchQuery.length < 2 ? (
              <div className="p-8 text-center text-[#8b949e]">
                <Search className="h-8 w-8 mx-auto mb-2" />
                <p className="text-sm">Type at least 2 characters to search</p>
              </div>
            ) : isLoading ? (
              <div className="p-8 text-center">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mx-auto"></div>
              </div>
            ) : searchResults.length === 0 ? (
              <div className="p-8 text-center text-[#8b949e]">
                <p className="text-sm">No items found</p>
              </div>
            ) : (
              <div className="space-y-0.5 p-1">
                {searchResults.map((item: RelationItem) => (
                  <SearchRelationItem
                    key={item.id}
                    item={item}
                    isSelected={isSelected(item)}
                    onToggle={handleToggleItem}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#1a1a1a] flex-shrink-0">
            <Button
              variant="outline"
              onClick={handleClose}
              className="border-[#333] text-[#6e7681] hover:bg-[#1a1a1a] hover:text-white h-8 px-3 text-sm"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={selectedItems.length === 0 || isSubmitting}
              className="bg-[#238636] hover:bg-[#2ea043] text-white border-0 h-8 px-3 text-sm font-medium"
            >
              {isSubmitting ? "Adding..." : `Add ${selectedItems.length} item${selectedItems.length !== 1 ? 's' : ''}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
