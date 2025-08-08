"use client";

import { useRouter } from "next/navigation";
import { useParams } from "next/navigation";
import { NoteCreateForm } from "@/components/notes/NoteCreateForm";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function CreateNotePage() {
  const router = useRouter();
  const params = useParams();
  const workspaceId = params.workspaceId as string;

  const handleSuccess = () => {
    router.push(`/${workspaceId}/notes`);
  };

  const handleCancel = () => {
    router.push(`/${workspaceId}/notes`);
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Header with back button */}
      <div className="px-6 py-4 border-b">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCancel}
          className="flex items-center gap-2 mb-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Notes
        </Button>
      </div>

      {/* Note Creation Form - Full Height */}
      <div className="flex-1 overflow-hidden">
        <NoteCreateForm
          onSuccess={handleSuccess}
          onCancel={handleCancel}
        />
      </div>
    </div>
  );
} 