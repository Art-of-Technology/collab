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
import { CalendarIcon, Loader2 } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import dynamic from "next/dynamic";

// Import MarkdownEditor directly instead of dynamically to prevent focus issues
import { MarkdownEditor as BaseMarkdownEditor } from "@/components/ui/markdown-editor";

// Wrap in memo to prevent unnecessary re-renders which cause focus loss
const MarkdownEditor = memo(BaseMarkdownEditor);

// Form validation schema
const taskFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  type: z.string().default("task"),
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
  const [boards, setBoards] = useState<Board[]>([]);
  const [columns, setColumns] = useState<Column[]>([]);
  const [users, setUsers] = useState<User[]>([]);
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
      type: initialData?.type || "task",
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

  // Fetch boards when component mounts or when form is opened or workspace changes
  useEffect(() => {
    const fetchBoards = async () => {
      if (!currentWorkspace || !isOpen) return;
      
      try {
        setIsLoading(true);
        // Clear existing state
        setBoards([]);
        setColumns([]);
        form.setValue("taskBoardId", "");
        form.setValue("columnId", null);
        
        const response = await fetch(`/api/workspaces/${currentWorkspace.id}/boards`);
        
        if (response.ok) {
          const data = await response.json();
          setBoards(data);
          
          // Set the provided board ID or use the first available board
          const boardToUse = initialData?.taskBoardId && data.some((b: Board) => b.id === initialData.taskBoardId) 
            ? initialData.taskBoardId 
            : data.length > 0 ? data[0].id : "";
            
          if (boardToUse) {
            form.setValue("taskBoardId", boardToUse);
            fetchColumns(boardToUse);
          }
        }
      } catch (error) {
        console.error("Error fetching boards:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchBoards();
  }, [currentWorkspace, form, isOpen, initialData]);

  // Fetch columns when board changes
  const fetchColumns = async (boardId: string) => {
    if (!boardId) return;
    
    try {
      setIsLoading(true);
      const response = await fetch(`/api/tasks/boards/${boardId}/columns`);
      
      if (response.ok) {
        const data = await response.json();
        setColumns(data);
        
        // Set default column if none is selected
        if (data.length > 0) {
          form.setValue("columnId", data[0].id);
        }
      } else {
        // In case of error, clear columns
        setColumns([]);
        form.setValue("columnId", null);
      }
    } catch (error) {
      console.error("Error fetching columns:", error);
      setColumns([]);
      form.setValue("columnId", null);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle board change
  const handleBoardChange = (boardId: string) => {
    setColumns([]); // Clear columns first
    form.setValue("taskBoardId", boardId);
    form.setValue("columnId", null);
    fetchColumns(boardId);
  };

  // Fetch workspace members for assignee selection
  useEffect(() => {
    const fetchMembers = async () => {
      if (!currentWorkspace) return;
      
      try {
        const response = await fetch(`/api/workspaces/${currentWorkspace.id}/members`);
        
        if (response.ok) {
          const data = await response.json();
          // Create a map to deduplicate members by ID
          const uniqueUsers = new Map();
          data.forEach((member: any) => {
            if (member.user) {
              uniqueUsers.set(member.user.id, member.user);
            }
          });
          setUsers(Array.from(uniqueUsers.values()));
        }
      } catch (error) {
        console.error("Error fetching members:", error);
      }
    };

    fetchMembers();
  }, [currentWorkspace]);

  // In the onSubmit function, handle HTML and markdown content
  const [descriptionMarkdown, setDescriptionMarkdown] = useState("");

  // Create stable refs for editor state
  const editorContentRef = useRef(descriptionMarkdown);

  const [descriptionHtml, setDescriptionHtml] = useState("");
  
  // Create a ref to persist description state between renders
  const descriptionRef = useRef("");
  
  // Use useCallback for the description change handler to maintain referential equality
  const handleDescriptionChange = useCallback((markdown: string, html: string) => {
    setDescriptionMarkdown(markdown);
    editorContentRef.current = markdown;
    form.setValue("description", markdown);
  }, [form]);

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

      const task = await response.json();
      
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
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
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
              render={({ field }) => (
                <FormItem>
                  <FormLabel htmlFor="description">Description</FormLabel>
                  <FormControl>
                    <MarkdownEditor 
                      initialValue={editorContentRef.current}
                      onChange={handleDescriptionChange}
                      placeholder="Describe the task..."
                      minHeight="150px"
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
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="task">Task</SelectItem>
                        <SelectItem value="bug">Bug</SelectItem>
                        <SelectItem value="feature">Feature</SelectItem>
                        <SelectItem value="improvement">Improvement</SelectItem>
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
                  <FormItem>
                    <FormLabel>Assignee</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value || "unassigned"}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Unassigned" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        {users.map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Board</FormLabel>
                    <Select
                      onValueChange={handleBoardChange}
                      defaultValue={field.value}
                      disabled={isLoading}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select board" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {boards.map((board) => (
                          <SelectItem key={board.id} value={board.id}>
                            {board.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="columnId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Column</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value || undefined}
                      disabled={isLoading || columns.length === 0}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select column" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {columns.map((column) => (
                          <SelectItem key={column.id} value={column.id}>
                            {column.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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