"use client";

import { use } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Trash2, MessageSquare } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";
import { NoteFormEditor } from "@/components/notes/NoteFormEditor";
import { NoteCommentsList } from "@/components/notes/NoteCommentsList";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/context/WorkspaceContext";

export default function NoteDetailPage({ params }: { params: Promise<{ workspaceId: string; id: string }> }) {
  const resolvedParams = use(params);
  const { toast } = useToast();
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();

  const handleDelete = async () => {
    if (!resolvedParams.id) return;

    if (!confirm("Are you sure you want to delete this note?")) {
      return;
    }

    try {
      const response = await fetch(`/api/notes/${resolvedParams.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete note");
      }

      toast({
        title: "Success",
        description: "Note deleted successfully",
      });

      router.push(`/${resolvedParams.workspaceId}/notes`);
    } catch (error) {
      console.error("Error deleting note:", error);
      toast({
        title: "Error",
        description: "Failed to delete note. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen">
      {/* Sticky top bar - minimal */}
      <div className="sticky top-0 z-10 bg-[#101011]/95 backdrop-blur-sm border-b border-border/30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-12 flex items-center justify-between">
          <Link href={`/${resolvedParams.workspaceId}/notes`}>
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
        {currentWorkspace?.id && resolvedParams.id ? (
          <NoteFormEditor
            mode="edit"
            noteId={resolvedParams.id}
            workspaceId={currentWorkspace.id}
            showCancelButton={false}
          />
        ) : (
          <div className="flex justify-center items-center py-16">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent"></div>
          </div>
        )}

        {/* Comments section */}
        {resolvedParams.id && (
          <div className=" bg-black/40 rounded-sm mt-12 p-8 gap-4 border-t border-border/20">
            <div className="flex items-center gap-2 mb-4">
              <MessageSquare className="h-4 w-4 text-muted-foreground/60" />
              <h3 className="m-0 text-sm font-semibold text-foreground/80">Comments</h3>
            </div>
            <NoteCommentsList noteId={resolvedParams.id} />
          </div>
        )}
      </div>
    </div>
  );
} 