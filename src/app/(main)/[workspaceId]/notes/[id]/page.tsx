"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Trash2, MessageSquare, X } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";
import { NoteFormEditor } from "@/components/notes/NoteFormEditor";
import { NoteCommentsList } from "@/components/notes/NoteCommentsList";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/context/WorkspaceContext";

export default function NoteDetailPage({ params }: { params: Promise<{ workspaceId: string; id: string }> }) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noteId, setNoteId] = useState<string | null>(null);
  const [workspaceSlug, setWorkspaceSlug] = useState<string | null>(null);
  const [noteExists, setNoteExists] = useState(false);
  const { toast } = useToast();
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();

  // Resolve params first
  useEffect(() => {
    const resolveParams = async () => {
      const resolvedParams = await params;
      setNoteId(resolvedParams.id);
      setWorkspaceSlug(resolvedParams.workspaceId);
    };
    resolveParams();
  }, [params]);

  // Check if note exists
  useEffect(() => {
    if (!noteId) return;

    const checkNote = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/notes/${noteId}`);

        if (!response.ok) {
          throw new Error(`Error: ${response.status}`);
        }

        setNoteExists(true);
      } catch (err) {
        console.error("Failed to fetch note:", err);
        setError("Failed to load note details. Please try again.");
      } finally {
        setIsLoading(false);
      }
    };

    checkNote();
  }, [noteId]);

  const handleDelete = async () => {
    if (!noteId) return;

    if (!confirm("Are you sure you want to delete this note?")) {
      return;
    }

    try {
      const response = await fetch(`/api/notes/${noteId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete note");
      }

      toast({
        title: "Success",
        description: "Note deleted successfully",
      });

      router.push(`/${workspaceSlug}/notes`);
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
      <div className="min-h-screen">
        {/* Minimal top bar */}
        <div className="sticky top-0 z-10 bg-[#101011]/95 backdrop-blur-sm border-b border-border/30">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 h-12 flex items-center">
            <Button
              variant="ghost"
              size="sm"
              disabled
              className="h-7 px-2 text-xs text-muted-foreground/50 -ml-2"
            >
              <ChevronLeft className="h-3.5 w-3.5 mr-1" />
              <span>Back</span>
            </Button>
          </div>
        </div>

        {/* Clean loading state */}
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
          <div className="flex flex-col items-center justify-center gap-4">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent"></div>
            <p className="text-sm text-muted-foreground/70">Loading note...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || (!isLoading && !noteExists)) {
    return (
      <div className="min-h-screen">
        <div className="sticky top-0 z-10 bg-[#101011]/95 backdrop-blur-sm border-b border-border/30">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 h-12 flex items-center">
            <Link href={`/${workspaceSlug}/notes`}>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground hover:bg-transparent -ml-2 transition-colors"
              >
                <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                <span>Back</span>
              </Button>
            </Link>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
          <div className="flex flex-col items-center justify-center gap-4 text-center">
            <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
              <X className="h-6 w-6 text-destructive/70" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground/80">
                {error || "Note not found"}
              </p>
              <p className="text-xs text-muted-foreground/60">
                The note you're looking for doesn't exist or you don't have access to it.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Sticky top bar - minimal */}
      <div className="sticky top-0 z-10 bg-[#101011]/95 backdrop-blur-sm border-b border-border/30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-12 flex items-center justify-between">
          <Link href={`/${workspaceSlug}/notes`}>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground hover:bg-transparent -ml-2 transition-colors"
            >
              <ChevronLeft className="h-3.5 w-3.5 mr-1" />
              <span>Back</span>
            </Button>
          </Link>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            <span>Delete</span>
          </Button>
        </div>
      </div>

      {/* Main content - always in edit mode */}
      <div className="max-w-6xl mx-auto px-8 py-4">
        {currentWorkspace?.id && noteId ? (
          <NoteFormEditor
            mode="edit"
            noteId={noteId}
            workspaceId={currentWorkspace.id}
            showCancelButton={false}
          />
        ) : (
          <div className="flex justify-center items-center py-16">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent"></div>
          </div>
        )}

        {/* Comments section */}
        {noteId && (
          <div className=" bg-black/40 rounded-sm mt-12 p-8 gap-4 border-t border-border/20">
            <div className="flex items-center gap-2 mb-4">
              <MessageSquare className="h-4 w-4 text-muted-foreground/60" />
              <h3 className="m-0 text-sm font-semibold text-foreground/80">Comments</h3>
            </div>
            <NoteCommentsList noteId={noteId} />
          </div>
        )}
      </div>
    </div>
  );
} 