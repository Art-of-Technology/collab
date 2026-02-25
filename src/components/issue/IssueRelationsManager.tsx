"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GitBranch, Plus, Trash2, ChevronDown, ChevronRight, CheckSquare, Circle, GitBranch as GitBranchIcon, Bug, Flag } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCrossWorkspaceRelationSearch } from "./sections/relations/hooks/useCrossWorkspaceRelationSearch";
import type { RelationItem } from "./sections/relations/types/relation";
import type { IssueRelation } from "./NewIssueModal";

interface IssueRelationsManagerProps {
  relations: IssueRelation[];
  onRelationsChange: (relations: IssueRelation[]) => void;
  workspaceId: string;
  projectId?: string;
  currentUserId?: string;
  className?: string;
}

type RelationType = 'parent' | 'child' | 'blocks' | 'blocked_by' | 'relates_to' | 'duplicates' | 'duplicated_by';

const RELATION_TYPES: { value: RelationType; label: string; icon: string }[] = [
  { value: 'child', label: 'Sub-issue', icon: '↳' },
  { value: 'parent', label: 'Parent', icon: '↰' },
  { value: 'blocks', label: 'Blocks', icon: '🚫' },
  { value: 'blocked_by', label: 'Blocked by', icon: '⏸️' },
  { value: 'relates_to', label: 'Related', icon: '🔗' },
  { value: 'duplicates', label: 'Duplicates', icon: '📋' },
  { value: 'duplicated_by', label: 'Duplicated by', icon: '📄' },
];

const ISSUE_TYPE_ICONS = {
  issue: { icon: CheckSquare, color: '#6366f1' },
  story: { icon: Circle, color: '#22c55e' },
  epic: { icon: GitBranchIcon, color: '#a855f7' },
  defect: { icon: Bug, color: '#ef4444' },
  milestone: { icon: Flag, color: '#f59e0b' },
};

