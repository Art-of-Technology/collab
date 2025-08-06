"use client";

import { useState, useEffect } from "react";
import { BaseRelationModal } from "./BaseRelationModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useRelationsApi } from "@/hooks/useRelationsApi";

export type RelationType = "EPIC" | "STORY" | "MILESTONE" | "PARENT_TASK";
export type TargetType = "TASK" | "EPIC" | "STORY" | "MILESTONE";

interface RelationItem {
  id: string;
  title: string;
  status?: string;
  issueKey?: string;
}

interface UnifiedRelationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (itemIds: string[]) => void;
  relationType: RelationType;
  targetType: TargetType;
  targetId: string;
  targetTitle?: string;
  currentRelations?: string[];
}

const RELATION_CONFIG = {
  EPIC: {
    singular: "Epic",
    plural: "Epics",
    fetchMethod: "fetchEpics",
    searchPlaceholder: "Search epics...",
    noItemsMessage: "No available epics",
    noSearchMessage: "No epics found matching your search"
  },
  STORY: {
    singular: "Story",
    plural: "Stories",
    fetchMethod: "fetchStories",
    searchPlaceholder: "Search stories...",
    noItemsMessage: "No available stories",
    noSearchMessage: "No stories found matching your search"
  },
  MILESTONE: {
    singular: "Milestone",
    plural: "Milestones",
    fetchMethod: "fetchMilestones",
    searchPlaceholder: "Search milestones...",
    noItemsMessage: "No available milestones",
    noSearchMessage: "No milestones found matching your search"
  },
  PARENT_TASK: {
    singular: "Parent Task",
    plural: "Parent Tasks",
    fetchMethod: "fetchTasks",
    searchPlaceholder: "Search tasks...",
    noItemsMessage: "No available tasks",
    noSearchMessage: "No tasks found matching your search"
  }
} as const;

export function UnifiedRelationsModal({
  isOpen,
  onClose,
  onAdd,
  relationType,
  targetType,
  targetId,
  targetTitle,
  currentRelations = []
}: UnifiedRelationsModalProps) {
  const { currentWorkspace } = useWorkspace();
  const relationsApi = useRelationsApi({ workspaceId: currentWorkspace?.id || "" });
  const config = RELATION_CONFIG[relationType];

  const [items, setItems] = useState<RelationItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const fetchItems = async (searchQuery?: string) => {
    if (!currentWorkspace?.id) return;
    
    if (searchQuery) {
      setIsSearching(true);
    } else {
    setIsLoading(true);
    }
    
    try {
      const fetchMethod = config.fetchMethod as keyof typeof relationsApi;
      const fetchFunction = relationsApi[fetchMethod] as (search?: string) => Promise<RelationItem[]>;
      const data = await fetchFunction(searchQuery);
      const filtered = data.filter((i) => !currentRelations.includes(i.id) && i.id !== targetId);
      setItems(filtered);
    } catch (error) {
      console.error("Failed to fetch items:", error);
      setItems([]);
    } finally {
      setIsLoading(false);
      setIsSearching(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchItems();
      setSelectedIds([]);
      setSearchTerm("");
      setShowAll(false);
    }
  }, [isOpen, relationType, targetType, currentWorkspace?.id]);

  // Debounced search effect
  useEffect(() => {
    if (!isOpen) return;
    
    const timeoutId = setTimeout(() => {
      if (searchTerm.trim()) {
        fetchItems(searchTerm.trim());
      } else {
        fetchItems();
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timeoutId);
  }, [searchTerm, isOpen]);

  // Show items based on showAll state
  const displayedItems = showAll ? items : items.slice(0, 10);

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleConfirm = () => {
    if (selectedIds.length === 0) return;
    onAdd(selectedIds);
    onClose();
  };

  const handleShowAll = () => {
    setShowAll(true);
  };

  const handleShowLess = () => {
    setShowAll(false);
  };



  const getStatusBadge = (status?: string) => {
    if (!status) return null;
    const statusColors: Record<string, string> = {
      DONE: "bg-green-500",
      IN_PROGRESS: "bg-blue-500",
      TODO: "bg-gray-500",
      BACKLOG: "bg-gray-500"
    };
    const color = statusColors[status] || "bg-gray-500";
    return <Badge className={`${color} text-white text-xs`}>{status}</Badge>;
  };

  const buttonText =
    selectedIds.length === 0
      ? `Add ${config.singular}`
      : `Add ${selectedIds.length} ${config.plural}`;

  return (
    <BaseRelationModal
      isOpen={isOpen}
      onClose={onClose}
      title={`Add ${config.singular}`}
      confirmText={buttonText}
      onConfirm={selectedIds.length > 0 ? handleConfirm : undefined}
    >
      <div className="space-y-4">
        <Input
          placeholder={config.searchPlaceholder}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="text-sm"
        />
        {(isLoading || isSearching) ? (
          <div className="text-center py-6 text-muted-foreground text-sm min-h-[28rem] max-h-[60vh] flex items-center justify-center">
            {isSearching ? `Searching ${config.plural}...` : `Loading ${config.plural}...`}
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground text-sm min-h-[28rem] max-h-[60vh] flex items-center justify-center">
            {searchTerm ? config.noSearchMessage : config.noItemsMessage}
          </div>
        ) : (
          <ScrollArea className="h-[28rem] min-h-[28rem] max-h-[60vh] rounded-md border">
            <div className="p-2 space-y-1">
              {displayedItems.map((item) => (
                <div
                  key={item.id}
                  className={`flex items-center justify-between p-2 rounded-md border cursor-pointer transition text-sm ${
                    selectedIds.includes(item.id)
                      ? "border-primary bg-primary/10"
                      : "hover:bg-muted/50"
                  }`}
                  onClick={() => toggleSelection(item.id)}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <Badge
                      variant="outline"
                      className="bg-purple-50 text-purple-700 border-purple-200 flex-shrink-0 text-xs"
                    >
                      {item.issueKey || config.singular}
                    </Badge>
                    <span className="truncate text-sm flex-1 min-w-0 max-w-[120px] sm:max-w-[180px] md:max-w-[220px] lg:max-w-none">{item.title}</span>
                  </div>
                  {getStatusBadge(item.status)}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
        
        {/* Show All/Less Button */}
        {items.length > 10 && (
          <div className="flex justify-center pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={showAll ? handleShowLess : handleShowAll}
              className="text-sm"
            >
              {showAll 
                ? `Show Less (${items.length} items)` 
                : `Show All (${items.length} items)`
              }
            </Button>
          </div>
        )}
      </div>
    </BaseRelationModal>
  );
}
