"use client";

import { useState, useEffect, useRef, useCallback, memo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { useWorkspace } from "@/context/WorkspaceContext";
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
import { CalendarIcon, Loader2, CheckSquare, Bug, Sparkles, TrendingUp } from "lucide-react";
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

// Import MarkdownEditor directly instead of dynamically to prevent focus issues
import { MarkdownEditor as BaseMarkdownEditor } from "@/components/ui/markdown-editor";

// Wrap in memo to prevent unnecessary re-renders which cause focus loss
const MarkdownEditor = memo(BaseMarkdownEditor);

// Form validation schema
const taskFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  type: z.string().default("TASK"),
  priority: z.string().default("medium"),
  storyPoints: z.number().optional().nullable(),
  dueDate: z.date().optional().nullable(),
  assigneeId: z.string().optional().nullable(),
  taskBoardId: z.string().min(1, "Board is required"),
  columnId: z.string().optional().nullable(),
  labels: z.array(z.string()).optional(),
  postId: z.string().optional().nullable(),
});

type TaskFormValues = z.infer<typeof taskFormSchema>;

interface Board {
  id: string;
  name: string;
}

interface Column {
  id: string;
  name: string;
}

interface User {
  id: string;
  name: string;
  image?: string;
  useCustomAvatar?: boolean;
}

interface CreateTaskFormProps {
  isOpen: boolean;
  onClose: () => void;
  initialData?: Partial<TaskFormValues>;
  postId?: string;
}