export function IssueRelationsManager({
  relations,
  onRelationsChange,
  workspaceId,
  projectId,
  currentUserId,
  className
}: IssueRelationsManagerProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [selectedRelationType, setSelectedRelationType] = useState<RelationType>('child');
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const relationsSummary = useMemo(() => {
    const counts = relations.reduce((acc, relation) => {
      acc[relation.relationType] = (acc[relation.relationType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      total: relations.length,
      children: counts.child || 0,
      parent: counts.parent || 0,
      blocks: counts.blocks || 0,
      blockedBy: counts.blocked_by || 0,
      relatesTo: counts.relates_to || 0,
      duplicates: counts.duplicates || 0,
      duplicatedBy: counts.duplicated_by || 0,
    };
  }, [relations]);

  // Get excluded IDs for search
  const excludeIds = useMemo(() => [
    ...relations.filter(r => r.targetIssue).map(r => r.targetIssue!.id),
  ], [relations]);

  // Cross-workspace search hook
  const { data: searchResults = [], isLoading } = useCrossWorkspaceRelationSearch(
    inputValue,
    {},
    excludeIds,
    inputValue.length >= 2 && showSearchResults
  );

  // Position calculation
  const updateDropdownPosition = useCallback(() => {
    if (inputRef.current && containerRef.current) {
      const inputRect = inputRef.current.getBoundingClientRect();
      const containerRect = containerRef.current.getBoundingClientRect();
      
      setDropdownPosition({
        top: inputRect.bottom + 4,
        left: containerRect.left,
        width: containerRect.width,
      });
    }
  }, []);

  // Auto-focus when starting to add
  useEffect(() => {
    if (isAdding && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isAdding]);

  // Update position when search results show/hide or on scroll/resize
  useEffect(() => {
    if (showSearchResults) {
      updateDropdownPosition();
      
      const handleResize = () => updateDropdownPosition();
      const handleScroll = () => updateDropdownPosition();
      const handleClickOutside = (event: MouseEvent) => {
        if (
          containerRef.current && !containerRef.current.contains(event.target as Node) &&
          dropdownRef.current && !dropdownRef.current.contains(event.target as Node)
        ) {
          setShowSearchResults(false);
        }
      };
      
      window.addEventListener('resize', handleResize);
      window.addEventListener('scroll', handleScroll, true);
      document.addEventListener('mousedown', handleClickOutside);
      
      return () => {
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('scroll', handleScroll, true);
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showSearchResults, updateDropdownPosition]);

  const handleStartAdding = useCallback(() => {
    setIsAdding(true);
    setInputValue("");
    setShowSearchResults(false);
    setSelectedIndex(-1);
  }, []);

  const handleCancelAdding = useCallback(() => {
    setIsAdding(false);
    setInputValue("");
    setShowSearchResults(false);
    setSelectedIndex(-1);
  }, []);

  const handleInputChange = useCallback((value: string) => {
    setInputValue(value);
    const shouldShow = value.length >= 2;
    setShowSearchResults(shouldShow);
    setSelectedIndex(-1);
    
    if (shouldShow) {
      updateDropdownPosition();
    }
  }, [updateDropdownPosition]);

  const handleSelectSearchResult = useCallback((item: RelationItem) => {
    // Add as link relation
    const relation: IssueRelation = {
      id: `link-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      type: 'link',
      relationType: selectedRelationType,
      targetIssue: {
        id: item.id,
        title: item.title,
        issueKey: item.issueKey || `${item.type?.toUpperCase()}-${item.id.slice(-4)}`,
        type: item.type || 'issue',
        status: item.status,
        priority: item.priority,
        assignee: item.assignee ? {
          id: item.assignee.id,
          name: item.assignee.name || 'Unknown',
          avatarUrl: item.assignee.image || undefined,
        } : undefined,
        workspace: item.workspace ? {
          id: item.workspace.id,
          name: item.workspace.name,
          slug: item.workspace.slug,
        } : undefined,
        project: item.project ? {
          id: item.project.id,
          name: item.project.name,
          slug: item.project.slug || 'unknown',
        } : undefined,
      },
    };
    
    onRelationsChange([...relations, relation]);
    
    // Reset form but keep adding mode
    setInputValue("");
    setShowSearchResults(false);
    setSelectedIndex(-1);
    inputRef.current?.focus();
  }, [relations, onRelationsChange, selectedRelationType]);

  const handleCreateNew = useCallback(() => {
    if (!inputValue.trim()) return;

    // Add as create relation
    const relation: IssueRelation = {
      id: `create-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      type: 'create',
      relationType: selectedRelationType,
      title: inputValue.trim(),
      issueType: selectedRelationType === 'child' ? 'SUBTASK' : 'TASK',
      priority: 'MEDIUM',
    };
    
    onRelationsChange([...relations, relation]);
    
    // Reset form but keep adding mode
    setInputValue("");
    setShowSearchResults(false);
    setSelectedIndex(-1);
    inputRef.current?.focus();
  }, [inputValue, relations, onRelationsChange, selectedRelationType]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleCancelAdding();
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && searchResults[selectedIndex]) {
        handleSelectSearchResult(searchResults[selectedIndex]);
      } else if (inputValue.trim()) {
        handleCreateNew();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, searchResults.length - 1));
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, -1));
      return;
    }
  }, [selectedIndex, searchResults, inputValue, handleSelectSearchResult, handleCreateNew, handleCancelAdding]);

  const handleRemoveRelation = useCallback((id: string) => {
    onRelationsChange(relations.filter(r => r.id !== id));
  }, [relations, onRelationsChange]);

  const getRelationTypeLabel = (type: string) => {
    const relationType = RELATION_TYPES.find(r => r.value === type);
    return relationType?.label || type;
  };

  const getRelationTypeIcon = (type: string) => {
    const relationType = RELATION_TYPES.find(r => r.value === type);
    return relationType?.icon || '🔗';
  };

  const getItemIcon = (type: string) => {
    const itemType = ISSUE_TYPE_ICONS[type as keyof typeof ISSUE_TYPE_ICONS];
    if (itemType) {
      const Icon = itemType.icon;
      return <Icon className="h-3.5 w-3.5" style={{ color: itemType.color }} />;
    }
    return <CheckSquare className="h-3.5 w-3.5 text-indigo-500" />;
  };

  return (
    <div className={cn("space-y-3", className)}>
      {/* Show relations if any */}
      {relations.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-collab-50">
            <GitBranch className="h-4 w-4" />
            <span>Relations</span>
            <Badge variant="secondary" className="h-5 px-2 text-[10px] bg-collab-600 text-collab-400 border-0">
              {relationsSummary.total}
            </Badge>
          </div>
          
          {/* Relations list */}
          <div className="space-y-1">
            {relations.map((relation) => (
              <div
                key={relation.id}
                className="flex items-center gap-2 p-2 bg-collab-900 border border-collab-700 rounded group hover:bg-collab-900 transition-colors"
              >
                <span className="text-sm">{getRelationTypeIcon(relation.relationType)}</span>
                <span className="text-xs text-collab-400 uppercase tracking-wide min-w-0">
                  {getRelationTypeLabel(relation.relationType)}
                </span>
                
                <div className="flex flex-col gap-1 flex-1 min-w-0">
                  {relation.type === 'link' && relation.targetIssue ? (
                    <>
                      <div className="flex items-center gap-2">
                        {getItemIcon(relation.targetIssue.type)}
                        <span className="text-xs text-collab-500 font-mono">
                          {relation.targetIssue.issueKey}
                        </span>
                        <span className="text-sm text-collab-50 truncate">
                          {relation.targetIssue.title}
                        </span>
                      </div>
                      {relation.targetIssue.workspace && (
                        <div className="flex items-center gap-2 ml-5">
                          <span className="text-xs text-collab-400">in</span>
                          <span className="text-xs px-1.5 py-0.5 bg-collab-600 text-gray-400 rounded">
                            {relation.targetIssue.workspace.name}
                          </span>
                          {relation.targetIssue.project && (
                            <>
                              <span className="text-xs text-collab-400">•</span>
                              <span className="text-xs text-collab-400">
                                {relation.targetIssue.project.name}
                              </span>
                            </>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-collab-400">New:</span>
                      <span className="text-sm text-collab-50 truncate">
                        {relation.title}
                      </span>
                    </div>
                  )}
                </div>
                
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveRelation(relation.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0 hover:bg-collab-600 text-collab-500 hover:text-red-400"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add relation section */}
      {!isAdding ? (
        <Button
          type="button"
          variant="outline"
          onClick={handleStartAdding}
          className="w-full border-dashed border-collab-600 hover:border-collab-600 hover:bg-collab-800 text-gray-400 hover:text-white h-9"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add relation
        </Button>
      ) : (
        <div ref={containerRef} className="relative">
          {/* Input row */}
          <div className="flex items-center gap-2 p-2 border border-collab-700 rounded bg-collab-900">
            <Select value={selectedRelationType} onValueChange={(value) => setSelectedRelationType(value as RelationType)}>
              <SelectTrigger className="w-32 h-7 text-xs bg-collab-900 border-collab-600 text-collab-50 focus:border-collab-600">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-collab-800 border-collab-600">
                {RELATION_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    <div className="flex items-center gap-2">
                      <span>{type.icon}</span>
                      <span className="text-xs">{type.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Link existing issue or create new..."
              className="flex-1 h-7 text-sm bg-collab-900 border-collab-600 text-collab-50 placeholder-collab-400 focus:border-collab-600"
            />
            
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleCancelAdding}
              className="h-7 px-2 text-collab-500 hover:text-white hover:bg-collab-600"
            >
              ×
            </Button>
          </div>

        </div>
      )}
        
      {/* Search results portal */}
        {showSearchResults && inputValue.length >= 2 && dropdownPosition && typeof window !== 'undefined' && (
          createPortal(
            <div 
              ref={dropdownRef}
              className="fixed border border-collab-700 rounded bg-collab-800 shadow-xl max-h-48 overflow-y-auto"
              style={{
                top: dropdownPosition.top,
                left: dropdownPosition.left,
                width: dropdownPosition.width,
                zIndex: 9999,
                pointerEvents: 'auto',
              }}
            >
              {isLoading ? (
                <div className="p-3 text-center text-collab-400 text-sm">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500 mx-auto mb-2"></div>
                  Searching...
                </div>
              ) : searchResults.length === 0 ? (
                <div className="p-3 space-y-2">
                  <p className="text-collab-400 text-sm">No existing issues found</p>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleCreateNew();
                    }}
                    className="w-full flex items-center gap-2 p-2 text-sm rounded hover:bg-collab-600 transition-colors justify-start text-collab-50 h-auto"
                  >
                    <Plus className="h-3.5 w-3.5 text-green-500" />
                    Create new issue: "{inputValue}"
                  </Button>
                </div>
              ) : (
                <div className="space-y-0">
                  {searchResults.map((item: RelationItem, index: number) => (
                    <Button
                      key={item.id}
                      type="button"
                      variant="ghost"
                      className={cn(
                        "w-full flex items-center gap-2 p-2 text-sm hover:bg-collab-600 transition-colors justify-start h-auto",
                        index === selectedIndex && "bg-collab-600"
                      )}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleSelectSearchResult(item);
                      }}
                    >
                      {getItemIcon(item.type || 'issue')}
                      <div className="flex flex-col gap-1 flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-collab-500 font-mono">
                            {item.issueKey || `${item.type?.toUpperCase()}-${item.id.slice(-4)}`}
                          </span>
                          <span className="text-collab-50 truncate">
                            {item.title}
                          </span>
                        </div>
                        {item.workspace && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-collab-400">in</span>
                            <span className="text-xs px-1.5 py-0.5 bg-collab-600 text-gray-400 rounded">
                              {item.workspace.name}
                            </span>
                            {item.project && (
                              <>
                                <span className="text-xs text-collab-400">•</span>
                                <span className="text-xs text-collab-400">
                                  {item.project.name}
                                </span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </Button>
                  ))}

                  <div className="border-t border-collab-600">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleCreateNew();
                      }}
                      className="w-full flex items-center gap-2 p-2 text-sm hover:bg-collab-600 transition-colors justify-start text-collab-50 h-auto"
                    >
                      <Plus className="h-3.5 w-3.5 text-green-500" />
                      Create new: "{inputValue}"
                    </Button>
                  </div>
                </div>
              )}
            </div>,
            document.body
          )
        )}
    </div>
  );
}
