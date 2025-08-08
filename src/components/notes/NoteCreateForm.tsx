"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useParams } from "next/navigation";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { NotionEditor } from "@/components/ui/notion-editor";
import { TagSelect } from "@/components/notes/TagSelect";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

const noteCreateSchema = z.object({
  title: z.string().min(1, "Title is required"),
  content: z.string().min(1, "Content is required"),
  isPublic: z.boolean().default(false),
  isFavorite: z.boolean().default(false),
  workspaceId: z.string().optional().nullable(),
  tagIds: z.array(z.string()).default([]),
});

type NoteCreateFormValues = z.infer<typeof noteCreateSchema>;

interface NoteCreateFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

interface NoteTag {
  id: string;
  name: string;
  color: string;
}

export function NoteCreateForm({ onSuccess, onCancel }: NoteCreateFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [tags, setTags] = useState<NoteTag[]>([]);
  const [showEditor, setShowEditor] = useState(false);
  const { toast } = useToast();
  const { workspaceId } = useParams<{ workspaceId: string }>();
  


  const form = useForm<NoteCreateFormValues>({
    resolver: zodResolver(noteCreateSchema),
    defaultValues: {
      title: "",
      content: "",
      isPublic: false,
      isFavorite: false,
      workspaceId: null,
      tagIds: [],
    },
  });

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
      const requestData = {
        title: values.title,
        content: values.content,
        isPublic: values.isPublic,
        isFavorite: values.isFavorite,
        workspaceId: values.workspaceId,
        tagIds: values.tagIds,
      };

      const response = await fetch("/api/notes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestData),
      });

      if (!response.ok) {
        throw new Error("Failed to create note");
      }

      toast({
        title: "Success",
        description: "Note created successfully",
      });

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
    <div className="h-full flex flex-col">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="h-full flex flex-col">
          {/* Top section with options */}
          <div className="px-6 py-4 border-b">
            {/* Compact options row */}
            <div className="flex items-center gap-6">
              <FormField
                control={form.control}
                name="isPublic"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <FormLabel className="text-sm font-normal">Public Note</FormLabel>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="isFavorite"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <FormLabel className="text-sm font-normal">Favorite</FormLabel>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="tagIds"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                    <FormLabel className="text-sm font-normal whitespace-nowrap">Tags:</FormLabel>
                    <FormControl>
                      <TagSelect
                        value={field.value || []}
                        onChange={field.onChange}
                        workspaceId={workspaceId}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
          </div>

          {/* Main editor area - takes full remaining height */}
          <div className="flex-1 px-6 py-4 overflow-hidden">
            {/* Invisible title input - looks like H1 */}
            {!showEditor && (
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem className="h-full">
                    <FormControl>
                      <input
                        {...field}
                        placeholder="Enter new note"
                        className="w-full bg-transparent border-none outline-none text-3xl font-bold placeholder:text-gray-500 placeholder:font-normal placeholder:opacity-100 p-0 resize-none focus:ring-0 focus:outline-none focus:border-none focus:shadow-none"
                        style={{ 
                          border: 'none',
                          outline: 'none',
                          boxShadow: 'none',
                          background: 'transparent'
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && field.value.trim()) {
                            e.preventDefault();
                            setShowEditor(true);
                            // Focus on editor after a brief delay
                            setTimeout(() => {
                              const editorElement = document.querySelector('.ProseMirror');
                              if (editorElement) {
                                (editorElement as HTMLElement).focus();
                              }
                            }, 100);
                          }
                        }}
                        autoFocus
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            
            {/* Editor - only show after title is entered */}
            {showEditor && (
              <FormField
                control={form.control}
                name="content"
                render={({ field }) => (
                  <FormItem className="h-full">
                    <FormControl>
                      <NotionEditor
                        content={field.value}
                        onChange={field.onChange}
                        placeholder="Type '/' for commands or start writing..."
                        minHeight="100%"
                        maxHeight="100%"
                        className="h-full"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </div>

          {/* Bottom action bar */}
          <div className="px-6 py-4 border-t bg-background/50 flex justify-between items-center">
            <div className="text-sm text-muted-foreground">
              Use markdown formatting or type '/' for commands
            </div>
            <div className="flex space-x-2">
              <Button type="button" variant="outline" onClick={onCancel}>
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
          </div>
        </form>
      </Form>
    </div>
  );
} 