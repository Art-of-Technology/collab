"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Search, X, ChevronsUpDown, Trash2 } from "lucide-react";
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
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [isCreatingTag, setIsCreatingTag] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  // Keyboard navigation state
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isKeyboardNavigation, setIsKeyboardNavigation] = useState(false);
  
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
        setIsCreateDialogOpen(false);
        toast({
          title: "Success",
          description: "Tag created successfully",
        });
      } else {
        throw new Error("Failed to create tag");
      }
    } catch (error) {
      console.error("Error creating tag:", error);
      toast({
        title: "Error",
        description: "Failed to create tag. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCreatingTag(false);
    }
  };

  const handleTagSelect = (tagId: string) => {
    if (!value.includes(tagId)) {
      onChange([...value, tagId]);
    }
    setSearchTerm("");
    setIsOpen(false);
  };

  const handleTagRemove = (tagId: string) => {
    onChange(value.filter(id => id !== tagId));
  };

  const deleteTag = async (tagId: string) => {
    if (!confirm("Are you sure you want to delete this tag?")) return;

    try {
      const response = await fetch(`/api/notes/tags/${tagId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setTags(prev => prev.filter(tag => tag.id !== tagId));
        // Also remove from selected tags if it was selected
        onChange(value.filter(id => id !== tagId));
        toast({
          title: "Success",
          description: "Tag deleted successfully",
        });
      } else {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete tag");
      }
    } catch (error) {
      console.error("Error deleting tag:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete tag",
        variant: "destructive",
      });
    }
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      // Focus search input when opening
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
      // Reset keyboard navigation state
      setSelectedIndex(-1);
      setIsKeyboardNavigation(false);
    } else {
      setSearchTerm("");
      setSelectedIndex(-1);
      setIsKeyboardNavigation(false);
    }
  };

  // Keyboard navigation handler
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle navigation keys when tag select dialog is open
      if (!['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(e.key)) {
        return;
      }

      // Total items = filteredTags + "Create new tag" button
      const totalItems = filteredTags.length + 1;
      
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          e.stopPropagation();
          setIsKeyboardNavigation(true);
          setSelectedIndex(prev => 
            prev < totalItems - 1 ? prev + 1 : 0
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          e.stopPropagation();
          setIsKeyboardNavigation(true);
          setSelectedIndex(prev => 
            prev > 0 ? prev - 1 : totalItems - 1
          );
          break;
        case 'Enter':
          e.preventDefault();
          e.stopPropagation();
          if (selectedIndex >= 0 && selectedIndex < filteredTags.length) {
            // Select a tag
            const selectedTag = filteredTags[selectedIndex];
            handleTagSelect(selectedTag.id);
          } else if (selectedIndex === filteredTags.length) {
            // Open create dialog
            setIsCreateDialogOpen(true);
          }
          break;
        case 'Escape':
          e.preventDefault();
          e.stopPropagation();
          setIsOpen(false);
          break;
      }
    };

    // Add global event listener with capture phase
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, selectedIndex, tags, searchTerm]); // Use tags and searchTerm instead of filteredTags

  const filteredTags = useMemo(() => {
    return sortTagsBySearchTerm(tags, searchTerm);
  }, [tags, searchTerm]);

  // Auto-scroll to selected item
  useEffect(() => {
    if (selectedIndex >= 0 && isKeyboardNavigation && isOpen) {
      const selectedElement = document.querySelector(`[data-tag-index="${selectedIndex}"]`);
      if (selectedElement) {
        selectedElement.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
        });
      }
    }
  }, [selectedIndex, isKeyboardNavigation, isOpen]);

  const selectedTags = tags.filter(tag => value.includes(tag.id));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <Dialog open={isOpen} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={isOpen}
                className="w-full justify-between"
              >
                Select tags...
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md p-0">
              <div className="p-4 border-b">
                <DialogTitle>Select Tags</DialogTitle>
                <div className="relative mt-2">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    ref={searchInputRef}
                    placeholder="Search tags..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>
              
              <div className="max-h-[300px] overflow-y-auto p-2">
                {filteredTags.map((tag, index) => (
                  <div
                    key={tag.id}
                    data-tag-index={index}
                    className={`relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 ${
                      selectedIndex === index && isKeyboardNavigation 
                        ? 'bg-primary text-primary-foreground' 
                        : 'hover:bg-accent hover:text-accent-foreground'
                    }`}
                    onMouseEnter={() => setIsKeyboardNavigation(false)}
                  >
                    <button
                      onClick={() => handleTagSelect(tag.id)}
                      className="flex items-center gap-2 flex-1 text-left"
                    >
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: tag.color }}
                      />
                      <span className="flex-1">{tag.name}</span>
                      {tag._count && (
                        <span className="text-xs text-muted-foreground">
                          ({tag._count.notes})
                        </span>
                      )}
                    </button>

                    {/* Delete unused tags */}
                    {tag._count?.notes === 0 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteTag(tag.id);
                        }}
                        className="ml-2 p-1.5 text-muted-foreground hover:bg-destructive hover:text-destructive-foreground rounded border border-transparent hover:border-destructive transition-colors"
                        title="Delete unused tag"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                   
                  </div>
                ))}
                
                {filteredTags.length === 0 && searchTerm && (
                  <div className="p-2 text-sm text-muted-foreground text-center">
                    No tags found
                  </div>
                )}
              </div>

              <div className="p-4 border-t">
                <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className={`w-full justify-start ${
                        selectedIndex === filteredTags.length && isKeyboardNavigation
                          ? 'bg-primary text-primary-foreground'
                          : ''
                      }`}
                      data-tag-index={filteredTags.length}
                      onMouseEnter={() => setIsKeyboardNavigation(false)}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Create new tag
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create New Tag</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <label className="text-sm font-medium">Tag Name</label>
                        <div className="mt-2">
                          <Input
                            placeholder="Enter tag name..."
                            value={newTagName}
                            onChange={(e) => setNewTagName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                createTag();
                              }
                            }}
                            autoFocus
                            onFocus={(e) => {
                              // Select all text when focusing
                              e.target.select();
                            }}
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          onClick={() => setIsCreateDialogOpen(false)}
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={createTag}
                          disabled={!newTagName.trim() || isCreatingTag}
                        >
                          {isCreatingTag ? "Creating..." : "Create Tag"}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Selected Tags Display */}
      {selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedTags.map((tag) => (
            <div
              key={tag.id}
              className="inline-flex items-center gap-1 px-2 py-1 bg-secondary rounded-md text-sm"
            >
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: tag.color }}
              />
              {tag.name}
              <button
                type="button"
                onClick={() => handleTagRemove(tag.id)}
                className="ml-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
} 