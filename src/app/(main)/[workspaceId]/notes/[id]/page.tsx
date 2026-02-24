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
    <div className="h-full w-full overflow-y-auto">
      <div className="flex flex-col gap-6 p-8 max-w-[1400px] mx-auto">
        {/* Header - matching dashboard/timeline style */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href={`/${resolvedParams.workspaceId}/notes`}>
              <Button
                variant="ghost"
                size="sm"
                className="h-9 w-9 p-0 text-[#75757a] hover:text-[#fafafa] hover:bg-[#1f1f22] rounded-xl"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-medium text-white mb-1">Edit Context</h1>
              <p className="text-sm text-[#75757a]">
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
                className="h-9 px-4 gap-2 rounded-xl text-[#75757a] hover:text-red-400 hover:bg-red-500/10"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="bg-[#171719] border-[#1f1f22] rounded-2xl">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-[#fafafa]">Delete Context</AlertDialogTitle>
                <AlertDialogDescription className="text-[#75757a]">
                  Are you sure you want to delete this context? This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="bg-[#101011] border-[#1f1f22] text-[#9c9ca1] hover:bg-[#1f1f22] hover:text-[#fafafa] rounded-xl">
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-red-500 hover:bg-red-600 text-white rounded-xl"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {/* Note Editor */}
        {currentWorkspace?.id && resolvedParams.id ? (
          <NoteFormEditor
            mode="edit"
            noteId={resolvedParams.id}
            workspaceId={currentWorkspace.id}
            showCancelButton={false}
          />
        ) : (
          <div className="flex justify-center items-center py-20">
            <div className="h-6 w-6 border-2 border-[#1f1f22] border-t-[#75757a] rounded-full animate-spin" />
          </div>
        )}
      </div>
    </div>
  );
}
