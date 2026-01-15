import { useState, useEffect, useRef, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { NoteType, NoteScope, NoteSharePermission } from "@prisma/client";
import { isSecretNoteType } from "@/lib/note-types";

// Secret variable data structure
interface SecretVariableFormData {
  key: string;
  value: string;
  masked: boolean;
  description?: string;
}

const noteFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  content: z.string().default(""), // Content is optional for secret types
  isFavorite: z.boolean().default(false),
  workspaceId: z.string().optional().nullable(),
  tagIds: z.array(z.string()).default([]),
  // New Knowledge System fields
  type: z.nativeEnum(NoteType).default(NoteType.GENERAL),
  scope: z.nativeEnum(NoteScope).default(NoteScope.PERSONAL),
  projectId: z.string().optional().nullable(),
  isAiContext: z.boolean().default(false),
  aiContextPriority: z.number().default(0),
  category: z.string().optional().nullable(),
  // Secrets Vault fields (Phase 3)
  variables: z.array(z.object({
    key: z.string(),
    value: z.string(),
    masked: z.boolean().default(true),
    description: z.string().optional(),
  })).optional().default([]),
  rawSecretContent: z.string().optional().default(""),
  secretEditorMode: z.enum(["key-value", "raw"]).optional().default("key-value"),
  isRestricted: z.boolean().optional().default(false),
  expiresAt: z.string().optional().nullable(),
}).superRefine((data, ctx) => {
  // For secret types, either variables or rawSecretContent must have content
  if (isSecretNoteType(data.type)) {
    const hasVariables = data.variables && data.variables.some(v => v.key.trim() !== "" || v.value.trim() !== "");
    const hasRawContent = data.rawSecretContent && data.rawSecretContent.trim() !== "";
    if (!hasVariables && !hasRawContent) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one secret variable or raw content is required",
        path: data.secretEditorMode === "raw" ? ["rawSecretContent"] : ["variables"],
      });
    }
    return;
  }
  // For regular types, content is required
  if (data.content.trim() === "") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Content is required",
      path: ["content"],
    });
  }
});

export type NoteFormValues = z.infer<typeof noteFormSchema>;

interface NoteShareUser {
  id: string;
  userId: string;
  permission: NoteSharePermission;
  sharedAt: string;
  user: {
    id: string;
    name: string | null;
    image: string | null;
  };
}

interface Note {
  id: string;
  title: string;
  content: string;
  isFavorite: boolean;
  type: NoteType;
  scope: NoteScope;
  projectId: string | null;
  isAiContext: boolean;
  aiContextPriority: number;
  category: string | null;
  authorId: string;
  tags: {
    id: string;
    name: string;
    color: string;
  }[];
  sharedWith: NoteShareUser[];
  project?: {
    id: string;
    name: string;
    slug: string;
  } | null;
  _permissions?: {
    isOwner: boolean;
    canEdit: boolean;
    canDelete: boolean;
    canShare: boolean;
  };
  // Secrets Vault fields
  isEncrypted?: boolean;
  isRestricted?: boolean;
  expiresAt?: string | null;
  // Versioning fields
  version?: number;
  versioningEnabled?: boolean;
}

interface UseNoteFormOptions {
  noteId?: string;
  workspaceId: string;
  projectId?: string;
  mode: "create" | "edit";
  onSuccess?: (noteId: string) => void;
  defaultType?: NoteType;
  defaultScope?: NoteScope;
}

export type AutosaveStatus = "idle" | "saving" | "saved" | "error";

// Helper to serialize values for comparison
const serializeValues = (values: NoteFormValues) => {
  return JSON.stringify({
    title: values.title,
    content: values.content,
    isFavorite: values.isFavorite,
    type: values.type,
    scope: values.scope,
    projectId: values.projectId,
    isAiContext: values.isAiContext,
    tagIds: values.tagIds,
    // Secrets fields
    variables: values.variables,
    rawSecretContent: values.rawSecretContent,
    secretEditorMode: values.secretEditorMode,
    isRestricted: values.isRestricted,
    expiresAt: values.expiresAt,
  });
};

