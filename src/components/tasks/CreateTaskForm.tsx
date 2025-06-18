"use client";

import React, { useState, useEffect, useCallback, memo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useToast } from "@/hooks/use-toast";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useCreateTask, useBoardColumns } from "@/hooks/queries/useTask";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { CalendarIcon, CheckSquare, Bug, Sparkles, TrendingUp } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { AssigneeSelect } from "./selectors/AssigneeSelect";
import { BoardSelect } from "./selectors/BoardSelect";
import { EpicSelect } from "@/components/tasks/selectors/EpicSelect";
import { StorySelect } from "@/components/tasks/selectors/StorySelect";
import { boardItemsKeys } from "@/hooks/queries/useBoardItems";
import { taskKeys } from "@/hooks/queries/useTask";
import { useQueryClient } from "@tanstack/react-query";
import { extractMentionUserIds } from "@/utils/mentions";
import axios from "axios";

// Import MarkdownEditor directly instead of dynamically to prevent focus issues
import { MarkdownEditor as BaseMarkdownEditor } from "@/components/ui/markdown-editor";
import { StatusSelect } from "./selectors/StatusSelect";
import { ReporterSelect } from "./selectors/ReporterSelect";
import { LabelSelector } from "@/components/ui/label-selector";

// Wrap in memo to prevent unnecessary re-renders which cause focus loss
const MarkdownEditor = memo(BaseMarkdownEditor);

// Form validation schema
const taskFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  workspaceId: z.string().min(1, "Workspace ID is required"),
  priority: z.string().optional(),
  type: z.string().optional(),
  epicId: z.string().nullable().optional(),
  storyId: z.string().nullable().optional(),
  taskBoardId: z.string().min(1, "Board is required"),
  columnId: z.string().min(1, "Status column is required").nullable().optional(),
  labels: z.array(z.string()).optional(),
  postId: z.string().optional().nullable(),
  dueDate: z.date().optional().nullable(),
  parentTaskId: z.string().optional().nullable(),
  assigneeId: z.string().optional().nullable(),
  reporterId: z.string().optional().nullable(),
});

type TaskFormValues = z.infer<typeof taskFormSchema>;

interface CreateTaskFormProps {
  isOpen: boolean;
  onClose: () => void;
  initialData?: Partial<TaskFormValues & { workspaceId?: string; parentTaskId?: string | null }>;
  postId?: string | null;
}

