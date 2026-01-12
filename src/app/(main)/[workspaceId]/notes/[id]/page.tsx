"use client";

import { use } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Trash2, FileText } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";
import { NoteFormEditor } from "@/components/notes/NoteFormEditor";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/context/WorkspaceContext";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function NoteDetailPage({ params }: { params: Promise<{ workspaceId: string; id: string }> }) {
  const resolvedParams = use(params);
  const { toast } = useToast();
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();

  const handleDelete = async () => {
    if (!resolvedParams.id) return;

    try {
      const response = await fetch(`/api/notes/${resolvedParams.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete note");
      }

      toast({
        title: "Success",
        description: "Context deleted successfully",
      });

      router.push(`/${resolvedParams.workspaceId}/notes`);
    } catch (error) {
      console.error("Error deleting note:", error);
      toast({
        title: "Error",
        description: "Failed to delete context. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#09090b]">
      {/* Header - matching notes list page */}
      <div className="flex-none border-b border-[#1f1f1f]">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Link href={`/${resolvedParams.workspaceId}/notes`}>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-[#6e7681] hover:text-[#e6edf3] hover:bg-[#1a1a1a]"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div className="w-8 h-8 rounded-lg bg-[#1a1a1b] flex items-center justify-center">
              <FileText className="h-4 w-4 text-[#3b82f6]" />
            </div>
            <div>
              <h1 className="text-sm font-medium text-[#e6edf3]">Edit Context</h1>
              <p className="text-xs text-[#6e7681]">
                Changes are saved automatically
              </p>
            </div>
          </div>

          {/* Delete button */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-3 text-[#6e7681] hover:text-red-400 hover:bg-red-500/10"
              >
                <Trash2 className="h-4 w-4 mr-1.5" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="bg-[#0d0d0e] border-[#27272a]">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-[#fafafa]">Delete Context</AlertDialogTitle>
                <AlertDialogDescription className="text-[#71717a]">
                  Are you sure you want to delete this context? This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="bg-[#18181b] border-[#27272a] text-[#a1a1aa] hover:bg-[#27272a] hover:text-[#fafafa]">
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-red-500 hover:bg-red-600 text-white"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Seamless Editor - no container background */}
      <div className="flex-1 overflow-auto">
        {currentWorkspace?.id && resolvedParams.id ? (
          <NoteFormEditor
            mode="edit"
            noteId={resolvedParams.id}
            workspaceId={currentWorkspace.id}
            showCancelButton={false}
          />
        ) : (
          <div className="flex justify-center items-center py-16">
            <div className="h-6 w-6 border-2 border-[#3f3f46] border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>
    </div>
  );
}
