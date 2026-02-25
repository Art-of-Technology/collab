"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Plus, Search, X, Tags, Loader2, Check } from "lucide-react";
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
        <div
          key={tag.id}
          role="button"
          tabIndex={0}
          onClick={() => handleTagRemove(tag.id)}
          onKeyDown={(e) => e.key === 'Enter' && handleTagRemove(tag.id)}
          className="group inline-flex justify-center items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium hover:opacity-80 transition-all cursor-pointer h-8"
          style={{
            backgroundColor: `${tag.color}15`,
            color: tag.color,
            border: `1px solid ${tag.color}30`,
          }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: tag.color }}
          />
          <span className="truncate max-w-[100px] text-xs">{tag.name}</span>
          <X className="h-3 w-3 opacity-60 group-hover:opacity-100 transition-opacity" />
        </div>
      ))}

      {/* Add tag dropdown - using Collab design system styling */}
      <Popover modal={true} open={isOpen} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <div
            role="button"
            tabIndex={0}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 rounded-lg text-xs transition-all cursor-pointer select-none h-8",
              "border border-collab-700 hover:border-collab-600 hover:bg-collab-700",
              "text-collab-400 bg-collab-900 outline-none",
              value.length > 0 && "border-collab-600 bg-collab-700"
            )}
          >
            <Tags className="h-3.5 w-3.5 text-collab-500" />
            <span className="text-collab-400 text-xs">Tags</span>
          </div>
        </PopoverTrigger>
        <PopoverContent
          className="w-64 p-0 bg-collab-800 border-collab-700 shadow-xl rounded-xl"
          align="start"
          side="bottom"
          sideOffset={4}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {/* Header with search */}
          <div className="p-3 border-b border-collab-700">
            <div className="text-xs text-collab-400 mb-2 font-medium">
              Select tags
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-collab-500" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search tags..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 h-8 text-xs bg-collab-900 border border-collab-700 rounded-lg focus:border-collab-600 text-collab-50 placeholder:text-collab-500 outline-none transition-colors"
              />
            </div>
          </div>

          {/* Tags list */}
          <div className="max-h-64 overflow-y-auto scrollbar-thin scrollbar-thumb-[#27272b] scrollbar-track-transparent p-1">
            {/* Clear all option */}
            {value.length > 0 && (
              <div
                role="button"
                tabIndex={0}
                className="w-full flex items-center gap-2 px-2 py-2 text-xs rounded-lg hover:bg-collab-700 transition-colors text-left cursor-pointer"
                onClick={() => onChange([])}
                onKeyDown={(e) => e.key === 'Enter' && onChange([])}
              >
                <Tags className="h-3.5 w-3.5 text-collab-500" />
                <span className="text-collab-400 flex-1">Clear all tags</span>
              </div>
            )}

            {/* Tags */}
            {filteredTags.length > 0 ? (
              <div className="space-y-0.5">
                {filteredTags.map((tag) => {
                  const isSelected = value.includes(tag.id);
                  return (
                    <div
                      key={tag.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleTagToggle(tag.id)}
                      onKeyDown={(e) => e.key === 'Enter' && handleTagToggle(tag.id)}
                      className={cn(
                        "w-full flex items-center gap-2 px-2 py-2 text-xs rounded-lg hover:bg-collab-700 transition-colors text-left cursor-pointer",
                        isSelected && "bg-collab-700"
                      )}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: tag.color }}
                      />
                      <span className="text-collab-50 flex-1 truncate">{tag.name}</span>
                      {tag._count && (
                        <span className="text-[10px] text-collab-500">
                          {tag._count.notes}
                        </span>
                      )}
                      {isSelected && (
                        <Check className="h-3.5 w-3.5 text-blue-500" />
                      )}
                    </div>
                  );
                })}
              </div>
            ) : searchTerm ? (
              <div className="px-2 py-4 text-center text-collab-500 text-xs">
                <div className="space-y-3">
                  <p>No tags found for "{searchTerm}"</p>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setNewTagName(searchTerm);
                      setShowCreateInput(true);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        setNewTagName(searchTerm);
                        setShowCreateInput(true);
                      }
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-collab-900 border border-collab-700 rounded-lg hover:bg-collab-700 hover:border-collab-600 text-collab-400 cursor-pointer transition-colors"
                  >
                    <Plus className="h-3 w-3" />
                    Create "{searchTerm}"
                  </div>
                </div>
              </div>
            ) : (
              <div className="px-2 py-4 text-center text-collab-500 text-xs">
                No tags available
              </div>
            )}
          </div>

          {/* Create new tag section */}
          <div className="p-2 border-t border-collab-700">
            {!showCreateInput ? (
              <div
                role="button"
                tabIndex={0}
                onClick={() => setShowCreateInput(true)}
                onKeyDown={(e) => e.key === 'Enter' && setShowCreateInput(true)}
                className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-xs text-collab-500 hover:text-collab-50 hover:bg-collab-700 transition-colors cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Create new tag</span>
              </div>
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
                  className="w-full bg-collab-900 border border-collab-700 rounded-lg px-3 py-2 text-xs text-collab-50 placeholder:text-collab-500 outline-none focus:border-collab-600 transition-colors"
                />
                <div className="flex items-center gap-2">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setShowCreateInput(false);
                      setNewTagName("");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        setShowCreateInput(false);
                        setNewTagName("");
                      }
                    }}
                    className="flex-1 px-3 py-2 text-xs text-collab-500 hover:text-collab-50 hover:bg-collab-700 rounded-lg transition-colors cursor-pointer text-center"
                  >
                    Cancel
                  </div>
                  <button
                    type="button"
                    onClick={createTag}
                    disabled={!newTagName.trim() || isCreatingTag}
                    className="flex-1 px-3 py-2 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 outline-none"
                  >
                    {isCreatingTag ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      "Create"
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
