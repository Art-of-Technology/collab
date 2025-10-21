/* eslint-disable */
"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useSession } from "next-auth/react";
import { canEditNote } from "@/utils/permissions";
import { redirect, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Plus, Filter, Star, FileText, Tag as TagIcon, Edit, Trash2, Eye, Lock, MessageSquare } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import PageHeader from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { sortNotesBySearchTerm, sortTagsBySearchTerm } from "@/utils/sortUtils";
import Link from "next/link";
import { useWorkspace } from "@/context/WorkspaceContext";
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
  comments?: {
    id: string;
  }[];
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
    .replace(/<p[^>]*>/gi, "")
    .replace(/<\/p>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
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
  const [activeTab, setActiveTab] = useState<"private" | "public" | "all" | "team-notes">("all");
  const [tagSearchTerm, setTagSearchTerm] = useState("");
  const [isTagDropdownOpen, setIsTagDropdownOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [noteToDelete, setNoteToDelete] = useState<string | null>(null);
  const tagSearchInputRef = useRef<HTMLInputElement>(null);
  const tagListRef = useRef<HTMLDivElement>(null);
  const tagDialogContentRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const router = useRouter();
  // Get workspace from context (consistent with other pages)
  const { currentWorkspace, isLoading: workspaceLoading } = useWorkspace();

  // Filter tags based on search term
  const filteredTags = useMemo(() => {
    return sortTagsBySearchTerm(tags, tagSearchTerm);
  }, [tags, tagSearchTerm]);


  useEffect(() => {
    if (status === "unauthenticated") {
      redirect("/login");
    }
  }, [status]);

  useEffect(() => {
    if (session?.user && currentWorkspace?.id) {
      fetchNotes();
      fetchTags();
    }
  }, [session?.user, currentWorkspace?.id, searchQuery, selectedTag, showFavorites, activeTab]);

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
    if (!isTagDropdownOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle navigation keys when tag dropdown is open
      if (!["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(e.key)) {
        return;
      }

      const totalItems = filteredTags.length + 1;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          e.stopPropagation();
          setSelectedIndex((prev) => (prev < totalItems - 1 ? prev + 1 : 0));
          break;
        case "ArrowUp":
          e.preventDefault();
          e.stopPropagation();
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : totalItems - 1));
          break;
        case "Enter":
          e.preventDefault();
          e.stopPropagation();
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
        case "Escape":
          e.preventDefault();
          e.stopPropagation();
          setIsTagDropdownOpen(false);
          break;
      }
    };

    // Add global event listener with capture phase (like other working components)
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [isTagDropdownOpen, selectedIndex, filteredTags]);

  // Auto-scroll to selected item
  useEffect(() => {
    if (selectedIndex >= 0 && tagListRef.current) {
      const container = tagListRef.current;
      const items = container.querySelectorAll("[data-tag-index]");
      const selectedItem = items[selectedIndex] as HTMLElement;

      if (selectedItem) {
        const containerRect = container.getBoundingClientRect();
        const itemRect = selectedItem.getBoundingClientRect();

        // Check if item is above the visible area
        if (itemRect.top < containerRect.top) {
          container.scrollTop -= containerRect.top - itemRect.top + 10;
        }
        // Check if item is below the visible area
        else if (itemRect.bottom > containerRect.bottom) {
          container.scrollTop += itemRect.bottom - containerRect.bottom + 10;
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

      // Handle tab-based filtering
      switch (activeTab) {
        case "private":
          // Private: User's private notes only
          params.append("own", "true");
          params.append("public", "false");
          if (currentWorkspace?.id) {
            params.append("workspace", currentWorkspace.id);
          }
          break;
        case "public":
          // Public: User's public notes only
          params.append("own", "true");
          params.append("public", "true");
          if (currentWorkspace?.id) {
            params.append("workspace", currentWorkspace.id);
          }
          break;
        case "all":
          // All: User's all notes (both private and public)
          params.append("own", "true");
          if (currentWorkspace?.id) {
            params.append("workspace", currentWorkspace.id);
          }
          break;
        case "team-notes":
          // Team Notes: Public notes from others in workspace
          params.append("public", "true");
          params.append("own", "false");
          if (currentWorkspace?.id) {
            params.append("workspace", currentWorkspace.id);
          }
          break;
      }

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
      // Always send workspace parameter for My Notes filtering
      const url = currentWorkspace?.id ? `/api/notes/tags?workspace=${currentWorkspace.id}` : "/api/notes/tags";
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setTags(data);
      }
    } catch (error) {
      console.error("Error fetching tags:", error);
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
        setNotes(notes.map((note) => (note.id === noteId ? updatedNote : note)));
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

  const handleDeleteClick = (noteId: string) => {
    setNoteToDelete(noteId);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!noteToDelete) return;

    try {
      const response = await fetch(`/api/notes/${noteToDelete}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete note");
      }

      toast({
        title: "Success",
        description: "Note deleted successfully",
      });

      // Remove the note from the list
      setNotes(notes.filter((note) => note.id !== noteToDelete));
      setDeleteConfirmOpen(false);
      setNoteToDelete(null);
    } catch (error) {
      console.error("Error deleting note:", error);
      toast({
        title: "Error",
        description: "Failed to delete note. Please try again.",
        variant: "destructive",
      });
    }
  };

  if (status === "loading" || isLoading || workspaceLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#101011]">
      {/* Header */}
      <PageHeader
        icon={FileText}
        title="Notes"
        subtitle="Create and organize your notes with markdown support"
        actions={<Button onClick={() => router.push(`/${currentWorkspace?.slug}/notes/new`)}><Plus className="h-4 w-4" /> New Note</Button>}
      />

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="container mx-auto py-4 px-4 sm:px-6">
          <div className="flex flex-col gap-4">
            {/* Filters and Search */}
            <div className="flex flex-col md:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground/60 h-4 w-4" />
                <Input
                  placeholder="Search notes..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 h-9 bg-card/50 border-border/50 focus:border-primary/50 text-sm"
                />
              </div>

              <div className="flex gap-2">
                <Button
                  variant={showFavorites ? "default" : "outline"}
                  onClick={() => setShowFavorites(!showFavorites)}
                  className="h-9 gap-2 text-sm px-3"
                >
                  <Star className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Favorites</span>
                </Button>

                <Dialog open={isTagDropdownOpen} onOpenChange={setIsTagDropdownOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="h-9 gap-2 text-sm px-3">
                      <Filter className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">{selectedTag ? tags.find((t) => t.id === selectedTag)?.name : "All Tags"}</span>
                    </Button>
                  </DialogTrigger>
                  <DialogContent ref={tagDialogContentRef} className="tag-dialog-content">
                    <div className="p-3 border-b border-border/50">
                      <DialogTitle className="text-base font-semibold mb-2">Select Tag</DialogTitle>
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-muted-foreground/60 h-3.5 w-3.5" />
                        <Input
                          ref={tagSearchInputRef}
                          placeholder="Search tags..."
                          value={tagSearchTerm}
                          onChange={(e) => setTagSearchTerm(e.target.value)}
                          className="pl-8 text-sm h-9 bg-card/50 border-border/50"
                        />
                      </div>
                    </div>
                    <div ref={tagListRef} className="max-h-[280px] overflow-y-auto p-2">
                      <div
                        data-tag-index="0"
                        className={`flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer border text-sm transition-colors ${selectedIndex === 0
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-transparent hover:border-border/50 hover:bg-accent"
                          }`}
                        onClick={() => {
                          setSelectedTag(null);
                          setTagSearchTerm("");
                          setIsTagDropdownOpen(false);
                        }}
                      >
                        <div className="w-2 h-2 rounded-full bg-orange-500" />
                        <span className="font-medium">All Tags</span>
                      </div>
                      {filteredTags.map((tag, index) => (
                        <div
                          key={tag.id}
                          data-tag-index={index + 1}
                          className={`flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer text-sm transition-colors ${selectedIndex === index + 1 ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                            }`}
                          onClick={() => {
                            setSelectedTag(tag.id);
                            setTagSearchTerm("");
                            setIsTagDropdownOpen(false);
                          }}
                        >
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: tag.color }} />
                          <span>{tag.name}</span>
                          <span className="text-xs text-muted-foreground ml-auto">({tag._count.notes})</span>
                        </div>
                      ))}
                      {filteredTags.length === 0 && tagSearchTerm.trim() && (
                        <div className="px-3 py-6 text-sm text-muted-foreground/60 text-center">
                          No tags found matching "{tagSearchTerm}"
                        </div>
                      )}
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            {/* Horizontal Tabs */}
            <div className="flex gap-6 border-b border-border/50 w-full">
              <button
                onClick={() => setActiveTab("all")}
                className={`pb-2.5 px-1 text-sm font-medium border-b-2 transition-all ${activeTab === "all" ? "text-foreground border-primary" : "text-muted-foreground/70 border-transparent hover:text-foreground/80 hover:border-border"
                  }`}
              >
                All
              </button>
              <button
                onClick={() => setActiveTab("private")}
                className={`pb-2.5 px-1 text-sm font-medium border-b-2 transition-all ${activeTab === "private"
                  ? "text-foreground border-primary"
                  : "text-muted-foreground/70 border-transparent hover:text-foreground/80 hover:border-border"
                  }`}
              >
                Private
              </button>
              <button
                onClick={() => setActiveTab("public")}
                className={`pb-2.5 px-1 text-sm font-medium border-b-2 transition-all ${activeTab === "public"
                  ? "text-foreground border-primary"
                  : "text-muted-foreground/70 border-transparent hover:text-foreground/80 hover:border-border"
                  }`}
              >
                Public
              </button>
              <div className="border-l border-border/50 h-5 self-end mb-2.5"></div>
              <button
                onClick={() => setActiveTab("team-notes")}
                className={`pb-2.5 px-1 text-sm font-medium border-b-2 transition-all ${activeTab === "team-notes"
                  ? "text-foreground border-primary"
                  : "text-muted-foreground/70 border-transparent hover:text-foreground/80 hover:border-border"
                  }`}
              >
                Team Notes
              </button>
            </div>

            {/* Notes Grid */}
            {notes.length === 0 ? (
              <div className="text-center py-16">
                <FileText className="mx-auto h-10 w-10 text-muted-foreground/40" />
                <h3 className="mt-3 text-base font-medium text-foreground/80">No notes found</h3>
                <p className="text-sm text-muted-foreground/60 mt-1">
                  {searchQuery || selectedTag || showFavorites
                    ? "Try adjusting your filters"
                    : activeTab === "private" || activeTab === "public" || activeTab === "all"
                      ? "Get started by creating your first note"
                      : "No team notes found"}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {notes.map((note) => (
                  <Link key={note.id} href={`/${currentWorkspace?.slug}/notes/${note.id}`} className="block">
                    <div className="bg-card/50 border border-border/50 rounded-lg p-3 hover:border-primary/50 hover:bg-card/80 transition-all cursor-pointer h-full flex flex-col min-h-[160px]">
                      <div className="flex items-center justify-between mb-2.5">
                        {/* Author mention on the left */}
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-muted-foreground/70">@{note.author.name}</span>
                        </div>

                        {/* Action buttons on the right */}
                        <div className="flex items-center gap-0.5 -mr-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 hover:bg-transparent group"
                            onClick={(e) => {
                              e.preventDefault();
                              toggleFavorite(note.id, note.isFavorite);
                            }}
                          >
                            <Star
                              className={`h-3.5 w-3.5 ${note.isFavorite ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/50 group-hover:text-yellow-400"
                                }`}
                            />
                          </Button>
                          {canEditNote(session, note) && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 hover:bg-transparent group"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  router.push(`/${currentWorkspace?.slug}/notes/${note.id}`);
                                }}
                              >
                                <Edit className="h-3.5 w-3.5 text-muted-foreground/50 group-hover:text-primary" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 hover:bg-transparent group"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleDeleteClick(note.id);
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5 text-muted-foreground/50 group-hover:text-red-500" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between mb-2.5">
                        <div className="flex items-center gap-1.5">
                          {note.isPublic ? (
                            <div title="Public note">
                              <Eye className="h-3.5 w-3.5 text-green-500/80" />
                            </div>
                          ) : (
                            <div title="Private note">
                              <Lock className="h-3.5 w-3.5 text-muted-foreground/50" />
                            </div>
                          )}
                          <h3 className="font-semibold line-clamp-1 text-base text-foreground flex-1">{note.title}</h3>
                        </div>
                      </div>

                      <div className="prose prose-sm max-w-none line-clamp-3 mb-2.5 flex-1">
                        <div className="text-muted-foreground/70 text-xs leading-relaxed">
                          {(() => {
                            const { preview, truncated } = getNotePreview(note.content, 100);
                            return (
                              <>
                                {preview}
                                {truncated && "..."}
                              </>
                            );
                          })()}
                        </div>
                      </div>

                      {note.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-2.5">
                          {note.tags.map((tag) => (
                            <Badge
                              key={tag.id}
                              variant="secondary"
                              className="text-xs px-2 py-0.5 font-normal border-0"
                              style={{ backgroundColor: `${tag.color}15`, color: tag.color }}
                            >
                              <TagIcon className="h-2.5 w-2.5 mr-1" />
                              {tag.name}
                            </Badge>
                          ))}
                        </div>
                      )}

                      <div className="flex flex-row items-center text-xs text-muted-foreground/60 mt-auto pt-1 border-t border-border/30">
                        Updated {new Date(note.updatedAt).toLocaleDateString()}
                        {note.workspace && <span className="ml-1.5">• {note.workspace.name}</span>}

                        <div className="flex items-center gap-1.5 ml-auto shrink-0">
                          {note.comments && note.comments.length > 0 && (
                            <div title={`${note.comments.length} comment${note.comments.length === 1 ? '' : 's'}`} className="flex items-center gap-1">
                              <MessageSquare className="h-3.5 w-3.5 text-blue-400/80" />
                              <span className="text-xs text-muted-foreground/70">{note.comments.length}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Note</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this note? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}