// Hook for fetching board tasks
const useBoardTasks = (boardId: string | undefined) => {
  const [tasks, setTasks] = useState<Array<{ id: string; title: string; issueKey?: string }>>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchTasks = async () => {
      if (!boardId) return;

      try {
        setIsLoading(true);
        const response = await fetch(`/api/tasks/boards/${boardId}/tasks`);
        if (response.ok) {
          const data = await response.json();
          setTasks(data);
        }
      } catch (error) {
        console.error("Failed to fetch tasks:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTasks();
  }, [boardId]);

  return { tasks, isLoading };
};

// Fix TaskSelect to properly handle null values
const TaskSelect = ({
  value,
  onChange,
  tasks,
  isLoading
}: {
  value: string | undefined,
  onChange: (value: string | null) => void,
  tasks: Array<{ id: string, title: string, issueKey?: string }>,
  isLoading: boolean
}) => {
  return (
    <Select
      value={value || "none"}
      onValueChange={(val) => onChange(val === "none" ? null : val)}
      disabled={isLoading}
    >
      <SelectTrigger>
        <SelectValue placeholder="Select parent task" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">None</SelectItem>
        {tasks.map((task) => (
          <SelectItem key={task.id} value={task.id}>
            {task.issueKey ? `${task.issueKey}: ` : ""}{task.title}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default function CreateTaskForm({
  isOpen,
  onClose,
  initialData = {},
  postId
}: CreateTaskFormProps) {
  const { currentWorkspace } = useWorkspace();
  const { toast } = useToast();
  const createTaskMutation = useCreateTask();
  const queryClient = useQueryClient();
  const session = useSession();

  // Debug mutations
  useEffect(() => {
  }, [createTaskMutation]);

  const workspaceId = initialData.workspaceId || currentWorkspace?.id;
  const [isImprovingDescription, setIsImprovingDescription] = useState(false);
  const [selectedColumnId, setSelectedColumnId] = useState<string | undefined>(undefined);

  // Form initialization
  const form = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      title: initialData.title || "",
      description: initialData.description || "",
      workspaceId: workspaceId,
      priority: initialData.priority || "MEDIUM",
      type: initialData.type || "TASK",
      epicId: initialData.epicId || null,
      storyId: initialData.storyId || null,
      taskBoardId: initialData.taskBoardId || "",
      columnId: initialData.columnId || undefined,
      labels: initialData?.labels || [],
      postId: postId || initialData?.postId || null,
      dueDate: initialData?.dueDate || null,
      parentTaskId: initialData?.parentTaskId || null,
      assigneeId: initialData?.assigneeId || null,
      reporterId: initialData?.reporterId || session?.data?.user?.id || null,
    },
  });

  // Set current user as default reporter when form is initialized
  useEffect(() => {
    // Only set if session exists and form hasn't been modified yet
    if (session?.data?.user?.id && !form.getValues('reporterId')) {
      form.setValue('reporterId', session.data.user.id);
    }
  }, [session?.data?.user?.id, form]);

  // Watch the selected board ID
  const selectedBoardId = form.watch('taskBoardId');

  // Fetch columns for the selected board
  const { data: boardColumns = [] } = useBoardColumns(selectedBoardId || undefined);
  
  // Fetch tasks for the selected board (moved from render prop)
  const { tasks, isLoading: isLoadingTasks } = useBoardTasks(selectedBoardId);

  // Effect to set default column
  useEffect(() => {
    const currentColumnStatus = form.getValues('columnId');
    if (selectedBoardId && boardColumns.length > 0 && !currentColumnStatus) {
      form.setValue('columnId', boardColumns[0].name);
      setSelectedColumnId(boardColumns[0].id);
    } else if (!selectedBoardId && currentColumnStatus) {
      form.setValue('columnId', undefined);
      setSelectedColumnId(undefined);
    }
  }, [boardColumns, selectedBoardId, form]);

  // Clear Epic and Story when Board changes
  useEffect(() => {
    form.setValue('epicId', null);
    form.setValue('storyId', null);
  }, [selectedBoardId, form]);

  // Clear Story if Epic is selected, Clear Epic if Story is selected
  const selectedEpicId = form.watch('epicId');
  const selectedStoryId = form.watch('storyId');
  useEffect(() => {
    if (selectedEpicId) form.setValue('storyId', null);
  }, [selectedEpicId, form]);
  useEffect(() => {
    if (selectedStoryId) form.setValue('epicId', null);
  }, [selectedStoryId, form]);

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

  // Form submission
  const onSubmit = async (values: TaskFormValues) => {
    // Check for required values before proceeding
    if (!values.title) {
      console.error("Title is required");
      toast({ title: "Error", description: "Title is required", variant: "destructive" });
      return;
    }

    const boardIdToSubmit = values.taskBoardId || selectedBoardId;
    if (!boardIdToSubmit) {
      toast({ title: "Error", description: "Board is required.", variant: "destructive" });
      return;
    }
    if (!workspaceId) {
      toast({ title: "Error", description: "Workspace not found.", variant: "destructive" });
      return;
    }
    if (!values.columnId || !selectedColumnId) {
      toast({ title: "Error", description: "Status column is required.", variant: "destructive" });
      return;
    }

    const mentionedUserIds = values.description ? extractMentionUserIds(values.description) : [];
    // Create a clean data object for the mutation
    const cleanData = {
      title: values.title,
      description: values.description,
      workspaceId: workspaceId,
      taskBoardId: boardIdToSubmit,
      columnId: selectedColumnId,
      status: values.columnId, // This now contains the status name
      epicId: values.epicId || null,
      storyId: values.storyId || null,
      priority: (values.priority || "MEDIUM") as "LOW" | "MEDIUM" | "HIGH",
      dueDate: values.dueDate || undefined,
      type: values.type || "TASK",
      postId: values.postId || null,
      parentTaskId: values.parentTaskId || undefined,
      assigneeId: values.assigneeId === "unassigned" ? undefined : values.assigneeId || undefined,
      reporterId: values.reporterId === "unassigned" ? undefined : values.reporterId || undefined,
    };

    // Use the mutation hook
    createTaskMutation.mutate(cleanData, {
      onSuccess: async (createdTask) => {
        // Process mentions if there are any in the description
        if (createdTask?.id && mentionedUserIds.length > 0) {
          try {
            await axios.post("/api/mentions", {
              userIds: mentionedUserIds,
              sourceType: "task",
              sourceId: createdTask.id,
              content: `mentioned you in a task: "${values.title.length > 100 ? values.title.substring(0, 97) + '...' : values.title}"`
            });
          } catch (error) {
            console.error("Failed to process mentions:", error);
            // Don't fail the task creation success flow if mentions fail
          }
        }

        toast({ title: "Success", description: "Task created successfully." });
        queryClient.invalidateQueries({ queryKey: boardItemsKeys.board(boardIdToSubmit) });
        queryClient.invalidateQueries({ queryKey: taskKeys.list(workspaceId) });
        
        // Reset form and close dialog on success
        form.reset();
        onClose();
      },
      onError: (error) => {
        console.error("Error creating task via mutation:", error);
        toast({ title: "Error", description: `Failed to create task: ${error.message || "Unknown error"}`, variant: "destructive" });
      },
    });
  };

  // Extract parentTaskId from URL params
  const searchParams = useSearchParams();
  useEffect(() => {
    const urlParentTaskId = searchParams.get('parentTaskId');
    if (urlParentTaskId && isOpen && !form.getValues('parentTaskId')) {
      form.setValue("parentTaskId", urlParentTaskId);
    }
  }, [searchParams, isOpen, form]);

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (isOpen) {
      // Reset form with fresh initial data when dialog opens
      const defaultValues = {
        title: initialData.title || "",
        description: initialData.description || "",
        workspaceId: workspaceId,
        priority: initialData.priority || "MEDIUM",
        type: initialData.type || "TASK",
        epicId: initialData.epicId || null,
        storyId: initialData.storyId || null,
        taskBoardId: initialData.taskBoardId || "",
        columnId: undefined, // Will be set below based on whether initialData.columnId is ID or name
        labels: initialData?.labels || [],
        postId: postId || initialData?.postId || null,
        dueDate: initialData?.dueDate || null,
        parentTaskId: initialData?.parentTaskId || null,
        assigneeId: initialData?.assigneeId || null,
        reporterId: initialData?.reporterId || session?.data?.user?.id || null,
      };
      form.reset(defaultValues);
    }
  }, [isOpen, initialData, workspaceId, postId, session?.data?.user?.id, form]);

  // Handle initial column selection when initialData.columnId is provided
  useEffect(() => {
    if (isOpen && initialData.columnId && boardColumns.length > 0) {
      // Check if initialData.columnId is an actual column ID or column name
      const columnById = boardColumns.find(col => col.id === initialData.columnId);
      const columnByName = boardColumns.find(col => col.name === initialData.columnId);
      
      if (columnById) {
        // initialData.columnId is a column ID, set the status name and store the ID
        form.setValue('columnId', columnById.name);
        setSelectedColumnId(columnById.id);
      } else if (columnByName) {
        // initialData.columnId is already a column name, just set it
        form.setValue('columnId', columnByName.name);
        setSelectedColumnId(columnByName.id);
      }
    }
  }, [isOpen, initialData.columnId, boardColumns, form]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) {
        // Reset form when dialog closes
        form.reset();
        onClose();
      }
    }}>
      <DialogContent className="max-w-[1200px] w-full h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Create New Task</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <div className="flex-1 overflow-y-auto min-h-0">
            <form
              id="create-task-form"
              onSubmit={form.handleSubmit(onSubmit)}
              className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 pb-4"
            >
            <div className="md:col-span-2 space-y-4">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter task title" {...field} />
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
                        placeholder="Describe the task"
                        minHeight="200px"
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
                          form.setValue("columnId", undefined);
                          setSelectedColumnId(undefined);
                          form.setValue("epicId", null);
                          form.setValue("storyId", null);
                        }}
                        disabled={createTaskMutation.isPending}
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
                        disabled={createTaskMutation.isPending}
                      />
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
                    <FormLabel>Assignee</FormLabel>
                    <FormControl>
                      <AssigneeSelect
                        value={field.value || undefined}
                        onChange={field.onChange}
                        disabled={createTaskMutation.isPending}
                        workspaceId={workspaceId}
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
                    <FormLabel>Reporter</FormLabel>
                    <FormControl>
                      <ReporterSelect
                        value={field.value || undefined}
                        onChange={field.onChange}
                        disabled={createTaskMutation.isPending}
                        workspaceId={workspaceId}
                        placeholder="Select reporter"
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground mt-1">
                      Default is current user
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {selectedBoardId && (
                <FormField
                  control={form.control}
                  name="parentTaskId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Parent Task (Optional)</FormLabel>
                      <FormControl>
                        <TaskSelect
                          value={field.value || undefined}
                          onChange={field.onChange}
                          tasks={tasks}
                          isLoading={isLoadingTasks}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

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
                        <SelectItem value="LOW">Low</SelectItem>
                        <SelectItem value="MEDIUM">Medium</SelectItem>
                        <SelectItem value="HIGH">High</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || undefined}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="TASK">
                          <div className="flex items-center">
                            <CheckSquare className="h-3.5 w-3.5 mr-2 text-blue-600" /> TASK
                          </div>
                        </SelectItem>
                        <SelectItem value="BUG">
                          <div className="flex items-center">
                            <Bug className="h-3.5 w-3.5 mr-2 text-red-600" /> BUG
                          </div>
                        </SelectItem>
                        <SelectItem value="FEATURE">
                          <div className="flex items-center">
                            <Sparkles className="h-3.5 w-3.5 mr-2 text-green-600" /> FEATURE
                          </div>
                        </SelectItem>
                        <SelectItem value="IMPROVEMENT">
                          <div className="flex items-center">
                            <TrendingUp className="h-3.5 w-3.5 mr-2 text-purple-600" /> IMPROVEMENT
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
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
                        onChange={(val) => {
                          field.onChange(val);
                          // Clear story selection when epic changes
                          if (val && val !== form.getValues('epicId')) {
                            form.setValue('storyId', null);
                          }
                        }}
                        workspaceId={workspaceId}
                        boardId={selectedBoardId}
                        disabled={createTaskMutation.isPending || !selectedBoardId || !!selectedStoryId}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="storyId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Story (Optional)</FormLabel>
                    <FormControl>
                      <StorySelect
                        value={field.value || undefined}
                        onChange={field.onChange}
                        workspaceId={workspaceId}
                        boardId={selectedBoardId}
                        epicId={selectedEpicId}
                        disabled={createTaskMutation.isPending || !selectedBoardId}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="labels"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Labels</FormLabel>
                    <FormControl>
                      <LabelSelector
                        value={field.value || []}
                        onChange={field.onChange}
                        workspaceId={workspaceId}
                        disabled={createTaskMutation.isPending}
                        placeholder="Select or create labels..."
                      />
                    </FormControl>
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
                            disabled={createTaskMutation.isPending}
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
                          disabled={createTaskMutation.isPending}
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
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => {
                    form.reset();
                    onClose();
                  }} 
                  disabled={createTaskMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createTaskMutation.isPending}
                  form="create-task-form"
                >
                  {createTaskMutation.isPending ? "Creating..." : "Create Task"}
                </Button>
              </DialogFooter>
            </form>
          </div>
        </Form>
      </DialogContent>
    </Dialog>
  );
} 