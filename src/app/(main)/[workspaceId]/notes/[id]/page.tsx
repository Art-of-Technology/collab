"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Edit, Trash2, MessageSquare } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { MarkdownRenderer } from "@/components/ui/markdown-renderer";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { NoteEditForm } from "@/components/notes/NoteEditForm";
import { NoteCommentsList } from "@/components/notes/NoteCommentsList";

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
    image: string | null;
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

export default function NoteDetailPage({ params }: { params: Promise<{ workspaceId: string; id: string }> }) {
  const { data: session } = useSession();
  const [note, setNote] = useState<Note | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noteId, setNoteId] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const { toast } = useToast();

  // Resolve params first
  useEffect(() => {
    const resolveParams = async () => {
      const resolvedParams = await params;
      setNoteId(resolvedParams.id);
      setWorkspaceId(resolvedParams.workspaceId);
    };
    resolveParams();
  }, [params]);

  useEffect(() => {
    if (!noteId) return;

    const fetchNote = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/notes/${noteId}`);

        if (!response.ok) {
          throw new Error(`Error: ${response.status}`);
        }

        const data = await response.json();
        setNote(data);
      } catch (err) {
        console.error("Failed to fetch note:", err);
        setError("Failed to load note details. Please try again.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchNote();
  }, [noteId]);

  const handleDelete = async () => {
    if (!note) return;

    try {
      const response = await fetch(`/api/notes/${note.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete note");
      }

      toast({
        title: "Success",
        description: "Note deleted successfully",
      });

      setShowDeleteDialog(false);

      // Redirect back to notes list
      window.location.href = `/${workspaceId}/notes`;
    } catch (error) {
      console.error("Error deleting note:", error);
      toast({
        title: "Error",
        description: "Failed to delete note. Please try again.",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="container py-4 space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" disabled className="h-9 text-sm">
            <ChevronLeft className="h-4 w-4" />
            Back to Notes
          </Button>
        </div>
        <div className="flex justify-center items-center py-16">
          <div className="text-sm text-muted-foreground/60">Loading note...</div>
        </div>
      </div>
    );
  }

  if (error || !note) {
    return (
      <div className="container py-4 space-y-4">
        <div className="flex items-center gap-2">
          <Link href={`/${workspaceId}/notes`}>
            <Button variant="ghost" size="sm" className="h-9 text-sm">
              <ChevronLeft className="h-4 w-4" />
              Back to Notes
            </Button>
          </Link>
        </div>
        <div className="flex justify-center items-center py-16">
          <div className="text-sm text-muted-foreground/60">{error || "Note not found"}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-4 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <Link href={`/${workspaceId}/notes`}>
          <Button variant="ghost" size="sm" className="h-9 px-3 text-sm">
            <ChevronLeft className="h-4 w-4 mr-2" />
            <span>Back to Notes</span>
          </Button>
        </Link>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          {session?.user?.id === note.author.id ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditingNote(note)}
                className="text-sm px-3 h-9"
              >
                <Edit className="h-3.5 w-3.5 mr-2" />
                Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDeleteDialog(true)}
                className="text-sm px-3 h-9 text-destructive hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5 mr-2" />
                Delete
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <Card className="overflow-hidden border border-border/50 bg-card/50 backdrop-blur-sm">
        <CardHeader className="pb-3 px-4 pt-4 border-b border-border/30">
          <div className="space-y-2">
            <h1 className="text-xl font-semibold text-foreground">{note.title}</h1>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground/70">
              <span>
                Created {formatDistanceToNow(new Date(note.createdAt), { addSuffix: true })}
              </span>
              {note.isPublic && (
                <Badge variant="secondary" className="bg-green-500/10 text-green-600 text-xs border-0">
                  Public
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-4 pb-4 px-4 space-y-4">
          <div className="flex gap-6">
            {/* Note content */}
            <div className="flex-1 space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Avatar className="h-7 w-7 border border-border/40">
                    <AvatarImage src={note.author.image || undefined} alt={note.author.name || "User"} />
                    <AvatarFallback className="bg-primary/10 text-primary text-xs">
                      {note.author.name?.charAt(0) || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <span className="font-medium text-sm text-foreground/90">{note.author.name}</span>
                </div>

                <h3 className="text-sm font-medium text-foreground/90 mb-3">Content</h3>
                <div className="text-sm text-foreground/80">
                  <MarkdownRenderer
                    content={note.content}
                  />
                </div>

                {note.tags && note.tags.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-border/30">
                    <h4 className="text-xs font-medium text-foreground/80 mb-2">Tags</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {note.tags.map((tag) => (
                        <Badge
                          key={tag.id}
                          variant="secondary"
                          className="text-xs px-2 py-0.5 font-normal border-0"
                          style={{ backgroundColor: `${tag.color}15`, color: tag.color }}
                        >
                          <div
                            className="w-2 h-2 rounded-full mr-1"
                            style={{ backgroundColor: tag.color }}
                          />
                          {tag.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Comment Section */}
      <div id="note-comments" className="mt-4">
        <Card className="border border-border/50 bg-card/50 backdrop-blur-sm">
          <CardContent className="pt-4 pb-4 px-4">
            <div className="flex items-center gap-2 mb-0 pb-3 border-b border-border/30">
              <MessageSquare className="h-4 w-4 text-muted-foreground/70" />
              <h3 className="text-sm font-medium text-foreground/90">Comments</h3>
            </div>
            <div className="relative -left-2">
              <NoteCommentsList noteId={note.id} />
            </div>
          </CardContent>
        </Card>
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
                // Refresh the note data
                if (noteId) {
                  fetch(`/api/notes/${noteId}`)
                    .then(res => res.json())
                    .then(data => setNote(data))
                    .catch(err => console.error('Error refreshing note:', err));
                }
              }}
              onCancel={() => setEditingNote(null)}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Note</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this note? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
} 