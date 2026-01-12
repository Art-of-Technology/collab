"use client";

import { Button } from "@/components/ui/button";
import { ChevronLeft, FileText, Plus } from "lucide-react";
import Link from "next/link";
import { NoteFormEditor } from "@/components/notes/NoteFormEditor";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useRouter, useSearchParams } from "next/navigation";

export default function NewNotePage({ params }: { params: { workspaceId: string } }) {
    const { currentWorkspace, isLoading: workspaceLoading } = useWorkspace();
    const router = useRouter();
    const searchParams = useSearchParams();
    const projectId = searchParams.get("projectId") || undefined;

    const handleSuccess = (noteId: string) => {
        // Navigate to the newly created note's edit page
        if (currentWorkspace?.slug) {
            router.replace(`/${currentWorkspace.slug}/notes/${noteId}`);
        }
    };

    const handleCancel = () => {
        // Navigate back to notes list
        if (currentWorkspace?.slug) {
            router.push(`/${currentWorkspace.slug}/notes`);
        }
    };

    if (workspaceLoading) {
        return (
            <div className="h-full flex flex-col bg-[#09090b]">
                <div className="flex-1 flex items-center justify-center">
                    <div className="h-6 w-6 border-2 border-[#3f3f46] border-t-transparent rounded-full animate-spin" />
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col bg-[#09090b]">
            {/* Header - matching notes list page */}
            <div className="flex-none border-b border-[#1f1f1f]">
                <div className="flex items-center justify-between px-6 py-4">
                    <div className="flex items-center gap-3">
                        <Link href={`/${currentWorkspace?.slug}/notes`}>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-[#6e7681] hover:text-[#e6edf3] hover:bg-[#1a1a1a]"
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                        </Link>
                        <div className="w-8 h-8 rounded-lg bg-[#1a1a1b] flex items-center justify-center">
                            <Plus className="h-4 w-4 text-[#3b82f6]" />
                        </div>
                        <div>
                            <h1 className="text-sm font-medium text-[#e6edf3]">New Context</h1>
                            <p className="text-xs text-[#6e7681]">
                                Create knowledge for your workspace
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Seamless Editor - no container background */}
            <div className="flex-1 overflow-auto">
                {currentWorkspace?.id ? (
                    <NoteFormEditor
                        mode="create"
                        workspaceId={currentWorkspace.id}
                        projectId={projectId}
                        onSuccess={handleSuccess}
                        onCancel={handleCancel}
                    />
                ) : (
                    <div className="flex justify-center items-center py-12">
                        <div className="h-6 w-6 border-2 border-[#3f3f46] border-t-transparent rounded-full animate-spin" />
                    </div>
                )}
            </div>
        </div>
    );
}
