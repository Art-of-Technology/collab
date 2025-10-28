import { useState, useEffect, useRef, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";

const noteFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  content: z.string().min(1, "Content is required"),
  isPublic: z.boolean().default(false),
  isFavorite: z.boolean().default(false),
  workspaceId: z.string().optional().nullable(),
  tagIds: z.array(z.string()).default([]),
});

export type NoteFormValues = z.infer<typeof noteFormSchema>;

interface Note {
  id: string;
  title: string;
  content: string;
  isPublic: boolean;
  isFavorite: boolean;
  tags: {
    id: string;
    name: string;
    color: string;
  }[];
}

interface UseNoteFormOptions {
  noteId?: string;
  workspaceId: string;
  mode: "create" | "edit";
  onSuccess?: (noteId: string) => void;
}

export function useNoteForm({ noteId, workspaceId, mode, onSuccess }: UseNoteFormOptions) {
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingNote, setIsFetchingNote] = useState(mode === "edit" && !!noteId);
  const [note, setNote] = useState<Note | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const { toast } = useToast();
  const router = useRouter();
  const autosaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialLoadRef = useRef(true);
  const createdNoteIdRef = useRef<string | null>(noteId || null);

  const form = useForm<NoteFormValues>({
    resolver: zodResolver(noteFormSchema),
    defaultValues: {
      title: "",
      content: "",
      isPublic: false,
      isFavorite: false,
      workspaceId: workspaceId,
      tagIds: [],
    },
  });

  const fetchNote = useCallback(async () => {
    if (!noteId) return;

    setIsFetchingNote(true);
    setError(null);

    try {
      const response = await fetch(`/api/notes/${noteId}`);
      
      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }
      
      const data = await response.json();
      setNote(data);

      // Update form with fetched note data
      form.reset({
        title: data.title,
        content: data.content,
        isPublic: data.isPublic,
        isFavorite: data.isFavorite,
        workspaceId: workspaceId,
        tagIds: data.tags.map((tag: any) => tag.id),
      });
    } catch (err) {
      console.error("Failed to fetch note:", err);
      setError("Failed to load note details. Please try again.");
      toast({
        title: "Error",
        description: "Failed to load note details",
        variant: "destructive",
      });
    } finally {
      setIsFetchingNote(false);
    }
  }, [noteId, workspaceId, form, toast]);

  // Fetch note data if in edit mode
  useEffect(() => {
    if (mode === "edit" && noteId) {
      fetchNote();
    }
  }, [mode, noteId, fetchNote]);

  // Autosave function
  const autosave = useCallback(async (values: NoteFormValues, silent = true) => {
    setIsSaving(true);

    try {
      // If we're in create mode and haven't created a note yet, create it first
      if (mode === "create" && !createdNoteIdRef.current) {
        const response = await fetch("/api/notes", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(values),
        });

        if (!response.ok) {
          throw new Error("Failed to create note");
        }

        const result = await response.json();
        createdNoteIdRef.current = result.id;
        setLastSaved(new Date());
        
        if (!silent) {
          toast({
            title: "Saved",
            description: "Note created successfully",
          });
        }
        
        // Notify parent component about the new note
        if (onSuccess) {
          onSuccess(result.id);
        }
        return;
      }

      // For edit mode or subsequent saves in create mode, update the note
      const currentNoteId = mode === "edit" ? noteId : createdNoteIdRef.current;
      if (!currentNoteId) return;

      const response = await fetch(`/api/notes/${currentNoteId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        throw new Error("Failed to save note");
      }

      setLastSaved(new Date());
      
      if (!silent) {
        toast({
          title: "Saved",
          description: "Note saved successfully",
        });
      }
    } catch (error) {
      console.error("Autosave error:", error);
      if (!silent) {
        toast({
          title: "Error",
          description: "Failed to save note",
          variant: "destructive",
        });
      }
    } finally {
      setIsSaving(false);
    }
  }, [mode, noteId, toast, onSuccess]);

  // Watch form changes and trigger autosave with debounce
  useEffect(() => {
    const subscription = form.watch((values) => {
      // Skip autosave on initial load
      if (isInitialLoadRef.current) {
        isInitialLoadRef.current = false;
        return;
      }

      // Clear existing timeout
      if (autosaveTimeoutRef.current) {
        clearTimeout(autosaveTimeoutRef.current);
      }

      // Set new timeout for autosave (2 seconds after user stops typing)
      autosaveTimeoutRef.current = setTimeout(() => {
        const formValues = form.getValues();
        // Only autosave if there's content (title or content field has value)
        if (formValues.title?.trim() || formValues.content?.trim()) {
          autosave(formValues as NoteFormValues);
        }
      }, 2000);
    });

    return () => {
      subscription.unsubscribe();
      if (autosaveTimeoutRef.current) {
        clearTimeout(autosaveTimeoutRef.current);
      }
    };
  }, [form, autosave]);

  // Reset isInitialLoadRef when note data is loaded
  useEffect(() => {
    if (note && mode === "edit") {
      isInitialLoadRef.current = true;
    }
  }, [note, mode]);

  const onSubmit = async (values: NoteFormValues) => {
    setIsLoading(true);

    try {
      const url = mode === "create" ? "/api/notes" : `/api/notes/${noteId}`;
      const method = mode === "create" ? "POST" : "PATCH";

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        throw new Error(`Failed to ${mode} note`);
      }

      const result = await response.json();

      toast({
        title: "Success",
        description: `Note ${mode === "create" ? "created" : "updated"} successfully`,
      });

      if (onSuccess) {
        onSuccess(result.id);
      }
    } catch (error) {
      console.error(`Error ${mode}ing note:`, error);
      toast({
        title: "Error",
        description: `Failed to ${mode} note. Please try again.`,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return {
    form,
    note,
    isLoading,
    isFetchingNote,
    isSaving,
    lastSaved,
    error,
    onSubmit,
    refetchNote: fetchNote,
  };
}

