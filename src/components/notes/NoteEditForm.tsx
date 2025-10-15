"use client";

import { useState, useEffect, useImperativeHandle, forwardRef } from "react";
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
import { Loader2 } from "lucide-react";
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

const noteEditSchema = z.object({
  title: z.string().min(1, "Title is required"),
  content: z.string().min(1, "Content is required"),
  isPublic: z.boolean().default(false),
  isFavorite: z.boolean().default(false),
  tagIds: z.array(z.string()).default([]),
});

type NoteEditFormValues = z.infer<typeof noteEditSchema>;

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

interface NoteEditFormProps {
  note: Note;
  onSuccess: () => void;
  onCancel: () => void;
}

interface NoteTag {
  id: string;
  name: string;
  color: string;
}

export interface NoteEditFormRef {
  requestClose: () => void;
}

export const NoteEditForm = forwardRef<NoteEditFormRef, NoteEditFormProps>(
  ({ note, onSuccess, onCancel }, ref) => {
    const [isLoading, setIsLoading] = useState(false);
    const [tags, setTags] = useState<NoteTag[]>([]);
    const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const { toast } = useToast();

    const form = useForm<NoteEditFormValues>({
      resolver: zodResolver(noteEditSchema),
      defaultValues: {
        title: note.title,
        content: note.content,
        isPublic: note.isPublic,
        isFavorite: note.isFavorite,
        tagIds: note.tags.map((tag) => tag.id),
      },
    });

    // Track form changes
    useEffect(() => {
      const subscription = form.watch((value) => {
        const hasChanged =
          value.title !== note.title ||
          value.content !== note.content ||
          value.isPublic !== note.isPublic ||
          value.isFavorite !== note.isFavorite ||
          JSON.stringify(value.tagIds?.sort()) !== JSON.stringify(note.tags.map((tag) => tag.id).sort());
        setHasUnsavedChanges(hasChanged);
      });
      return () => subscription.unsubscribe();
    }, [form, note]);

    const handleCancel = () => {
      if (hasUnsavedChanges) {
        setShowUnsavedWarning(true);
      } else {
        onCancel();
      }
    };

    const confirmCancel = () => {
      setShowUnsavedWarning(false);
      onCancel();
    };

    // Expose requestClose method to parent via ref
    useImperativeHandle(ref, () => ({
      requestClose: () => {
        if (hasUnsavedChanges) {
          setShowUnsavedWarning(true);
        } else {
          onCancel();
        }
      },
    }));

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

    const onSubmit = async (values: NoteEditFormValues) => {
      setIsLoading(true);

      try {
        const response = await fetch(`/api/notes/${note.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(values),
        });

        if (!response.ok) {
          throw new Error("Failed to update note");
        }

        toast({
          title: "Success",
          description: "Note updated successfully",
        });

        setHasUnsavedChanges(false);
        onSuccess();
      } catch (error) {
        console.error("Error updating note:", error);
        toast({
          title: "Error",
          description: "Failed to update note. Please try again.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    return (
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
                  Updating...
                </>
              ) : (
                "Update Note"
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
  });

NoteEditForm.displayName = "NoteEditForm"; 