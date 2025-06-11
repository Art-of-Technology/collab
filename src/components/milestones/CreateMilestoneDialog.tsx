"use client";

import { useState, useEffect, useCallback, memo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import axios from "axios";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { boardItemsKeys } from "@/hooks/queries/useBoardItems";
import { Calendar } from "@/components/ui/calendar";
import { BoardSelect } from "@/components/tasks/selectors/BoardSelect";
import { AssigneeSelect } from "@/components/tasks/selectors/AssigneeSelect";
import { ReporterSelect } from "@/components/tasks/selectors/ReporterSelect";
import { useBoardColumns } from "@/hooks/queries/useTask";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { MarkdownEditor as BaseMarkdownEditor } from "@/components/ui/markdown-editor";
import { extractMentionUserIds } from "@/utils/mentions";
import { StatusSelect } from "../tasks/selectors/StatusSelect";

// Wrap in memo
const MarkdownEditor = memo(BaseMarkdownEditor);

// Form schema
const formSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  status: z.string().default("planned"),
  startDate: z.date().optional().nullable(),
  dueDate: z.date().optional().nullable(),
  color: z.string().optional(),
  assigneeId: z.string().nullable().optional(),
  reporterId: z.string().nullable().optional(),
  workspaceId: z.string().min(1, "Workspace ID is required"),
  taskBoardId: z.string().min(1, "Task board is required"),
  columnId: z.string().optional().nullable(),
});

type FormValues = z.infer<typeof formSchema>;

interface CreateMilestoneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  workspaceId: string;
  taskBoards?: { id: string; name: string }[];
  boardId?: string;
}

export function CreateMilestoneDialog({
  open,
  onOpenChange,
  onSuccess,
  workspaceId,
  taskBoards = [],
  boardId,
}: CreateMilestoneDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [boards, setBoards] = useState<{ id: string; name: string }[]>(taskBoards);
  const [isImprovingDescription, setIsImprovingDescription] = useState(false);
  const [selectedColumnId, setSelectedColumnId] = useState<string | undefined>(undefined);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Fetch task boards if not provided
  useEffect(() => {
    const fetchBoards = async () => {
      if (taskBoards.length === 0 && workspaceId) {
        try {
          setBoards([]); // Clear boards while loading
          const response = await axios.get(`/api/workspaces/${workspaceId}/boards`);
          setBoards(response.data);
        } catch (error) {
          console.error("Error fetching task boards:", error);
          toast({
            title: "Error",
            description: "Failed to load boards",
            variant: "destructive"
          });
        }
      }
    };

    fetchBoards();
  }, [workspaceId, taskBoards, toast]);
  
  // Form initialization
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
      status: "planned",
      startDate: null,
      dueDate: null,
      color: "#6366F1", // Default indigo color
      assigneeId: null,
      reporterId: null,
      workspaceId: workspaceId,
      taskBoardId: boardId || (boards.length > 0 ? boards[0].id : ""),
      columnId: null,
    },
  });
  
  // Get the selected board ID from the form
  const selectedBoardId = form.watch('taskBoardId');
  
  // Get columns for the selected board
  const { data: columns = [] } = useBoardColumns(selectedBoardId);

  // Update columnId when columns are loaded
  useEffect(() => {
    const currentColumnStatus = form.getValues('columnId');
    if (columns.length > 0 && !currentColumnStatus) {
      form.setValue('columnId', columns[0].name);
      setSelectedColumnId(columns[0].id);
    }
  }, [columns, form]);

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
      toast({
        title: "Error",
        description: "Failed to improve text",
        variant: "destructive"
      });
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
        startDate: values.startDate ? format(values.startDate, "yyyy-MM-dd") : null,
        dueDate: values.dueDate ? format(values.dueDate, "yyyy-MM-dd") : null,
        assigneeId: values.assigneeId === "unassigned" ? null : values.assigneeId,
        reporterId: values.reporterId === "none" ? null : values.reporterId,
      };
      
      // Set the status and columnId for creating milestone
      payload.status = values.columnId || 'planned'; // This now contains the status name
      payload.columnId = selectedColumnId;
      
      const response = await axios.post("/api/milestones", payload);
      const createdMilestone = response.data;
      
      // Process mentions in the description
      if (createdMilestone?.id && values.description) {
        const mentionedUserIds = extractMentionUserIds(values.description);
        
        if (mentionedUserIds.length > 0) {
          try {
            await axios.post("/api/mentions", {
              userIds: mentionedUserIds,
              sourceType: "milestone",
              sourceId: createdMilestone.id,
              content: `mentioned you in a milestone: "${values.title.length > 100 ? values.title.substring(0, 97) + '...' : values.title}"`
            });
          } catch (error) {
            console.error("Failed to process mentions:", error);
            // Don't fail the milestone creation if mentions fail
          }
        }
      }
      
      // Display success message
      toast({
        title: "Success",
        description: "The milestone has been created with your selected color."
      });
      
      // Invalidate relevant queries to refresh data
      queryClient.invalidateQueries({ queryKey: boardItemsKeys.board(values.taskBoardId) });
      queryClient.invalidateQueries({ queryKey: boardItemsKeys.all });
      queryClient.invalidateQueries({ queryKey: ['milestones'] });
      
      // Reset form and close dialog
      form.reset();
      onSuccess();
      
    } catch (error) {
      console.error("Error creating milestone:", error);
      toast({
        title: "Error", 
        description: "There was an error creating the milestone. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[1200px] w-full">
        <DialogHeader>
          <DialogTitle>Create New Milestone</DialogTitle>
          <DialogDescription>
            Add a new milestone to track major project goals and timelines.
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
                      <Input placeholder="Enter milestone title" {...field} />
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
                        placeholder="Describe the milestone" 
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
                          setSelectedColumnId(undefined);
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
                      <StatusSelect
                        value={field.value || undefined}
                        onValueChange={(status, columnId) => {
                          field.onChange(status);
                          setSelectedColumnId(columnId);
                        }}
                        boardId={selectedBoardId || ""}
                        disabled={isSubmitting}
                      />
                    </FormControl>
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
                          style={{ backgroundColor: field.value || '#6366F1' }}
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

              <FormField
                control={form.control}
                name="assigneeId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Assignee (Optional)</FormLabel>
                    <FormControl>
                      <AssigneeSelect
                        value={field.value}
                        onChange={field.onChange}
                        workspaceId={workspaceId}
                        disabled={isSubmitting}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="reporterId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reporter (Optional)</FormLabel>
                    <FormControl>
                      <ReporterSelect
                        value={field.value}
                        onChange={field.onChange}
                        workspaceId={workspaceId}
                        disabled={isSubmitting}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Start Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? (
                              format(field.value, "PPP")
                            ) : (
                              <span>Pick a date</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value || undefined}
                          onSelect={field.onChange}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="dueDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Due Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? (
                              format(field.value, "PPP")
                            ) : (
                              <span>Pick a date</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value || undefined}
                          onSelect={field.onChange}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
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
                {isSubmitting ? "Creating..." : "Create Milestone"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
} 