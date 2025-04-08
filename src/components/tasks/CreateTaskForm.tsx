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
import { createTask } from "@/actions/task";
import { useQueryClient } from "@tanstack/react-query";

// Import MarkdownEditor directly instead of dynamically to prevent focus issues
import { MarkdownEditor as BaseMarkdownEditor } from "@/components/ui/markdown-editor";

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const createTaskMutation = useCreateTask();
  const queryClient = useQueryClient();
  const session = useSession();

  // Debug mutations
  useEffect(() => {
    console.log("CreateTaskMutation object:", createTaskMutation);
  }, [createTaskMutation]);

  const workspaceId = initialData.workspaceId || currentWorkspace?.id;
  const [isImprovingDescription, setIsImprovingDescription] = useState(false);

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
  const { data: boardColumns = [], isLoading: isLoadingBoardColumns } = useBoardColumns(selectedBoardId || undefined);
  
  // Fetch tasks for the selected board (moved from render prop)
  const { tasks, isLoading: isLoadingTasks } = useBoardTasks(selectedBoardId);

  // Effect to set default column
  useEffect(() => {
    const currentColumnId = form.getValues('columnId');
    if (selectedBoardId && boardColumns.length > 0 && !currentColumnId) {
      form.setValue('columnId', boardColumns[0].id);
    } else if (!selectedBoardId && currentColumnId) {
      form.setValue('columnId', undefined);
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
    console.log("onSubmit function called with values:", values);

    // Check for required values before proceeding
    if (!values.title) {
      console.error("Title is required");
      toast({ title: "Error", description: "Title is required", variant: "destructive" });
      return;
    }

    try {
      setIsSubmitting(true);
      console.log("Setting isSubmitting to true");
      console.log("Form submitted with values:", values);

      const boardIdToSubmit = values.taskBoardId || selectedBoardId;
      console.log("boardIdToSubmit:", boardIdToSubmit);
      if (!boardIdToSubmit) {
        console.log("Board is required, stopping submission");
        toast({ title: "Error", description: "Board is required.", variant: "destructive" });
        setIsSubmitting(false);
        return;
      }
      if (!workspaceId) {
        console.log("Workspace not found, stopping submission");
        toast({ title: "Error", description: "Workspace not found.", variant: "destructive" });
        setIsSubmitting(false);
        return;
      }
      if (!values.columnId) {
        console.log("Column ID is required, stopping submission");
        toast({ title: "Error", description: "Status column is required.", variant: "destructive" });
        setIsSubmitting(false);
        return;
      }

      // Create a clean data object with only the fields needed by the createTask function
      const cleanData = {
        title: values.title,
        description: values.description,
        workspaceId: workspaceId,
        taskBoardId: boardIdToSubmit,
        columnId: values.columnId,
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

      console.log("Submitting clean task data:", cleanData);

      // Use the createTask function directly
      const result = await createTask(cleanData);
      console.log("Task creation result:", result);

      toast({ title: "Success", description: "Task created successfully." });
      queryClient.invalidateQueries({ queryKey: boardItemsKeys.board(boardIdToSubmit) });
      queryClient.invalidateQueries({ queryKey: taskKeys.list(workspaceId) });
      onClose();
    } catch (error) {
      console.error("Error creating task:", error);
      toast({ title: "Error", description: `Failed to create task: ${error instanceof Error ? error.message : "Unknown error"}`, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Extract parentTaskId from URL params
  const searchParams = useSearchParams();
  useEffect(() => {
    const urlParentTaskId = searchParams.get('parentTaskId');
    if (urlParentTaskId && isOpen && !form.getValues('parentTaskId')) {
      form.setValue("parentTaskId", urlParentTaskId);
    }
  }, [searchParams, isOpen, form]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      console.log("Dialog onOpenChange triggered", open);
      if (!open) onClose();
    }}>
      <DialogContent className="sm:max-w-[800px]" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Create New Task</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">

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
                          form.setValue("epicId", null);
                          form.setValue("storyId", null);
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
                        disabled={isSubmitting || !selectedBoardId || isLoadingBoardColumns || boardColumns.length === 0}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={!selectedBoardId ? "Select board first" : "Select status"} />
                        </SelectTrigger>
                        <SelectContent>
                          {isLoadingBoardColumns && <SelectItem value="loading" disabled>Loading...</SelectItem>}
                          {selectedBoardId && !isLoadingBoardColumns && boardColumns.length === 0 && <SelectItem value="no-columns" disabled>No columns found</SelectItem>}
                          {boardColumns.map((column) => (
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
                name="assigneeId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Assignee</FormLabel>
                    <FormControl>
                      <AssigneeSelect
                        value={field.value || undefined}
                        onChange={field.onChange}
                        disabled={isSubmitting}
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
                      <AssigneeSelect
                        value={field.value || undefined}
                        onChange={field.onChange}
                        disabled={isSubmitting}
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
                        disabled={isSubmitting || !selectedBoardId || !!selectedStoryId}
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
                        disabled={isSubmitting || !selectedBoardId}
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
                            disabled={isSubmitting}
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
                          disabled={isSubmitting}
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
              <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={isSubmitting}
                onClick={(e) => {
                  e.preventDefault();
                  console.log("Manual form submission triggered");
                  const values = form.getValues();
                  onSubmit(values);
                }}
              >
                {isSubmitting ? "Creating..." : "Create Task"}
              </Button>
            </DialogFooter>
          </div>
        </Form>
      </DialogContent>
    </Dialog>
  );
} 