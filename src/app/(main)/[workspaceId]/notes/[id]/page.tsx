"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Edit, Trash2 } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { MarkdownRenderer } from "@/components/ui/markdown-renderer";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NoteEditForm } from "@/components/notes/NoteEditForm";

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
}

export default function NoteDetailPage({ params }: { params: Promise<{ workspaceId: string; id: string }> }) {
  const [note, setNote] = useState<Note | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noteId, setNoteId] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
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

    if (!confirm("Are you sure you want to delete this note?")) {
      return;
    }

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
      <div className="container py-6 space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" disabled>
            <ChevronLeft className="h-4 w-4" />
            Back to Notes
          </Button>
        </div>
        <div className="flex justify-center items-center py-12">
          <div className="text-muted-foreground">Loading note...</div>
        </div>
      </div>
    );
  }

  if (error || !note) {
    return (
      <div className="container py-6 space-y-6">
        <div className="flex items-center gap-2">
          <Link href={`/${workspaceId}/notes`}>
            <Button variant="ghost" size="sm">
              <ChevronLeft className="h-4 w-4" />
              Back to Notes
            </Button>
          </Link>
        </div>
        <div className="flex justify-center items-center py-12">
          <div className="text-muted-foreground">{error || "Note not found"}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-6 space-y-6">
      <div className="flex items-center justify-between">
        <Link href={`/${workspaceId}/notes`}>
          <Button variant="ghost" size="sm">
            <ChevronLeft className="h-4 w-4" />
            Back to Notes
          </Button>
        </Link>
        
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setEditingNote(note)}
          >
            <Edit className="h-4 w-4 mr-2" />
            Edit
          </Button>
          <Button variant="outline" size="sm" onClick={handleDelete}>
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden shadow-lg hover:shadow-xl transition-all duration-300 border-border/40 bg-card/95 backdrop-blur-sm">
        <CardHeader className="flex flex-row items-baseline justify-between pb-2">
          <div className="space-y-1">
            <CardTitle className="text-lg sm:text-2xl font-bold tracking-tight sm:tracking-normal">{note.title}</CardTitle>
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 pt-3 sm:gap-3 text-xs sm:text-sm text-muted-foreground">
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                <span>
                  Created {formatDistanceToNow(new Date(note.createdAt), { addSuffix: true })}
                </span>
                {note.isPublic && (
                  <span className="sm:ml-auto">
                    <Badge variant="secondary" className="bg-green-500/10 text-green-600">
                      Public
                    </Badge>
                  </span>
                )}
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-2 sm:pt-4 pb-4 sm:pb-6 px-3 sm:px-6">
          <div className="flex gap-6">
            {/* Note content */}
            <div className="flex-1 space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Avatar className="h-8 w-8 border border-border/40">
                    <AvatarImage src={note.author.image || undefined} alt={note.author.name || "User"} />
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {note.author.name?.charAt(0) || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <span className="font-medium text-sm sm:text-base tracking-tight sm:tracking-normal">{note.author.name}</span>
                </div>
                
                <h3 className="text-base sm:text-lg font-medium tracking-tight sm:tracking-normal mt-4">Content</h3>
                <div className="mt-2">
                  <MarkdownRenderer 
                    content={note.content}
                  />
                </div>
                
                {note.tags && note.tags.length > 0 && (
                  <div className="mt-4">
                    <h4 className="text-sm font-medium mb-2">Tags</h4>
                    <div className="flex flex-wrap gap-1">
                      {note.tags.map((tag) => (
                        <Badge key={tag.id} variant="secondary" className="text-xs">
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
    </div>
  );
} 