export function useNoteForm({
  noteId,
  workspaceId,
  projectId,
  mode,
  onSuccess,
  defaultType = NoteType.GENERAL,
  defaultScope = NoteScope.PERSONAL,
}: UseNoteFormOptions) {
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingNote, setIsFetchingNote] = useState(mode === "edit" && !!noteId);
  const [note, setNote] = useState<Note | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>("idle");
  const [showSavedIndicator, setShowSavedIndicator] = useState(false);

  // Track current form values as state for proper debouncing
  const [currentFormValues, setCurrentFormValues] = useState<string>("");
  const [lastSavedValues, setLastSavedValues] = useState<string>("");

  const { toast } = useToast();

  // Refs for tracking
  const latestValuesRef = useRef<NoteFormValues | null>(null);
  const createdNoteIdRef = useRef<string | null>(noteId || null);
  const autosaveErrorToastShownRef = useRef(false);
  const isInitializedRef = useRef(false);
  // Track the version when the edit session started - this is used to consolidate
  // multiple autosaves into a single version instead of creating many versions
  const sessionVersionRef = useRef<number | null>(null);

  const form = useForm<NoteFormValues>({
    resolver: zodResolver(noteFormSchema),
    defaultValues: {
      title: "",
      content: "",
      isFavorite: false,
      workspaceId: workspaceId,
      tagIds: [],
      // Knowledge System defaults
      type: defaultType,
      scope: projectId ? NoteScope.PROJECT : defaultScope,
      projectId: projectId || null,
      isAiContext: false,
      aiContextPriority: 0,
      category: null,
      // Secrets Vault defaults
      variables: [],
      rawSecretContent: "",
      secretEditorMode: "key-value",
      isRestricted: false,
      expiresAt: null,
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

      // Populate secrets from decrypted data if available
      let secretVariables: SecretVariableFormData[] = [];
      let rawSecretContent = "";
      let secretEditorMode: "key-value" | "raw" = "key-value";

      if (isSecretNoteType(data.type) && data.isEncrypted) {
        // Use decrypted variables if available
        if (data.decryptedVariables && Array.isArray(data.decryptedVariables) && data.decryptedVariables.length > 0) {
          secretVariables = data.decryptedVariables.map((v: any) => ({
            key: v.key || "",
            value: v.value || "",
            masked: v.masked !== false, // Default to true
            description: v.description || "",
          }));
        }
        // Use decrypted raw content if available
        if (data.decryptedRawContent && typeof data.decryptedRawContent === "string") {
          rawSecretContent = data.decryptedRawContent;
          // If we have raw content but no variables, default to raw mode
          if (secretVariables.length === 0 && rawSecretContent.trim()) {
            secretEditorMode = "raw";
          }
        }
      }

      const formValues = {
        title: data.title,
        content: data.content,
        isFavorite: data.isFavorite,
        workspaceId: workspaceId,
        tagIds: data.tags.map((tag: any) => tag.id),
        // Knowledge System fields
        type: data.type || NoteType.GENERAL,
        scope: data.scope || NoteScope.PERSONAL,
        projectId: data.projectId || null,
        isAiContext: data.isAiContext || false,
        aiContextPriority: data.aiContextPriority || 0,
        category: data.category || null,
        // Secrets Vault fields - populated from decrypted data
        variables: secretVariables,
        rawSecretContent: rawSecretContent,
        secretEditorMode: secretEditorMode,
        isRestricted: data.isRestricted || false,
        expiresAt: data.expiresAt ? new Date(data.expiresAt).toISOString().split('T')[0] : null,
      };

      // Update form with fetched note data
      form.reset(formValues);

      // Set the last saved values to the fetched data
      const serialized = serializeValues(formValues as NoteFormValues);
      setLastSavedValues(serialized);
      setCurrentFormValues(serialized);
      latestValuesRef.current = formValues as NoteFormValues;
      isInitializedRef.current = true;
      setAutosaveStatus("idle");

      // Store the version when the edit session started
      // This allows us to consolidate multiple autosaves into a single version
      sessionVersionRef.current = data.version || null;
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
    } else if (mode === "create") {
      isInitializedRef.current = true;
    }
  }, [mode, noteId, fetchNote]);

  // Autosave function (direct API call similar to issue detail)
  const autosave = useCallback(async (values: NoteFormValues) => {
    // Don't save if title is empty
    if (!values.title?.trim()) {
      return;
    }

    // For secret types, check variables/rawSecretContent instead of content
    if (isSecretNoteType(values.type)) {
      const hasVariables = values.variables && values.variables.some(v => v.key.trim() !== "" || v.value.trim() !== "");
      const hasRawContent = values.rawSecretContent && values.rawSecretContent.trim() !== "";
      if (!hasVariables && !hasRawContent) {
        return;
      }
    } else {
      // For regular types, content is required
      if (!values.content?.trim()) {
        return;
      }
    }

    setIsSaving(true);
    setAutosaveStatus("saving");

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
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || "Failed to create note");
        }

        const result = await response.json();
        createdNoteIdRef.current = result.id;
        const serialized = serializeValues(values);
        setLastSavedValues(serialized);
        setLastSaved(new Date());
        setAutosaveStatus("saved");
        setShowSavedIndicator(true);
        setTimeout(() => {
          setShowSavedIndicator(false);
          setAutosaveStatus("idle");
        }, 1500);
        autosaveErrorToastShownRef.current = false;

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
        body: JSON.stringify({
          ...values,
          // Pass the session version to consolidate multiple autosaves into a single version
          // This prevents creating many versions during a single editing session
          sessionVersion: sessionVersionRef.current,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to save note");
      }

      const serialized = serializeValues(values);
      setLastSavedValues(serialized);
      setLastSaved(new Date());
      setAutosaveStatus("saved");
      setShowSavedIndicator(true);
      setTimeout(() => {
        setShowSavedIndicator(false);
        setAutosaveStatus("idle");
      }, 1500);
      autosaveErrorToastShownRef.current = false;
    } catch (error: any) {
      console.error("Autosave error:", error);
      setAutosaveStatus("error");

      if (!autosaveErrorToastShownRef.current) {
        toast({
          title: "Autosave failed",
          description: error?.message || "Could not save changes. Will retry when you continue editing.",
          variant: "destructive",
        });
        autosaveErrorToastShownRef.current = true;
      }
    } finally {
      setIsSaving(false);
    }
  }, [mode, noteId, toast, onSuccess]);

  // Watch form changes and update state (single subscription)
  useEffect(() => {
    const subscription = form.watch((values) => {
      const typedValues = values as NoteFormValues;
      latestValuesRef.current = typedValues;

      // Only track changes after initialization
      if (isInitializedRef.current) {
        const serialized = serializeValues(typedValues);
        setCurrentFormValues(serialized);
      }
    });
    return () => subscription.unsubscribe();
  }, [form]);

  // Debounced autosave - proper pattern matching issue detail modal
  useEffect(() => {
    // Skip if not initialized or values haven't changed
    if (!isInitializedRef.current) return;
    if (currentFormValues === lastSavedValues) return;
    if (!latestValuesRef.current) return;

    // Skip autosave for secret note types - require explicit save for security
    if (isSecretNoteType(latestValuesRef.current.type)) {
      return;
    }

    // Set up debounced autosave (800ms after last change)
    const handle = setTimeout(() => {
      if (latestValuesRef.current) {
        autosave(latestValuesRef.current);
      }
    }, 800);

    return () => clearTimeout(handle);
  }, [currentFormValues, lastSavedValues, autosave]);

  // Flush autosave on tab hide or before unload for reliability
  useEffect(() => {
    const flushIfPending = () => {
      if (latestValuesRef.current) {
        // Skip flush for secret note types - require explicit save
        if (isSecretNoteType(latestValuesRef.current.type)) {
          return;
        }
        const serialized = serializeValues(latestValuesRef.current);
        if (serialized !== lastSavedValues) {
          autosave(latestValuesRef.current);
        }
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        flushIfPending();
      }
    };

    const handleBeforeUnload = () => {
      if (latestValuesRef.current) {
        const serialized = serializeValues(latestValuesRef.current);
        if (serialized !== lastSavedValues) {
          const currentNoteId = mode === "edit" ? noteId : createdNoteIdRef.current;
          if (currentNoteId && latestValuesRef.current.title?.trim() && latestValuesRef.current.content?.trim()) {
            const endpoint = `/api/notes/${currentNoteId}`;
            const payload = JSON.stringify(latestValuesRef.current);
            try {
              navigator.sendBeacon(endpoint, new Blob([payload], { type: 'application/json' }));
            } catch (e) {
              // Fallback: synchronous XHR (not recommended but better than losing data)
              const xhr = new XMLHttpRequest();
              xhr.open('PATCH', endpoint, false);
              xhr.setRequestHeader('Content-Type', 'application/json');
              xhr.send(payload);
            }
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [mode, noteId, lastSavedValues, autosave]);

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

  // Manual retry function for error state
  const retryAutosave = useCallback(() => {
    if (latestValuesRef.current) {
      autosaveErrorToastShownRef.current = false;
      autosave(latestValuesRef.current);
    }
  }, [autosave]);

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
    // Autosave status fields
    autosaveStatus,
    showSavedIndicator,
    retryAutosave,
  };
}
