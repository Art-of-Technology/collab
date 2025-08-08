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
import { NotionEditor } from "@/components/ui/notion-editor";
import { TagSelect } from "@/components/notes/TagSelect";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

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
  workspace?: {
    id: string;
    name: string;
    slug: string;
  };
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

export function NoteEditForm({ note, onSuccess, onCancel }: NoteEditFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [tags, setTags] = useState<NoteTag[]>([]);
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

  useEffect(() => {
    fetchTags();
  }, []);

  // Reset form values when note changes
  useEffect(() => {
    form.reset({
      title: note.title,
      content: note.content,
      isPublic: note.isPublic,
      isFavorite: note.isFavorite,
      tagIds: note.tags.map((tag) => tag.id),
    });
  }, [note, form]);

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
                <NotionEditor
                  content={field.value}
                  onChange={field.onChange}
                  placeholder="Type '/' for commands or start writing..."
                  minHeight="300px"
                  maxHeight="500px"
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
                  workspaceId={note.workspace?.id}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end space-x-2">
          <Button type="button" variant="outline" onClick={onCancel}>
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
    </Form>
  );
} 