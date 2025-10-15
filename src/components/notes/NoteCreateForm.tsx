"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { IssueRichEditor } from "@/components/RichEditor/IssueRichEditor";
import { TagSelect } from "@/components/notes/TagSelect";
import { useToast } from "@/hooks/use-toast";
import { useWorkspace } from "@/hooks/queries/useWorkspace";
import { Loader2, RotateCcw } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const noteCreateSchema = z.object({
  title: z.string().min(1, "Title is required"),
  content: z.string().min(1, "Content is required"),
  isPublic: z.boolean().default(false),
  isFavorite: z.boolean().default(false),
  workspaceId: z.string().optional().nullable(),
  tagIds: z.array(z.string()).default([]),
});

type NoteCreateFormValues = z.infer<typeof noteCreateSchema>;

const NOTE_DRAFT_KEY = "note-create-draft";

interface NoteCreateFormProps {
  onSuccess: () => void;
  onCancel: () => void;
  workspaceId: string;
  onOpenChange?: (open: boolean) => void;
}

interface NoteTag {
  id: string;
  name: string;
  color: string;
}

export function NoteCreateForm({ onSuccess, onCancel, workspaceId, onOpenChange }: NoteCreateFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [tags, setTags] = useState<NoteTag[]>([]);
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const { toast } = useToast();

  const form = useForm<NoteCreateFormValues>({
    resolver: zodResolver(noteCreateSchema),
    defaultValues: {
      title: "",
      content: "",
      isPublic: false,
      isFavorite: false,
      workspaceId: workspaceId,
      tagIds: [],
    },
  });

  // Check for existing draft on mount
  useEffect(() => {
    try {
      const savedDraft = localStorage.getItem(NOTE_DRAFT_KEY);
      if (savedDraft) {
        const draft = JSON.parse(savedDraft);
        setHasDraft(true);
      }
    } catch (error) {
      console.error("Error loading draft:", error);
    }
  }, []);

  // Track form changes and save draft
  useEffect(() => {
    const subscription = form.watch((value) => {
      const hasContent = !!(value.title || value.content);
      setHasUnsavedChanges(hasContent);

      // Save draft to localStorage if there's content
      if (hasContent) {
        try {
          localStorage.setItem(NOTE_DRAFT_KEY, JSON.stringify(value));
        } catch (error) {
          console.error("Error saving draft:", error);
        }
      }
    });
    return () => subscription.unsubscribe();
  }, [form]);

  const clearDraft = () => {
    try {
      localStorage.removeItem(NOTE_DRAFT_KEY);
      setHasDraft(false);
    } catch (error) {
      console.error("Error clearing draft:", error);
    }
  };

  const recoverDraft = () => {
    try {
      const savedDraft = localStorage.getItem(NOTE_DRAFT_KEY);
      if (savedDraft) {
        const draft = JSON.parse(savedDraft);
        form.reset(draft);
        setHasDraft(false);
        toast({
          title: "Draft Recovered",
          description: "Your previous draft has been restored",
        });
      }
    } catch (error) {
      console.error("Error recovering draft:", error);
      toast({
        title: "Error",
        description: "Failed to recover draft",
        variant: "destructive",
      });
    }
  };

  const handleCancel = () => {
    if (hasUnsavedChanges) {
      setShowUnsavedWarning(true);
    } else {
      onCancel();
    }
  };

  const confirmCancel = () => {
    clearDraft();
    setShowUnsavedWarning(false);
    onCancel();
  };

  useEffect(() => {
    fetchTags();
  }, []);

  const fetchTags = async () => {
    try {
      const response = await fetch("/api/notes/tags");
      if (response.ok) {
        const data = await response.json();
        setTags(data);
      }
    } catch (error) {
      console.error("Error fetching tags:", error);
    }
  };

  const onSubmit = async (values: NoteCreateFormValues) => {
    setIsLoading(true);

    try {
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

      toast({
        title: "Success",
        description: "Note created successfully",
      });

      // Clear draft after successful creation
      clearDraft();
      setHasUnsavedChanges(false);
      onSuccess();
    } catch (error) {
      console.error("Error creating note:", error);
      toast({
        title: "Error",
        description: "Failed to create note. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {hasDraft && (
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <RotateCcw className="h-4 w-4 text-blue-500" />
              <span className="text-sm text-blue-500">A draft was found from your previous session</span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={recoverDraft}
              className="border-blue-500/50 text-blue-500 hover:bg-blue-500/10 hover:text-blue-500"
            >
              Recover Draft
            </Button>
          </div>
        )}

        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Title</FormLabel>
              <FormControl>
                <Input placeholder="Enter note title..." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="content"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Content</FormLabel>
              <FormControl>
                <IssueRichEditor
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="Add description..."
                  minHeight="300px"
                  maxHeight="500px"
                  enableSlashCommands={true}
                  enableFloatingMenu={true}
                  enableSubIssueCreation={false}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="isPublic"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <FormLabel className="text-base">Public Note</FormLabel>
                  <div className="text-sm text-muted-foreground">
                    Make this note visible to others
                  </div>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="isFavorite"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <FormLabel className="text-base">Favorite</FormLabel>
                  <div className="text-sm text-muted-foreground">
                    Add to favorites
                  </div>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="tagIds"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tags</FormLabel>
              <FormControl>
                <TagSelect
                  value={field.value || []}
                  onChange={field.onChange}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end space-x-2">
          <Button type="button" variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Note"
            )}
          </Button>
        </div>
      </form>

      {/* Unsaved Changes Warning */}
      <AlertDialog open={showUnsavedWarning} onOpenChange={setShowUnsavedWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Are you sure you want to discard them?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continue Editing</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCancel} className="bg-destructive hover:bg-destructive/90">
              Discard Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Form>
  );
} 