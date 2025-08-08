"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { NoteEditForm } from "@/components/notes/NoteEditForm";

import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Note {
  id: string;
  title: string;
  content: string;
  isPublic: boolean;
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
  workspace?: {
    id: string;
    name: string;
    slug: string;
  };
  tags: {
    id: string;
    name: string;
    color: string;
  }[];
}

export default function EditNotePage() {
  const [note, setNote] = useState<Note | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { workspaceId, id } = useParams<{ workspaceId: string; id: string }>();
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    if (!id) return;

    const fetchNote = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const response = await fetch(`/api/notes/${id}`);
        
        if (!response.ok) {
          throw new Error(`Error: ${response.status}`);
        }
        
        const data = await response.json();
        setNote(data);
      } catch (err) {
        console.error("Failed to fetch note:", err);
        setError("Failed to load note details. Please try again.");
        toast({
          title: "Error",
          description: "Failed to load note. Please try again.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchNote();
  }, [id, toast]);

  const handleSuccess = () => {
    toast({
      title: "Success",
      description: "Note updated successfully",
    });
    router.push(`/${workspaceId}/notes/${id}`);
  };

  const handleCancel = () => {
    router.back();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading note...</p>
        </div>
      </div>
    );
  }

  if (error || !note) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <p className="text-destructive mb-4">{error || "Note not found"}</p>
          <Button onClick={() => router.back()} variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Go Back
          </Button>
        </div>
      </div>
    );
  }

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
          Back to Note
        </Button>
        <h1 className="text-xl font-semibold bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 p-2 rounded-md">Edit Note</h1>
      </div>

      {/* Note Edit Form - Full Height */}
      <div className="flex-1 overflow-hidden">
        <NoteEditForm
          note={note}
          onSuccess={handleSuccess}
          onCancel={handleCancel}
        />
      </div>
    </div>
  );
} 