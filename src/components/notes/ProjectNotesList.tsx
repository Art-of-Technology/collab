"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Star, Edit, Trash2, Lock, Users, Bot, MessageSquare, Tag as TagIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { NoteScope, NoteType } from "@prisma/client";
import { NoteTypeChip } from "./NoteTypeSelect";

interface Note {
  id: string;
  title: string;
  content: string;
  scope: NoteScope;
  type: NoteType;
  isFavorite: boolean;
  isAiContext?: boolean;
  createdAt: string;
  updatedAt: string;
  authorId: string;
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
  comments?: {
    id: string;
  }[];
}

interface ProjectNotesListProps {
  projectId: string;
  workspaceSlug: string;
  currentUserId: string;
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

export default function ProjectNotesList({ projectId, workspaceSlug, currentUserId }: ProjectNotesListProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [noteToDelete, setNoteToDelete] = useState<string | null>(null);
  const { toast } = useToast();
  const router = useRouter();

  useEffect(() => {
    fetchNotes();
  }, [projectId]);

  const fetchNotes = async () => {
    try {
      const params = new URLSearchParams({
        projectId,
        scope: NoteScope.PROJECT,
      });

      const response = await fetch(`/api/notes?${params}`);
      if (response.ok) {
        const data = await response.json();
        setNotes(data);
      }
    } catch (error) {
      console.error("Error fetching project notes:", error);
      toast({
        title: "Error",
        description: "Failed to fetch project context",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
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
        description: "Context deleted successfully",
      });

      setNotes(notes.filter((note) => note.id !== noteToDelete));
      setDeleteConfirmOpen(false);
      setNoteToDelete(null);
    } catch (error) {
      console.error("Error deleting note:", error);
      toast({
        title: "Error",
        description: "Failed to delete context. Please try again.",
        variant: "destructive",
      });
    }
  };

  const canEditNote = (note: Note) => {
    return note.authorId === currentUserId;
  };

  if (isLoading) {
    return null; // Suspense fallback handles loading
  }

  if (notes.length === 0) {
    return (
      <div className="text-center py-16 mt-6">
        <FileText className="mx-auto h-10 w-10 text-muted-foreground/40" />
        <h3 className="mt-3 text-base font-medium text-foreground/80">No project context yet</h3>
        <p className="text-sm text-muted-foreground/60 mt-1">
          Create your first project context to get started
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-6">
        {notes.map((note) => (
          <Link key={note.id} href={`/${workspaceSlug}/notes/${note.id}`} className="block">
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
                  {canEditNote(note) && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 hover:bg-transparent group"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          router.push(`/${workspaceSlug}/notes/${note.id}`);
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
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  {/* Note type chip */}
                  <NoteTypeChip type={note.type} className="shrink-0" />
                  {/* AI Context indicator */}
                  {note.isAiContext && (
                    <div title="AI Context note">
                      <Bot className="h-3.5 w-3.5 text-purple-500/80 shrink-0" />
                    </div>
                  )}
                  <h3 className="font-semibold line-clamp-1 text-base text-foreground flex-1 min-w-0">{note.title}</h3>
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

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Context</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this context? This action cannot be undone.
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
    </>
  );
}
