"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Plus, Search, X, Tag as TagIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { sortTagsBySearchTerm } from "@/utils/sortUtils";
import { NoteTag } from "@/types/models";

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

  const handleTagAdd = (tagId: string) => {
    onChange([...value, tagId]);
    setSearchTerm("");
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

  // Get unselected tags for dropdown
  const unselectedTags = filteredTags.filter(tag => !value.includes(tag.id));

  const selectedTags = tags.filter(tag => value.includes(tag.id));

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Selected tags - displayed inline */}
      {selectedTags.map((tag) => (
        <button
          key={tag.id}
          type="button"
          onClick={() => handleTagRemove(tag.id)}
          className="group inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium hover:opacity-70 transition-opacity"
          style={{
            backgroundColor: `${tag.color}15`,
            color: tag.color
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tag.color }} />
          <span>{tag.name}</span>
          <X className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
      ))}

      {/* Add tag dropdown - compact */}
      <Popover open={isOpen} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-muted-foreground/70 hover:text-foreground hover:bg-accent/50 transition-colors"
          >
            <Plus className="h-3 w-3" />
            <span>Add tag</span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-64 p-0"
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {/* Search input */}
          <div className="p-2 border-b border-border/30">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/60" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search tags..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-transparent border-0 outline-none pl-7 pr-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60"
              />
            </div>
          </div>

          {/* Tags list */}
          <div className="max-h-48 overflow-y-auto">
            {unselectedTags.length > 0 ? (
              <div className="p-1">
                {unselectedTags.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => handleTagAdd(tag.id)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-accent/50 transition-colors text-left"
                  >
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: tag.color }}
                    />
                    <span className="flex-1 truncate">{tag.name}</span>
                    {tag._count && (
                      <span className="text-[10px] text-muted-foreground/60">
                        {tag._count.notes}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ) : searchTerm && (
              <div className="p-4 text-xs text-muted-foreground/60 text-center">
                No tags found
              </div>
            )}
          </div>

          {/* Create new tag section */}
          <div className="p-2 border-t border-border/30">
            {!showCreateInput ? (
              <button
                type="button"
                onClick={() => setShowCreateInput(true)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-muted-foreground/70 hover:text-foreground hover:bg-accent/50 transition-colors"
              >
                <Plus className="h-3 w-3" />
                <span>Create new tag</span>
              </button>
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
                  className="w-full bg-transparent border border-border/30 rounded px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-primary/50"
                />
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateInput(false);
                      setNewTagName("");
                    }}
                    className="flex-1 px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={createTag}
                    disabled={!newTagName.trim() || isCreatingTag}
                    className="flex-1 px-2 py-1.5 text-xs bg-primary/90 hover:bg-primary text-primary-foreground rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isCreatingTag ? "Creating..." : "Create"}
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