export default function CreateTaskForm({
  isOpen,
  onClose,
  initialData,
  postId,
}: CreateTaskFormProps) {
  const { currentWorkspace } = useWorkspace();
  const [columns, setColumns] = useState<Column[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  
  // Use a stable form key that doesn't change on re-renders
  const formKey = isOpen ? postId || "new-task" : "closed";

  // Form setup
  const form = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      title: initialData?.title || "",
      description: initialData?.description || "",
      type: initialData?.type || "TASK",
      priority: initialData?.priority || "medium",
      storyPoints: initialData?.storyPoints || null,
      dueDate: initialData?.dueDate || null,
      assigneeId: initialData?.assigneeId || null,
      taskBoardId: initialData?.taskBoardId || "",
      columnId: initialData?.columnId || null,
      labels: initialData?.labels || [],
      postId: postId || initialData?.postId || null,
    },
  });

  // First define fetchColumns with useCallback before it's used in any useEffect
  const fetchColumns = useCallback(async (boardId: string) => {
    if (!boardId) return;
    
    let isMounted = true;
    
    try {
      setIsLoading(true);
      const response = await fetch(`/api/tasks/boards/${boardId}/columns`);
      
      if (!isMounted) return;
      
      if (response.ok) {
        const data = await response.json();
        setColumns(data);
        
        // Set default column if none is selected
        if (data.length > 0 && isMounted) {
          form.setValue("columnId", data[0].id);
        }
      } else {
        // In case of error, clear columns
        if (isMounted) {
          setColumns([]);
          form.setValue("columnId", null);
        }
      }
    } catch (error) {
      if (isMounted) {
        console.error("Error fetching columns:", error);
        setColumns([]);
        form.setValue("columnId", null);
      }
    } finally {
      if (isMounted) {
        setIsLoading(false);
      }
    }
    
    return () => {
      isMounted = false;
    };
  }, [form, setColumns, setIsLoading]);

  // Then use fetchColumns in the useEffect
  useEffect(() => {
    let isMounted = true;
    
    const fetchBoards = async () => {
      if (!currentWorkspace || !isOpen || !isMounted) return;
      
      try {
        setIsLoading(true);
        // Clear existing state
        setColumns([]);
        
        const response = await fetch(`/api/workspaces/${currentWorkspace.id}/boards`);
        
        if (!isMounted) return;
        
        if (response.ok) {
          const data = await response.json();
          
          // Always set a board if available to prevent empty board selection
          if (data.length > 0 && isMounted) {
            // Set the provided board ID or use the first available board
            const boardToUse = initialData?.taskBoardId && data.some((b: Board) => b.id === initialData.taskBoardId) 
              ? initialData.taskBoardId 
              : data[0].id;
              
            form.setValue("taskBoardId", boardToUse);
            fetchColumns(boardToUse);
          }
        }
      } catch (error) {
        if (isMounted) {
          console.error("Error fetching boards:", error);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchBoards();
    
    return () => {
      isMounted = false;
    };
    // Only run this effect when workspace, form, or dialog state changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWorkspace, isOpen, initialData?.taskBoardId]);

  // In the onSubmit function, handle HTML and markdown content
  const [descriptionMarkdown, setDescriptionMarkdown] = useState("");

  // Create stable refs for editor state
  const editorContentRef = useRef(descriptionMarkdown);
  
  // Use useCallback for the description change handler to maintain referential equality
  const handleDescriptionChange = useCallback((markdown: string) => {
    setDescriptionMarkdown(markdown);
    editorContentRef.current = markdown;
    form.setValue("description", markdown);
  }, [form]);

  // Update the onSubmit function to include AI improve functionality
  const [isImproving, setIsImproving] = useState(false);

  // Add handleAiImprove function
  const handleAiImprove = async (text: string): Promise<string> => {
    if (isImproving || !text.trim()) return text;
    
    setIsImproving(true);
    
    try {
      const response = await fetch("/api/ai/improve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ text })
      });
      
      if (!response.ok) {
        throw new Error("Failed to improve text");
      }
      
      const data = await response.json();
      
      // Extract message from the response
      const improvedText = data.message || data.improvedText || text;
      
      // Return improved text
      return improvedText;
    } catch (error) {
      console.error("Error improving text:", error);
      toast({
        title: "Error",
        description: "Failed to improve text",
        variant: "destructive"
      });
      return text;
    } finally {
      setIsImproving(false);
    }
  };

  // Form submission
  const onSubmit = async (values: TaskFormValues) => {
    if (!currentWorkspace) {
      toast({
        title: "No workspace selected",
        description: "Please select a workspace to create a task",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsSubmitting(true);
      
      // Convert "unassigned" assigneeId to null
      const submissionValues = {
        ...values,
        assigneeId: values.assigneeId === "unassigned" ? null : values.assigneeId,
      };
      
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...submissionValues,
          workspaceId: currentWorkspace.id,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create task");
      }

      await response.json();
      
      toast({
        title: "Task created",
        description: "Your task has been created successfully",
      });
      
      // Refresh the page to show the new task
      router.refresh();
      onClose();
      
      // Navigate to task if needed
      // router.push(`/tasks/${task.id}`);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create task",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Task</DialogTitle>
        </DialogHeader>

        <Form {...form} key={formKey}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input placeholder="Task title" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={() => (
                <FormItem>
                  <FormLabel htmlFor="description">Description</FormLabel>
                  <FormControl>
                    <MarkdownEditor 
                      initialValue={editorContentRef.current}
                      onChange={handleDescriptionChange}
                      placeholder="Describe the task..."
                      minHeight="200px"
                      maxHeight="350px"
                      onAiImprove={handleAiImprove}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type">
                            {field.value && (
                              <div className="flex items-center">
                                {field.value === "TASK" && <CheckSquare className="h-3.5 w-3.5 mr-2 text-blue-600" />}
                                {field.value === "BUG" && <Bug className="h-3.5 w-3.5 mr-2 text-red-600" />}
                                {field.value === "FEATURE" && <Sparkles className="h-3.5 w-3.5 mr-2 text-green-600" />}
                                {field.value === "IMPROVEMENT" && <TrendingUp className="h-3.5 w-3.5 mr-2 text-purple-600" />}
                                {field.value}
                              </div>
                            )}
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="TASK">
                          <div className="flex items-center">
                            <CheckSquare className="h-3.5 w-3.5 mr-2 text-blue-600" />
                            TASK
                          </div>
                        </SelectItem>
                        <SelectItem value="BUG">
                          <div className="flex items-center">
                            <Bug className="h-3.5 w-3.5 mr-2 text-red-600" />
                            BUG
                          </div>
                        </SelectItem>
                        <SelectItem value="FEATURE">
                          <div className="flex items-center">
                            <Sparkles className="h-3.5 w-3.5 mr-2 text-green-600" />
                            FEATURE
                          </div>
                        </SelectItem>
                        <SelectItem value="IMPROVEMENT">
                          <div className="flex items-center">
                            <TrendingUp className="h-3.5 w-3.5 mr-2 text-purple-600" />
                            IMPROVEMENT
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
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select priority" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="assigneeId"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Assignee</FormLabel>
                    <FormControl>
                      <AssigneeSelect
                        value={field.value === "unassigned" ? null : field.value}
                        onChange={(value) => {
                          form.setValue("assigneeId", value);
                        }}
                        isLoading={isLoading}
                        workspaceId={currentWorkspace?.id}
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
                              "pl-3 text-left font-normal",
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

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="taskBoardId"
                render={({ field: boardField }) => (
                  <FormItem>
                    <FormLabel>Board</FormLabel>
                    <FormControl>
                      <BoardSelect
                        boardValue={boardField.value}
                        onBoardChange={(boardId) => {
                          form.setValue("taskBoardId", boardId);
                          form.setValue("columnId", null);
                        }}
                        disabled={isLoading}
                        workspaceId={currentWorkspace?.id}
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
                render={({ field: columnField }) => (
                  <FormItem>
                    <FormLabel>Column</FormLabel>
                    <FormControl>
                      <Select
                        value={columnField.value || undefined}
                        onValueChange={columnField.onChange}
                        disabled={isLoading || columns.length === 0}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select column" />
                        </SelectTrigger>
                        <SelectContent>
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
            </div>

            <FormField
              control={form.control}
              name="storyPoints"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Story Points</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="0"
                      {...field}
                      onChange={(e) => {
                        const value = e.target.value === "" ? null : parseInt(e.target.value, 10);
                        field.onChange(value);
                      }}
                      value={field.value === null ? "" : field.value}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Task"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
} 