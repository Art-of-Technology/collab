/* eslint-disable */
"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search,
  Plus,
  Filter,
  Star,
  FileText,
  Tag as TagIcon,
  Edit,
  Trash2,
  Eye,
  Lock
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NoteCreateForm } from "@/components/notes/NoteCreateForm";
import { NoteEditForm } from "@/components/notes/NoteEditForm";
import { MarkdownRenderer } from "@/components/ui/markdown-renderer";
import { useToast } from "@/hooks/use-toast";
import { sortNotesBySearchTerm } from "@/utils/sortUtils";
import Link from "next/link";

interface Note {
  id: string;
  title: string;
  content: string;
  isPublic: boolean;
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
  author: {
    id: string;
    name: string;
    image?: string;
  };
  tags: {
    id: string;
    name: string;
    color: string;
  }[];
  workspace?: {
    id: string;
    name: string;
    slug: string;
  };
}

interface NoteTag {
  id: string;
  name: string;
  color: string;
  _count: {
    notes: number;
  };
}

// Utility function to process note content for preview
const getNotePreview = (content: string, maxLength: number = 100) => {
  const processedContent = content
    .replace(/<p[^>]*>/gi, '')
    .replace(/<\/p>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const truncated = processedContent.length > maxLength;
  const preview = processedContent.substring(0, maxLength);

  return { preview, truncated };
};

export default function NotesPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { data: session, status } = useSession();
  const [notes, setNotes] = useState<Note[]>([]);
  const [tags, setTags] = useState<NoteTag[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [showFavorites, setShowFavorites] = useState(false);
  const [visibilityFilter, setVisibilityFilter] = useState<"all" | "public" | "private">("all");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [tagSearchTerm, setTagSearchTerm] = useState("");
  const [isTagDropdownOpen, setIsTagDropdownOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const tagSearchInputRef = useRef<HTMLInputElement>(null);
  const tagListRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Filter tags based on search term
  const filteredTags = useMemo(() => {
    if (!tagSearchTerm.trim()) return tags;

    const searchTerm = tagSearchTerm.toLowerCase();
    const filtered = tags.filter(tag =>
      tag.name.toLowerCase().includes(searchTerm)
    );

    // Sort: tags starting with search term first, then others
    return filtered.sort((a, b) => {
      const aStartsWith = a.name.toLowerCase().startsWith(searchTerm);
      const bStartsWith = b.name.toLowerCase().startsWith(searchTerm);

      if (aStartsWith && !bStartsWith) return -1;
      if (!aStartsWith && bStartsWith) return 1;

      // If both start with or both don't start with, sort alphabetically
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });
  }, [tags, tagSearchTerm]);

  // Resolve params first
  useEffect(() => {
    const resolveParams = async () => {
      const resolvedParams = await params;
      setWorkspaceId(resolvedParams.workspaceId);
    };
    resolveParams();
  }, [params]);

  useEffect(() => {
    if (status === "unauthenticated") {
      redirect("/login");
    }
  }, [status]);

  useEffect(() => {
    if (session?.user) {
      fetchNotes();
      fetchTags();
    }
  }, [session?.user, searchQuery, selectedTag, showFavorites, visibilityFilter]);

  // Focus search input when dialog opens
  useEffect(() => {
    if (isTagDropdownOpen) {
      setTimeout(() => {
        tagSearchInputRef.current?.focus();
      }, 100);
      setSelectedIndex(-1);
    } else {
      setTagSearchTerm("");
      setSelectedIndex(-1);
    }
  }, [isTagDropdownOpen]);

  // Reset selected index when search term changes
  useEffect(() => {
    setSelectedIndex(-1);
  }, [tagSearchTerm]);

  // Add keyboard listener when dialog is open
  useEffect(() => {
    if (isTagDropdownOpen) {
      // Add listener to the dialog content instead of window
      const dialogElement = document.querySelector('[role="dialog"]');
      if (dialogElement) {
        const handleKeyDownElement = (e: Event) => {
          const keyboardEvent = e as KeyboardEvent;
          // Only handle keys when the dialog is focused or when specific keys are pressed
          const isDialogFocused = document.activeElement?.closest('[role="dialog"]');
          if (!isDialogFocused && !['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(keyboardEvent.key)) {
            return;
          }

          const totalItems = filteredTags.length + 1;

          switch (keyboardEvent.key) {
            case 'ArrowDown':
              keyboardEvent.preventDefault();
              setSelectedIndex(prev =>
                prev < totalItems - 1 ? prev + 1 : 0
              );
              break;
            case 'ArrowUp':
              keyboardEvent.preventDefault();
              setSelectedIndex(prev =>
                prev > 0 ? prev - 1 : totalItems - 1
              );
              break;
            case 'Enter':
              keyboardEvent.preventDefault();
              if (selectedIndex === 0) {
                setSelectedTag(null);
                setTagSearchTerm("");
                setIsTagDropdownOpen(false);
              } else if (selectedIndex > 0 && filteredTags[selectedIndex - 1]) {
                const selectedTagItem = filteredTags[selectedIndex - 1];
                setSelectedTag(selectedTagItem.id);
                setTagSearchTerm("");
                setIsTagDropdownOpen(false);
              }
              break;
            case 'Escape':
              keyboardEvent.preventDefault();
              setIsTagDropdownOpen(false);
              break;
          }
        };

        dialogElement.addEventListener('keydown', handleKeyDownElement);
        return () => dialogElement.removeEventListener('keydown', handleKeyDownElement);
      }
    }
  }, [isTagDropdownOpen, selectedIndex, filteredTags]);

  // Auto-scroll to selected item
  useEffect(() => {
    if (selectedIndex >= 0 && tagListRef.current) {
      const container = tagListRef.current;
      const items = container.querySelectorAll('[data-tag-index]');
      const selectedItem = items[selectedIndex] as HTMLElement;

      if (selectedItem) {
        const containerRect = container.getBoundingClientRect();
        const itemRect = selectedItem.getBoundingClientRect();

        // Check if item is above the visible area
        if (itemRect.top < containerRect.top) {
          container.scrollTop -= (containerRect.top - itemRect.top) + 10;
        }
        // Check if item is below the visible area
        else if (itemRect.bottom > containerRect.bottom) {
          container.scrollTop += (itemRect.bottom - containerRect.bottom) + 10;
        }
      }
    }
  }, [selectedIndex]);

  const fetchNotes = async () => {
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.append("search", searchQuery);
      if (selectedTag) params.append("tag", selectedTag);
      if (showFavorites) params.append("favorite", "true");
      if (visibilityFilter === "public") params.append("public", "true");
      if (visibilityFilter === "private") params.append("public", "false");

      const response = await fetch(`/api/notes?${params}`);
      if (response.ok) {
        const data = await response.json();

        // Sort notes: titles starting with search term first, then others
        if (searchQuery.trim()) {
          const sortedNotes = sortNotesBySearchTerm(data, searchQuery) as Note[];
          setNotes(sortedNotes);
        } else {
          setNotes(data);
        }
      }
    } catch (error) {
      console.error("Error fetching notes:", error);
      toast({
        title: "Error",
        description: "Failed to fetch notes",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchTags = async () => {
    try {
      const response = await fetch("/api/notes/tags");
      if (response.ok) {
        const data = await response.json();
        setTags(data);
      }
    } catch (error) {
      console.error("Error fetching tags:", error);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!confirm("Are you sure you want to delete this note?")) return;

    try {
      const response = await fetch(`/api/notes/${noteId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setNotes(notes.filter(note => note.id !== noteId));
        toast({
          title: "Success",
          description: "Note deleted successfully",
        });
      } else {
        throw new Error("Failed to delete note");
      }
    } catch (error) {
      console.error("Error deleting note:", error);
      toast({
        title: "Error",
        description: "Failed to delete note",
        variant: "destructive",
      });
    }
  };

  const toggleFavorite = async (noteId: string, isFavorite: boolean) => {
    try {
      const response = await fetch(`/api/notes/${noteId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ isFavorite: !isFavorite }),
      });

      if (response.ok) {
        const updatedNote = await response.json();
        setNotes(notes.map(note =>
          note.id === noteId ? updatedNote : note
        ));
      }
    } catch (error) {
      console.error("Error toggling favorite:", error);
      toast({
        title: "Error",
        description: "Failed to update note",
        variant: "destructive",
      });
    }
  };

  if (status === "loading" || isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 px-1">
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold mb-2 sm:mb-4 tracking-tight">Notes</h1>
            <p className="text-muted-foreground text-sm sm:text-base">
              Create and organize your notes with markdown support
            </p>
          </div>

          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="w-[100px] sm:w-auto text-sm sm:text-base h-8 sm:h-10 px-1 sm:px-4 gap-0 sm:gap-2 sm:mt-6" style={{ fontSize: '14px' }}>
                <Plus className="h-3 w-3 mr-1 sm:h-4 sm:w-4" />
                <span className="ml-0 sm:ml-0">New Note</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create New Note</DialogTitle>
              </DialogHeader>
              <NoteCreateForm
                onSuccess={() => {
                  setIsCreateOpen(false);
                  fetchNotes();
                  fetchTags();
                }}
                onCancel={() => setIsCreateOpen(false)}
              />
            </DialogContent>
          </Dialog>
        </div>

        {/* Filters and Search */}
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Search notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 text-xs sm:text-sm h-7 sm:h-10"
              style={{ fontSize: '14px' }}
            />
          </div>

          <div className="flex gap-2">
            <Button
              variant={showFavorites ? "default" : "outline"}
              onClick={() => setShowFavorites(!showFavorites)}
              className="text-xs w-[100px] sm:text-sm h-7 sm:h-10"
              style={{ fontSize: '14px' }}
            >
              <Star className="h-4 w-4" />
              Favorites
            </Button>

            <Dialog open={isTagDropdownOpen} onOpenChange={setIsTagDropdownOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="text-xs w-[100px] sm:text-sm h-7 sm:h-10" style={{ fontSize: '14px' }}>
                  <Filter className="h-4 w-4" />
                  {selectedTag ? tags.find(t => t.id === selectedTag)?.name : "All Tags"}
                </Button>
              </DialogTrigger>
              <DialogContent className="tag-dialog-content">
                <div className="p-2 sm:p-4 border-b">
                  <DialogTitle className="text-base sm:text-lg mt-1">Select Tag</DialogTitle>
                  <div className="relative mt-2 mb-1">
                    <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 text-muted-foreground h-3 w-3 sm:h-4 sm:w-4" />
                    <Input
                      ref={tagSearchInputRef}
                      placeholder="Search tags..."
                      value={tagSearchTerm}
                      onChange={(e) => setTagSearchTerm(e.target.value)}
                      className="pl-6 sm:pl-8 text-sm sm:text-base h-8 sm:h-10"
                    />
                  </div>
                </div>
                <div ref={tagListRef} className="max-h-[200px] sm:max-h-[300px] overflow-y-auto p-0 sm:p-2 -mt-1">
                  <div
                    data-tag-index="0"
                    className={`flex items-center gap-1 sm:gap-2 p-1.5 sm:p-2 rounded cursor-pointer border-2 text-sm sm:text-base ${selectedIndex === 0 ? 'bg-[#21C45D] dark:bg-[#21C45D]' : 'border-transparent hover:border-[#21C45D] hover:bg-[#21C45D]/10'
                      }`}
                    onClick={() => {
                      setSelectedTag(null);
                      setTagSearchTerm("");
                      setIsTagDropdownOpen(false);
                    }}
                  >
                    <div className="w-2 h-2 sm:w-3 sm:h-3 rounded-full" style={{ backgroundColor: '#D97706' }} />
                    All Tags
                  </div>
                  {filteredTags.map((tag, index) => (
                    <div
                      key={tag.id}
                      data-tag-index={index + 1}
                      className={`flex items-center gap-1 sm:gap-2 p-1.5 sm:p-2 rounded cursor-pointer text-sm sm:text-base ${selectedIndex === index + 1
                          ? 'bg-[#21C45D]'
                          : 'hover:bg-[#21C45D]/10'
                        }`}
                      onClick={() => {
                        setSelectedTag(tag.id);
                        setTagSearchTerm("");
                        setIsTagDropdownOpen(false);
                      }}
                    >
                      <div
                        className="w-2 h-2 sm:w-3 sm:h-3 rounded-full"
                        style={{ backgroundColor: tag.color }}
                      />
                      {tag.name} ({tag._count.notes})
                    </div>
                  ))}
                  {filteredTags.length === 0 && tagSearchTerm.trim() && (
                    <div className="px-2 py-2 text-sm sm:text-base text-muted-foreground text-center">
                      No tags found matching "{tagSearchTerm}"
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Visibility Filter Tabs */}
        <Tabs value={visibilityFilter} onValueChange={(value) => setVisibilityFilter(value as "all" | "public" | "private")}>
          <TabsList className="grid w-full grid-cols-3 max-w-md">
            <TabsTrigger value="all">All Notes</TabsTrigger>
            <TabsTrigger value="public">Public</TabsTrigger>
            <TabsTrigger value="private">Private</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Notes Grid */}
        {notes.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-medium">No notes found</h3>
            <p className="text-muted-foreground">
              {searchQuery || selectedTag || showFavorites || visibilityFilter !== "all"
                ? "Try adjusting your filters"
                : "Get started by creating your first note"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
            {notes.map((note) => (
              <Link
                key={note.id}
                href={`/${workspaceId}/notes/${note.id}`}
                className="block"
              >
                <div className="bg-card border rounded-lg p-2 sm:p-3 hover:shadow-md transition-shadow cursor-pointer h-full flex flex-col min-h-[160px]">
                  <div className="flex items-start justify-end mb-2 sm:mb-2 sm:pt-0">
                    <div className="flex items-center gap-3 sm:gap-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-3 w-3 sm:h-8 sm:w-8 p-0"
                        onClick={(e) => {
                          e.preventDefault();
                          toggleFavorite(note.id, note.isFavorite);
                        }}
                      >
                        <Star
                          className={`h-1 w-1 sm:h-4 sm:w-4 ${note.isFavorite
                              ? "fill-yellow-400 text-yellow-400"
                              : "text-muted-foreground"
                            }`}
                        />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-3 w-3 sm:h-8 sm:w-8 p-0"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setEditingNote(note);
                        }}
                      >
                        <Edit className="h-1 w-1 sm:h-4 sm:w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-3 w-3 sm:h-8 sm:w-8 p-0"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleDeleteNote(note.id);
                        }}
                      >
                        <Trash2 className="h-1 w-1 sm:h-4 sm:w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mb-2 sm:mb-3">
                    <h3 className="font-semibold line-clamp-1 text-sm sm:text-base flex-1">{note.title}</h3>
                    <div className="flex items-center gap-1 ml-2">
                      {note.isPublic ? (
                        <div title="Public note">
                          <Eye className="h-3 w-3 sm:h-4 sm:w-4 text-green-500" />
                        </div>
                      ) : (
                        <div title="Private note">
                          <Lock className="h-3 w-3 sm:h-4 sm:w-4 text-gray-400" />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="prose prose-sm max-w-none line-clamp-3 mb-2 sm:mb-3 flex-1">
                    <div className="text-muted-foreground text-sm sm:text-sm">
                      {(() => {
                        const { preview, truncated } = getNotePreview(note.content, 100);
                        return (
                          <>
                            {preview}
                            {truncated && '...'}
                          </>
                        );
                      })()}
                    </div>
                  </div>

                  {note.tags.length > 0 && (
                    <div className="flex flex-wrap gap-0.5 sm:gap-1 mb-2 sm:mb-3">
                      {note.tags.map((tag) => (
                        <Badge
                          key={tag.id}
                          variant="secondary"
                          className="text-sm px-1 py-0.5 sm:px-2 sm:py-1"
                          style={{ backgroundColor: `${tag.color}20`, color: tag.color }}
                        >
                          <TagIcon className="h-2 w-2 sm:h-3 sm:w-3 mr-0.5 sm:mr-1" />
                          {tag.name}
                        </Badge>
                      ))}
                    </div>
                  )}

                  <div className="text-sm text-muted-foreground mt-auto">
                    Updated {new Date(note.updatedAt).toLocaleDateString()}
                    {note.workspace && (
                      <span className="ml-2">• {note.workspace.name}</span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Edit Note Dialog */}
      {editingNote && (
        <Dialog open={!!editingNote} onOpenChange={() => setEditingNote(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Note</DialogTitle>
            </DialogHeader>
            <NoteEditForm
              note={editingNote}
              onSuccess={() => {
                setEditingNote(null);
                fetchNotes();
                fetchTags();
              }}
              onCancel={() => setEditingNote(null)}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
} 