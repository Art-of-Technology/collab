"use client";

import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NoteFormEditor } from "@/components/notes/NoteFormEditor";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useRouter } from "next/navigation";

export default function NewNotePage({ params }: { params: { workspaceId: string } }) {
    const { currentWorkspace, isLoading: workspaceLoading } = useWorkspace();
    const router = useRouter();

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
            <div className="flex justify-center items-center min-h-screen">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    return (
        <div className="container py-4 sm:py-6 space-y-4 sm:space-y-6">
            <div className="flex items-center gap-2">
                <Link href={`/${currentWorkspace?.slug}/notes`}>
                    <Button variant="ghost" size="sm" className="px-2 sm:px-3">
                        <ChevronLeft className="h-4 w-4 mr-1 sm:mr-2" />
                        <span className="text-xs sm:text-sm">Back to Notes</span>
                    </Button>
                </Link>
            </div>

            <Card className="overflow-hidden shadow-lg border-border/40 bg-card/95 backdrop-blur-sm">
                <CardContent>
                    {currentWorkspace?.id ? (
                        <NoteFormEditor
                            mode="create"
                            workspaceId={currentWorkspace.id}
                            onSuccess={handleSuccess}
                            onCancel={handleCancel}
                        />
                    ) : (
                        <div className="flex justify-center items-center py-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

