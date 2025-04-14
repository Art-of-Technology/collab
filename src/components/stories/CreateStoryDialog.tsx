"use client";

import React, { useState, useEffect, useCallback, memo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import axios from "axios";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { boardItemsKeys } from "@/hooks/queries/useBoardItems";
import { extractMentionUserIds } from "@/utils/mentions";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BoardSelect } from "@/components/tasks/selectors/BoardSelect";
import { useBoardColumns } from "@/hooks/queries/useTask";
import { EpicSelect } from "@/components/tasks/selectors/EpicSelect";
import { MarkdownEditor as BaseMarkdownEditor } from "@/components/ui/markdown-editor";

// Form schema
const formSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  status: z.string().default("backlog"),
  priority: z.string().default("medium"),
  points: z.number().int().min(0).optional().nullable(),
  dueDate: z.date().optional().nullable(),
  epicId: z.string().nullable().optional(),
  taskBoardId: z.string().min(1, "Task board is required"),
  workspaceId: z.string().min(1, "Workspace ID is required"),
  columnId: z.string().optional().nullable(),
  color: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;


interface CreateStoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  workspaceId: string;
}

// Wrap in memo
const MarkdownEditor = memo(BaseMarkdownEditor);

export function CreateStoryDialog({
  open,
  onOpenChange,
  onSuccess,
  workspaceId,
}: CreateStoryDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isImprovingDescription, setIsImprovingDescription] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
      status: "backlog",
      priority: "medium",
      points: null,
      dueDate: null,
      epicId: null,
      workspaceId: workspaceId,
      taskBoardId: "",
      columnId: null,
      color: "#3B82F6",
    },
  });

  // Watch the selected board ID
  const selectedBoardId = form.watch('taskBoardId');

  // Fetch columns for the selected board
  const { data: columns = [], isLoading: columnsLoading } = useBoardColumns(selectedBoardId);

  // Effect to set default column
  useEffect(() => {
    const currentColumnId = form.getValues('columnId');
    if (selectedBoardId && columns.length > 0 && !currentColumnId) {
      form.setValue('columnId', columns[0].id);
    } else if (!selectedBoardId && currentColumnId) {
        form.setValue('columnId', null);
    }
  }, [columns, selectedBoardId, form]);
  
  // Clear Epic when Board changes
  useEffect(() => {
      form.setValue('epicId', null);
  }, [selectedBoardId, form]);

  // AI Improve Handler
  const handleAiImproveDescription = useCallback(async (text: string): Promise<string> => {
    if (isImprovingDescription || !text.trim()) return text;
    setIsImprovingDescription(true);
    try {
      const response = await fetch("/api/ai/improve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });
      if (!response.ok) throw new Error("Failed to improve text");
      const data = await response.json();
      return data.message || data.improvedText || text;
    } catch (error) {
      console.error("Error improving text:", error);
      toast({ title: "Error", description: "Failed to improve text", variant: "destructive" });
      return text;
    } finally {
      setIsImprovingDescription(false);
    }
  }, [isImprovingDescription, toast]);

  // Form submission handler
  const onSubmit = async (values: FormValues) => {
    try {
      setIsSubmitting(true);
      
      // Format dates for API
      const payload = {
        ...values,
        dueDate: values.dueDate ? format(values.dueDate, "yyyy-MM-dd") : null,
        epicId: values.epicId === "none" ? null : values.epicId,
      };
      
      // Map the columnId to status for creating story
      if (values.columnId) {
        const selectedColumn = columns.find(column => column.id === values.columnId);
        if (selectedColumn) {
          payload.status = selectedColumn.name.toLowerCase().replace(/\s+/g, '-');
        }
      }
      
      const response = await axios.post("/api/stories", payload);
      const createdStory = response.data;
      
      // Process mentions in the description
      if (createdStory?.id && values.description) {
        const mentionedUserIds = extractMentionUserIds(values.description);
        
        if (mentionedUserIds.length > 0) {
          try {
            await axios.post("/api/mentions", {
              userIds: mentionedUserIds,
              sourceType: "story",
              sourceId: createdStory.id,
              content: `mentioned you in a story: "${values.title.length > 100 ? values.title.substring(0, 97) + '...' : values.title}"`
            });
          } catch (error) {
            console.error("Failed to process mentions:", error);
            // Don't fail the story creation if mentions fail
          }
        }
      }
      
      // Display success message
      toast({
        title: "Success",
        description: "The story has been created with your selected color."
      });
      
      // Invalidate relevant queries to refresh data
      queryClient.invalidateQueries({ queryKey: boardItemsKeys.board(values.taskBoardId) });
      queryClient.invalidateQueries({ queryKey: boardItemsKeys.all });
      queryClient.invalidateQueries({ queryKey: ['stories'] });
      
      // Reset form and close dialog
      form.reset();
      onSuccess();
      
    } catch (error) {
      console.error("Error creating story:", error);
      toast({ title: "Failed to create story", description: "There was an error creating the story. Please try again.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[1200px] w-full">
        <DialogHeader>
          <DialogTitle>Create New Story</DialogTitle>
          <DialogDescription>
            Add a new user story to capture requirements and track implementation.
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
            <div className="md:col-span-2 space-y-4">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter story title" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />                
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <MarkdownEditor 
                        initialValue={field.value || ''}
                        onChange={(markdown) => field.onChange(markdown)}
                        placeholder="Describe the story" 
                        minHeight="150px"
                        onAiImprove={handleAiImproveDescription}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="md:col-span-1 space-y-4">
              <FormField
                control={form.control}
                name="taskBoardId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Board</FormLabel>
                    <FormControl>
                      <BoardSelect
                        boardValue={field.value || ''}
                        onBoardChange={(boardId) => {
                          form.setValue("taskBoardId", boardId);
                          form.setValue("columnId", null);
                          form.setValue("epicId", null);
                        }}
                        disabled={isSubmitting}
                        workspaceId={workspaceId}
                        showColumns={false}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="columnId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status Column</FormLabel>
                    <FormControl>
                      <Select
                        value={field.value || undefined}
                        onValueChange={field.onChange}
                        disabled={isSubmitting || !selectedBoardId || columnsLoading}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={!selectedBoardId ? "Select board first" : "Select status"} />
                        </SelectTrigger>
                        <SelectContent>
                          {columnsLoading && <SelectItem value="loading" disabled>Loading...</SelectItem>}
                          {selectedBoardId && !columnsLoading && columns.length === 0 && <SelectItem value="no-columns" disabled>No columns found</SelectItem>}
                          {columns.map((column) => (
                            <SelectItem key={column.id} value={column.id}>
                              {column.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="epicId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Epic (Optional)</FormLabel>
                    <FormControl>
                      <EpicSelect 
                        value={field.value || undefined}
                        onChange={field.onChange}
                        workspaceId={workspaceId}
                        boardId={selectedBoardId}
                        disabled={isSubmitting || !selectedBoardId}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || undefined}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select priority" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="critical">Critical</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="color"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Color</FormLabel>
                    <FormControl>
                      <div className="flex items-center space-x-2">
                        <div 
                          className="w-6 h-6 rounded-full border" 
                          style={{ backgroundColor: field.value || '#3B82F6' }}
                        />
                        <Input 
                          type="color" 
                          {...field} 
                          className="w-full h-9" 
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter className="md:col-span-3 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Creating..." : "Create Story"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
} 