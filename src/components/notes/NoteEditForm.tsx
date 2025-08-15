"use client";

import { useState, useEffect, useRef } from "react";
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
  const [showEditor, setShowEditor] = useState(true); // Editor hep açık edit'te
  const titleRef = useRef<HTMLHeadingElement>(null);
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

  // Sync title ref with form value
const titleValue = form.watch('title');

useEffect(() => {
  if (titleRef.current) {
    if (titleRef.current.textContent !== titleValue) {
      titleRef.current.textContent = titleValue || '';
    }
  }
}, [titleValue]);

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
    <div className="h-full flex flex-col">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="h-full flex flex-col">
          {/* Top action bar - SAĞ ÜSTTE */}
          <div className="px-6 py-4 border-b flex justify-end items-center">
            <div className="flex space-x-2">
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
          </div>
          
          {/* Top section with options - COMMENTED OUT FOR NOW
          <div className="px-6 py-4 border-b">
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
                        workspaceId={note.workspace?.id}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
          </div>
          */}

          {/* Main editor area - auto expanding */}
          <div className="flex-1 px-6 py-4 overflow-auto">
            {/* Notion-style contenteditable h1 title */}
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem className="mb-4">
                  <FormControl>
                    <div className="relative">
                      <h1
                        ref={titleRef}
                        className="notranslate text-3xl font-bold"
                        spellCheck="true"
                        contentEditable="true"
                        data-content-editable-leaf="true"
                        style={{
                          maxWidth: '100%',
                          width: '100%',
                          whiteSpace: 'break-spaces',
                          wordBreak: 'break-word',
                          paddingTop: '3px',
                          paddingBottom: '0px',
                          paddingInline: '2px',
                          fontSize: '2rem',
                          fontWeight: 'bold',
                          margin: '0px',
                          outline: 'none',
                          border: 'none',
                          minHeight: '2.5rem'
                        }}
                        onInput={(e) => {
                          const text = e.currentTarget.textContent || '';
                          field.onChange(text);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            // Focus on editor
                            setTimeout(() => {
                              const editorElement = document.querySelector('.ProseMirror');
                              if (editorElement) {
                                (editorElement as HTMLElement).focus();
                              }
                            }, 100);
                          }
                        }}
                        suppressContentEditableWarning={true}
                      />
                      {/* Fake placeholder */}
                      {!field.value && (
                        <div
                          className="absolute top-0 left-0 text-3xl font-bold text-gray-500 pointer-events-none"
                          style={{
                            paddingTop: '3px',
                            paddingInline: '2px',
                            fontSize: '2rem'
                          }}
                        >
                          Note Title
                        </div>
                      )}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Editor */}
            <FormField
              control={form.control}
              name="content"
              render={({ field }) => (
                <FormItem className="h-full">
                  <FormControl>
                    <div className="notion-editor-wrapper h-full">
                      <NotionEditor
                        content={field.value}
                        onChange={field.onChange}
                        placeholder='Write, press "/" for commands'
                        minHeight="100%"
                        maxHeight="100%"
                        className="h-full"
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>


        </form>
      </Form>
    </div>
  );
} 