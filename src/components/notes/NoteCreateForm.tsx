"use client";

import { useState, useEffect, useRef } from "react";
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
  const titleRef = useRef<HTMLHeadingElement>(null);
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

  // Sync title ref with form value
  useEffect(() => {
    if (titleRef.current) {
      const currentValue = form.watch('title');
      if (titleRef.current.textContent !== currentValue) {
        titleRef.current.textContent = currentValue || '';
      }
    }
  }, [form.watch('title')]);

  // Auto focus on title when component mounts
  useEffect(() => {
    setTimeout(() => {
      if (titleRef.current) {
        titleRef.current.focus();
        // Place cursor at the beginning
        const range = document.createRange();
        const sel = window.getSelection();
        range.setStart(titleRef.current, 0);
        range.collapse(true);
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }, 100);
  }, []);

  // Handle backspace in editor to go back to title
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Backspace' && showEditor) {
        const activeElement = document.activeElement;
        const proseMirror = document.querySelector('.ProseMirror');
        
        // Check if we're in the editor and at the beginning
        if (activeElement === proseMirror || proseMirror?.contains(activeElement)) {
          const selection = window.getSelection();
          const range = selection?.getRangeAt(0);
          
          // If cursor is at very beginning and content is empty
          if (range && range.startOffset === 0 && range.collapsed) {
            const textContent = proseMirror?.textContent || '';
            if (textContent.trim() === '' || textContent === '') {
              e.preventDefault();
              setShowEditor(false);
              // Focus back to title
              setTimeout(() => {
                if (titleRef.current) {
                  titleRef.current.focus();
                  // Place cursor at end of title
                  const titleRange = document.createRange();
                  const sel = window.getSelection();
                  titleRange.selectNodeContents(titleRef.current);
                  titleRange.collapse(false);
                  sel?.removeAllRanges();
                  sel?.addRange(titleRange);
                }
              }, 10);
            }
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showEditor]);

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
          {/* <div className="px-6 py-4 border-b">
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
          </div> */}

          {/* Main editor area - takes full remaining height */}
          <div className="flex-1 px-6 py-4 overflow-hidden">
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
                            setShowEditor(true);
                            // Focus on editor
                            setTimeout(() => {
                              const editorElement = document.querySelector('.ProseMirror');
                              if (editorElement) {
                                (editorElement as HTMLElement).focus();
                              }
                            }, 100);
                          } else if (e.key === 'ArrowDown' && showEditor) {
                            // Arrow down to go to editor only if editor is visible
                            setTimeout(() => {
                              const editorElement = document.querySelector('.ProseMirror');
                              if (editorElement) {
                                (editorElement as HTMLElement).focus();
                                // Place cursor at beginning of editor
                                const range = document.createRange();
                                const sel = window.getSelection();
                                if (editorElement.firstChild) {
                                  range.setStart(editorElement.firstChild, 0);
                                  range.collapse(true);
                                  sel?.removeAllRanges();
                                  sel?.addRange(range);
                                }
                              }
                            }, 10);
                          } else if (e.key === 'Backspace' && field.value === '') {
                            // Allow deleting title when empty
                            e.preventDefault();
                            setShowEditor(false);
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
                          New note
                        </div>
                      )}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            {/* Editor */}
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
                        placeholder='Write, press "/" for commands'
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