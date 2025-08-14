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
      {/* Note Creation Form - Full Height with integrated header */}
      <NoteCreateForm
        onSuccess={handleSuccess}
        onCancel={handleCancel}
        showBackButton={true}
      />
    </div>
  );
} 