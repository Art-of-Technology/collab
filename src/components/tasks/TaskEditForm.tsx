"use client";

import { useState, useEffect, useRef, useCallback, memo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
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
import { MarkdownEditor as BaseMarkdownEditor } from "@/components/ui/markdown-editor";
import { CalendarIcon, Loader2 } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useTasks } from "@/context/TasksContext";

// Wrap in memo to prevent unnecessary re-renders which cause focus loss
const MarkdownEditor = memo(BaseMarkdownEditor);

// Form validation schema
const taskEditSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  priority: z.string().optional(),
  status: z.string().optional(),
  dueDate: z.date().optional().nullable(),
  assigneeId: z.string().optional().nullable(),
});

type TaskEditFormValues = z.infer<typeof taskEditSchema>;

interface TaskEditFormProps {
  taskId: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function TaskEditForm({ taskId, isOpen, onClose }: TaskEditFormProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [users, setUsers] = useState<{id: string; name: string}[]>([]);
  const { toast } = useToast();
  const router = useRouter();
  const { refreshBoards } = useTasks();
  
  // Create stable refs for editor state
  const [descriptionMarkdown, setDescriptionMarkdown] = useState("");
  const descriptionRef = useRef(descriptionMarkdown);
  
  const form = useForm<TaskEditFormValues>({
    resolver: zodResolver(taskEditSchema),
    defaultValues: {
      title: "",
      description: "",
      priority: "MEDIUM",
      status: "",
      dueDate: null,
      assigneeId: null,
    },
  });
  
  // Fetch task details when component mounts
  useEffect(() => {
    const fetchTaskDetails = async () => {
      if (!taskId) return;
      
      try {
        setIsLoading(true);
        
        // Fetch task details
        const taskResponse = await fetch(`/api/tasks/${taskId}`);
        if (!taskResponse.ok) {
          throw new Error("Failed to load task");
        }
        
        const taskData = await taskResponse.json();
        
        // Set form values
        form.reset({
          title: taskData.title || "",
          description: taskData.description || "",
          priority: taskData.priority || "MEDIUM",
          status: taskData.column?.name || "TO DO",
          dueDate: taskData.dueDate ? new Date(taskData.dueDate) : null,
          assigneeId: taskData.assigneeId || null,
        });
        
        setDescriptionMarkdown(taskData.description || "");
        descriptionRef.current = taskData.description || "";
        
        // Fetch statuses (columns) for the task's board
        const columnsResponse = await fetch(`/api/boards/${taskData.taskBoardId}/columns`);
        if (columnsResponse.ok) {
          const columnsData = await columnsResponse.json();
          setStatuses(columnsData.map((col: any) => col.name));
        }
        
        // Fetch workspace members for assignee options
        const membersResponse = await fetch(`/api/workspaces/${taskData.workspaceId}/members`);
        if (membersResponse.ok) {
          const membersData = await membersResponse.json();
          setUsers(membersData.map((member: any) => ({
            id: member.user.id,
            name: member.user.name,
          })));
        }
      } catch (error) {
        console.error("Error loading task:", error);
        toast({
          title: "Error",
          description: "Failed to load task details",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };
    
    if (isOpen && taskId) {
      fetchTaskDetails();
    }
  }, [taskId, form, toast, isOpen]);
  
  // Handle description change from markdown editor
  const handleDescriptionChange = useCallback((markdown: string, html: string) => {
    setDescriptionMarkdown(markdown);
    descriptionRef.current = markdown;
    form.setValue("description", markdown);
  }, [form]);
  
  const onSubmit = async (values: TaskEditFormValues) => {
    setIsSaving(true);
    
    try {
      const response = await fetch(`/api/tasks/${taskId}/edit`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(values),
      });
      
      if (!response.ok) {
        throw new Error("Failed to update task");
      }
      
      // Get the updated task to update the TaskDetailModal
      const updatedTask = await response.json();
      
      toast({
        title: "Task updated",
        description: "The task has been updated successfully",
      });
      
      // Refresh the task board data
      await refreshBoards();
      
      // Refresh the page to reflect changes in all views
      router.refresh();
      
      // Close the modal
      onClose();
    } catch (error) {
      console.error("Error updating task:", error);
      toast({
        title: "Error",
        description: "Failed to update task. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };
  
  if (isLoading) {
    return (
      <div className="flex justify-center items-center p-6">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span className="ml-2">Loading task details...</span>
      </div>
    );
  }
  
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
              <FormLabel>Description</FormLabel>
              <FormControl>
                <MarkdownEditor
                  initialValue={descriptionRef.current}
                  onChange={handleDescriptionChange}
                  placeholder="Task description (supports markdown)"
                  minHeight="150px"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="priority"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Priority</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                  value={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select priority" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="LOW">Low</SelectItem>
                    <SelectItem value="MEDIUM">Medium</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                    <SelectItem value="CRITICAL">Critical</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Status</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                  value={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {statuses.length > 0 ? (
                      statuses.map((status) => (
                        <SelectItem key={status} value={status}>
                          {status}
                        </SelectItem>
                      ))
                    ) : (
                      <>
                        <SelectItem value="TO DO">To Do</SelectItem>
                        <SelectItem value="IN PROGRESS">In Progress</SelectItem>
                        <SelectItem value="DONE">Done</SelectItem>
                      </>
                    )}
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
          
          <FormField
            control={form.control}
            name="assigneeId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Assignee</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value || "unassigned"}
                  value={field.value || "unassigned"}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select assignee" />
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
        </div>
        
        <div className="flex justify-end space-x-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button 
            type="submit" 
            disabled={isSaving}
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
} 