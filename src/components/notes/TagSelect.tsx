"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Plus, Search, X, Tag, Tags, Loader2, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { sortTagsBySearchTerm } from "@/utils/sortUtils";
import { NoteTag } from "@/types/models";
import { cn } from "@/lib/utils";

interface TagSelectProps {
  value: string[];
  onChange: (value: string[]) => void;
  workspaceId?: string;
}

export function TagSelect({ value, onChange, workspaceId }: TagSelectProps) {
  const [tags, setTags] = useState<NoteTag[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [isCreatingTag, setIsCreatingTag] = useState(false);
  const [showCreateInput, setShowCreateInput] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const createInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const fetchTags = useCallback(async () => {
    try {
      const url = workspaceId
        ? `/api/notes/tags?workspace=${workspaceId}`
        : "/api/notes/tags";
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setTags(data);
      }
    } catch (error) {
      console.error("Error fetching tags:", error);
    }
  }, [workspaceId]);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  const createTag = async () => {
    if (!newTagName.trim()) return;

    // Check if tag with same name already exists
    const existingTag = tags.find(tag =>
      tag.name.toLowerCase() === newTagName.trim().toLowerCase()
    );

    if (existingTag) {
      toast({
        title: "Error",
        description: `A tag with the name "${newTagName.trim()}" already exists.`,
        variant: "destructive",
      });
      return;
    }

    setIsCreatingTag(true);
    try {
      const response = await fetch("/api/notes/tags", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: newTagName.trim(),
          color: "#6366F1", // Default color
          workspaceId,
        }),
      });

      if (response.ok) {
        const newTag = await response.json();
        setTags(prev => [...prev, newTag]);
        onChange([...value, newTag.id]);
        setNewTagName("");
        setShowCreateInput(false);
        toast({
          title: "Success",
          description: "Tag created successfully",
        });
      } else {
        const errorData = await response.json().catch(() => ({ error: "Failed to create tag" }));
        throw new Error(errorData.error || "Failed to create tag");
      }
    } catch (error) {
      console.error("Error creating tag:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create tag. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCreatingTag(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    } else {
      setSearchTerm("");
      setShowCreateInput(false);
      setNewTagName("");
    }
  };

  const handleTagToggle = (tagId: string) => {
    if (value.includes(tagId)) {
      onChange(value.filter(id => id !== tagId));
    } else {
      onChange([...value, tagId]);
    }
  };

  const handleTagRemove = (tagId: string) => {
    onChange(value.filter(id => id !== tagId));
  };

  // Focus create input when shown
  useEffect(() => {
    if (showCreateInput) {
      setTimeout(() => createInputRef.current?.focus(), 100);
    }
  }, [showCreateInput]);

  const filteredTags = useMemo(() => {
    return sortTagsBySearchTerm(tags, searchTerm);
  }, [tags, searchTerm]);

  const selectedTags = tags.filter(tag => value.includes(tag.id));

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Selected tags - displayed inline */}
      {selectedTags.map((tag) => (
        <Button
          key={tag.id}
          variant="ghost"
          type="button"
          onClick={() => handleTagRemove(tag.id)}
          className="group inline-flex justify-center items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium hover:opacity-70 transition-opacity border border-[#2d2d30] h-auto"
          style={{
            backgroundColor: `${tag.color}15`,
            color: tag.color,
            borderColor: `${tag.color}30`,
          }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: tag.color }}
          />
          <span className="truncate max-w-[100px] text-[10px]">{tag.name}</span>
          <X className="h-2.5 w-2.5 opacity-60" />
        </Button>
      ))}

      {/* Add tag dropdown - using GlobalFilterSelector styling */}
      <Popover modal={true} open={isOpen} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            type="button"
            className={cn(
              "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs transition-colors h-auto leading-tight min-h-[20px]",
              "border border-[#2d2d30] hover:border-[#464649] hover:bg-[#1a1a1a]",
              "text-[#cccccc] focus:outline-none bg-[#181818]"
            )}
          >
            <Tags className="h-3 w-3 text-[#6e7681]" />
            <span className="text-[#6e7681] text-xs">Tags</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-64 p-0 bg-[#1c1c1e] border-[#2d2d30] shadow-xl"
          align="start"
          side="bottom"
          sideOffset={4}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {/* Header with search */}
          <div className="p-3 border-b border-[#2d2d30]">
            <div className="text-xs text-[#9ca3af] mb-2 font-medium">
              Select tags
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-[#6e7681]" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search tags..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 h-7 text-xs bg-[#0e0e0e] border border-[#2d2d30] rounded focus:border-[#464649] text-[#cccccc] placeholder:text-[#6e7681] outline-none"
              />
            </div>
          </div>

          {/* Tags list */}
          <div className="max-h-64 overflow-y-auto scrollbar-thin scrollbar-thumb-[#444] scrollbar-track-transparent p-1">
            {/* Clear all option */}
            {value.length > 0 && (
              <Button
                variant="ghost"
                type="button"
                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-[#2a2a2a] transition-colors text-left h-auto justify-start"
                onClick={() => onChange([])}
              >
                <Tags className="h-3.5 w-3.5 text-[#6e7681]" />
                <span className="text-[#9ca3af] flex-1">Clear all tags</span>
              </Button>
            )}

            {/* Tags */}
            {filteredTags.length > 0 ? (
              <div className="space-y-0.5">
                {filteredTags.map((tag) => {
                  const isSelected = value.includes(tag.id);
                  return (
                    <Button
                      key={tag.id}
                      variant="ghost"
                      type="button"
                      onClick={() => handleTagToggle(tag.id)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-[#2a2a2a] transition-colors text-left h-auto justify-start"
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: tag.color }}
                      />
                      <span className="text-[#cccccc] flex-1 truncate">{tag.name}</span>
                      {tag._count && (
                        <span className="text-[10px] text-[#6e7681]">
                          {tag._count.notes}
                        </span>
                      )}
                      {isSelected && (
                        <Check className="h-3 w-3 text-[#6e7681]" />
                      )}
                    </Button>
                  );
                })}
              </div>
            ) : searchTerm ? (
              <div className="px-2 py-4 text-center text-[#6e7681] text-xs">
                <div className="space-y-2">
                  <p>No tags found for "{searchTerm}"</p>
                  <Button
                    variant="ghost"
                    type="button"
                    onClick={() => {
                      setNewTagName(searchTerm);
                      setShowCreateInput(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-2 py-1 text-xs bg-[#0e0e0e] border border-[#2d2d30] rounded hover:bg-[#1a1a1a] text-[#cccccc] h-auto"
                  >
                    <Plus className="h-3 w-3" />
                    Create "{searchTerm}"
                  </Button>
                </div>
              </div>
            ) : (
              <div className="px-2 py-4 text-center text-[#6e7681] text-xs">
                No tags available
              </div>
            )}
          </div>

          {/* Create new tag section */}
          <div className="p-2 border-t border-[#2d2d30]">
            {!showCreateInput ? (
              <Button
                variant="ghost"
                type="button"
                onClick={() => setShowCreateInput(true)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-[#6e7681] hover:text-[#cccccc] hover:bg-[#2a2a2a] transition-colors h-auto justify-start"
              >
                <Plus className="h-3 w-3" />
                <span>Create new tag</span>
              </Button>
            ) : (
              <div className="space-y-2">
                <input
                  ref={createInputRef}
                  type="text"
                  placeholder="Tag name..."
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      createTag();
                    } else if (e.key === 'Escape') {
                      setShowCreateInput(false);
                      setNewTagName("");
                    }
                  }}
                  className="w-full bg-[#0e0e0e] border border-[#2d2d30] rounded px-2 py-1.5 text-xs text-[#cccccc] placeholder:text-[#6e7681] outline-none focus:border-[#464649]"
                />
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="ghost"
                    type="button"
                    onClick={() => {
                      setShowCreateInput(false);
                      setNewTagName("");
                    }}
                    className="flex-1 px-2 py-1.5 text-xs text-[#6e7681] hover:text-[#cccccc] hover:bg-[#2a2a2a] rounded transition-colors h-auto"
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="ghost"
                    type="button"
                    onClick={createTag}
                    disabled={!newTagName.trim() || isCreatingTag}
                    className="flex-1 px-2 py-1.5 text-xs bg-[#3b82f6] hover:bg-[#2563eb] text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1 h-auto"
                  >
                    {isCreatingTag ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      "Create"
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
