"use client";

import { useState, useCallback, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Loader2, Check, X, PenLine, Calendar as CalendarIcon, CheckSquare, Bug, Sparkles, TrendingUp } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { TaskCommentsList } from "@/components/tasks/TaskCommentsList";
import { ShareButton } from "@/components/tasks/ShareButton";
import { CustomAvatar } from "@/components/ui/custom-avatar";
import { TaskComment } from "@/components/tasks/TaskComment";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import { useTasks } from "@/context/TasksContext";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import React from "react";
import { AssigneeSelect } from "./selectors/AssigneeSelect";

// Format date helper
const formatDate = (date: Date | string) => {
  return format(new Date(date), 'MMM d, yyyy');
};

// Task interfaces
export interface TaskComment {
  id: string;
  content: string;
  createdAt: Date;
  author: {
    id: string;
    name: string | null;
    image: string | null;
  };
}

export interface TaskLabel {
  id: string;
  name: string;
  color: string;
}

export interface TaskAttachment {
  id: string;
  name?: string;
  url: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  type: string;
  createdAt: Date;
  comments: TaskComment[];
  labels: TaskLabel[];
  assignee?: {
    id: string;
    name: string | null;
    image: string | null;
    useCustomAvatar?: boolean;
  } | null;
  reporter?: {
    id: string;
    name: string | null;
    image: string | null;
    useCustomAvatar?: boolean;
  } | null;
  column?: {
    id: string;
    name: string;
  };
  taskBoard?: {
    id: string;
    name: string;
  };
  attachments: TaskAttachment[];
  dueDate?: Date;
  storyPoints?: number;
  issueKey?: string | null;
  workspaceId: string;
}

interface TaskDetailContentProps {
  task: Task | null;
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
  showHeader?: boolean;
  onClose?: () => void;
}

// Client-side implementation of status badge
const getStatusBadge = (status: string) => {
  const statusColors: Record<string, string> = {
    "TO DO": "bg-slate-500",
    "IN PROGRESS": "bg-blue-500",
    "DONE": "bg-green-500",
    "CANCELLED": "bg-red-500",
    "BLOCKED": "bg-yellow-500"
  };

  return (
    <Badge className={`${statusColors[status] || "bg-slate-500"} text-white`}>
      {status}
    </Badge>
  );
};

// Client-side implementation of priority badge
const getPriorityBadge = (priority: string) => {
  const priorityColors: Record<string, string> = {
    "LOW": "bg-blue-100 text-blue-800",
    "MEDIUM": "bg-yellow-100 text-yellow-800",
    "HIGH": "bg-orange-100 text-orange-800",
    "CRITICAL": "bg-red-100 text-red-800"
  };

  const priorityIcons: Record<string, string> = {
    "LOW": "↓",
    "MEDIUM": "→",
    "HIGH": "↑",
    "CRITICAL": "‼️"
  };

  return (
    <Badge className={priorityColors[priority] || "bg-slate-100 text-slate-800"}>
      {priorityIcons[priority]} {priority}
    </Badge>
  );
};

export function TaskDetailContent({
  task,
  isLoading,
  error,
  onRefresh,
  showHeader = true,
  onClose
}: TaskDetailContentProps) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState(task?.title || "");
  const [savingTitle, setSavingTitle] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [savingDescription, setSavingDescription] = useState(false);
  const [description, setDescription] = useState(task?.description || "");
  const [savingAssignee, setSavingAssignee] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingPriority, setSavingPriority] = useState(false);
  const [savingType, setSavingType] = useState(false);
  const [savingDueDate, setSavingDueDate] = useState(false);
  const [dueDate, setDueDate] = useState<Date | undefined>(task?.dueDate);
  const [statuses, setStatuses] = useState<string[]>([]);
  const { toast } = useToast();
  const router = useRouter();
  const { refreshBoards } = useTasks();

  const handleDescriptionChange = useCallback((md: string) => {
    setDescription(md);
  }, []);

  const saveTaskField = async (field: string, value: any) => {
    try {
      const response = await fetch(`/api/tasks/${task?.id}/edit`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ [field]: value }),
      });

      if (!response.ok) {
        throw new Error(`Failed to update ${field}`);
      }

      toast({
        title: 'Updated',
        description: `Task ${field} updated successfully`,
      });

      onRefresh();

      // Refresh the page to reflect changes in all views
      await refreshBoards();
      router.refresh();

      return true;
    } catch (error) {
      console.error(`Error updating ${field}:`, error);
      toast({
        title: 'Error',
        description: `Failed to update ${field}`,
        variant: 'destructive',
      });
      return false;
    }
  };

  // Save title changes
  const handleSaveTitle = async () => {
    if (!title.trim()) {
      toast({
        title: 'Error',
        description: 'Title cannot be empty',
        variant: 'destructive',
      });
      return;
    }

    setSavingTitle(true);
    try {
      const success = await saveTaskField('title', title);
      if (success) {
        setEditingTitle(false);
      }
    } finally {
      setSavingTitle(false);
    }
  };

  // Cancel title editing
  const handleCancelTitle = () => {
    setTitle(task?.title || "");
    setEditingTitle(false);
  };

  // Save description changes
  const handleSaveDescription = async () => {
    setSavingDescription(true);
    try {
      const success = await saveTaskField('description', description);
      if (success) {
        setEditingDescription(false);
      }
    } finally {
      setSavingDescription(false);
    }
  };

  // Cancel description editing
  const handleCancelDescription = () => {
    setDescription(task?.description || "");
    setEditingDescription(false);
  };

  // Handle assignee change
  const handleAssigneeChange = async (userId: string) => {
    setSavingAssignee(true);
    try {
      await saveTaskField('assigneeId', userId === 'unassigned' ? null : userId);
    } finally {
      setSavingAssignee(false);
    }
  };

  // Handle status change
  const handleStatusChange = async (status: string) => {
    setSavingStatus(true);
    try {
      await saveTaskField('status', status);
    } finally {
      setSavingStatus(false);
    }
  };

  // Handle priority change
  const handlePriorityChange = async (priority: string) => {
    setSavingPriority(true);
    try {
      await saveTaskField('priority', priority);
    } finally {
      setSavingPriority(false);
    }
  };

  // Handle type change
  const handleTypeChange = async (type: string) => {
    setSavingType(true);
    try {
      await saveTaskField('type', type);
    } finally {
      setSavingType(false);
    }
  };

  // Handle due date change
  const handleDueDateChange = async (date: Date | undefined) => {
    setDueDate(date);
    setSavingDueDate(true);
    try {
      await saveTaskField('dueDate', date);
    } finally {
      setSavingDueDate(false);
    }
  };

  // Get type badge
  const getTypeBadge = (type: string) => {
    // Ensure consistent uppercase formatting for types
    const normalizedType = type?.toUpperCase() || "TASK";

    const typeColors: Record<string, string> = {
      "TASK": "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
      "BUG": "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
      "FEATURE": "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      "IMPROVEMENT": "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    };

    const typeIcons: Record<string, React.ReactNode> = {
      "TASK": <CheckSquare className="h-3.5 w-3.5 mr-1" />,
      "BUG": <Bug className="h-3.5 w-3.5 mr-1" />,
      "FEATURE": <Sparkles className="h-3.5 w-3.5 mr-1" />,
      "IMPROVEMENT": <TrendingUp className="h-3.5 w-3.5 mr-1" />,
    };

    return (
      <Badge className={`${typeColors[normalizedType] || "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"} px-2 py-1 flex items-center`}>
        {typeIcons[normalizedType] || <CheckSquare className="h-3.5 w-3.5 mr-1" />}
        <span>{normalizedType}</span>
      </Badge>
    );
  };

  // Load statuses and users when task details are viewed
  const loadFieldOptions = useCallback(async () => {
    if (!task) return;

    try {
      // Fetch statuses (columns) for the task's board
      const columnsResponse = await fetch(`/api/boards/${task.taskBoard?.id}/columns`);
      if (columnsResponse.ok) {
        const columnsData = await columnsResponse.json();
        setStatuses(columnsData.map((col: any) => col.name));
      }
    } catch (error) {
      console.error("Error loading field options:", error);
    }
  }, [task]);

  // Load field options on first render
  useEffect(() => {
    loadFieldOptions();
  }, [loadFieldOptions]);

  // Update state when task changes
  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description || "");
      setDueDate(task.dueDate);
    }
  }, [task]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">{error}</p>
        {onClose && (
          <Button variant="link" onClick={onClose}>Close</Button>
        )}
      </div>
    );
  }

  if (!task) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Task not found.</p>
        {onClose && (
          <Button variant="link" onClick={onClose}>Close</Button>
        )}
      </div>
    );
  }

  return (
    <div className="pt-6 space-y-8">
      {showHeader && (
        <div className="space-y-4 bg-gradient-to-r from-background to-muted/30 p-6 rounded-xl border border-border/50 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2 flex-1">
              {editingTitle ? (
                <div className="flex flex-col gap-2 w-full">
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="text-2xl font-bold py-2 px-3 h-auto border-primary/20 focus-visible:ring-primary/30"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSaveTitle();
                      } else if (e.key === 'Escape') {
                        handleCancelTitle();
                      }
                    }}
                    placeholder="Task title"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleCancelTitle}
                      disabled={savingTitle}
                      className="h-8"
                    >
                      <X className="h-4 w-4 mr-1" />
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSaveTitle}
                      disabled={savingTitle}
                      className="h-8"
                    >
                      {savingTitle ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Check className="h-4 w-4 mr-1" />
                          Save
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  className="group relative cursor-pointer"
                  onClick={() => setEditingTitle(true)}
                >
                  <h1 className="text-2xl font-bold group-hover:text-primary transition-colors pr-8">
                    {task.title}
                  </h1>
                  <PenLine className="h-4 w-4 absolute right-0 top-2 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground group-hover:text-primary" />
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <Badge variant="outline" className="font-mono px-2">
                  {task.issueKey}
                </Badge>
                <span>Created on {formatDate(task.createdAt)}</span>
                <div className="flex items-center gap-2">
                  <span>by</span>
                  <div className="flex items-center gap-1">
                    {task.reporter?.useCustomAvatar ? (
                      <CustomAvatar user={task.reporter} size="sm" />
                    ) : (
                      <Avatar className="h-5 w-5">
                        <AvatarImage
                          src={task.reporter?.image || ""}
                          alt={task.reporter?.name || ""}
                        />
                        <AvatarFallback className="text-[10px]">
                          {task.reporter?.name?.charAt(0) || "U"}
                        </AvatarFallback>
                      </Avatar>
                    )}
                    <span>{task.reporter?.name}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {savingType ? (
                <div className="flex items-center h-9 px-3">
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  <span className="text-sm">Saving...</span>
                </div>
              ) : (
                <Select
                  value={task.type}
                  onValueChange={handleTypeChange}
                >
                  <SelectTrigger className="min-w-[130px] h-10 border-dashed hover:border-primary hover:text-primary transition-colors">
                    <SelectValue>
                      {getTypeBadge(task.type)}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TASK" className="py-2">
                      {getTypeBadge("TASK")}
                    </SelectItem>
                    <SelectItem value="BUG" className="py-2">
                      {getTypeBadge("BUG")}
                    </SelectItem>
                    <SelectItem value="FEATURE" className="py-2">
                      {getTypeBadge("FEATURE")}
                    </SelectItem>
                    <SelectItem value="IMPROVEMENT" className="py-2">
                      {getTypeBadge("IMPROVEMENT")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}

              <ShareButton taskId={task.id} issueKey={task.issueKey || ""} />
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 space-y-6">
          <Card className="overflow-hidden border-border/50 transition-all hover:shadow-md">
            <CardHeader className="flex flex-row items-center justify-between py-3 bg-muted/30 border-b">
              <CardTitle className="text-md">Description</CardTitle>
              {!editingDescription && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditingDescription(true)}
                  className="h-8 w-8 p-0 rounded-full"
                >
                  <PenLine className="h-3.5 w-3.5" />
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-0">
              <div>
                {editingDescription ? (
                  <div className="p-4 space-y-3 bg-muted/10">
                    <MarkdownEditor
                      initialValue={description}
                      onChange={handleDescriptionChange}
                      placeholder="Add a description..."
                      minHeight="150px"
                      maxHeight="400px"
                    />
                    <div className="flex justify-end gap-2 mt-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCancelDescription}
                        disabled={savingDescription}
                      >
                        <X className="h-4 w-4 mr-1" />
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleSaveDescription}
                        disabled={savingDescription}
                      >
                        {savingDescription ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <Check className="h-4 w-4 mr-1" />
                            Save
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div
                    className="p-4 prose prose-sm max-w-none dark:prose-invert hover:bg-muted/10 cursor-pointer transition-colors min-h-[120px]"
                    onClick={() => setEditingDescription(true)}
                  >
                    {task.description ? (
                      <MarkdownContent content={task.description} />
                    ) : (
                      <div className="flex items-center justify-center h-[100px] text-muted-foreground border border-dashed rounded-md bg-muted/5">
                        <div className="text-center">
                          <PenLine className="h-5 w-5 mx-auto mb-2 opacity-70" />
                          <p className="italic text-muted-foreground">Click to add a description</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-border/50 transition-all hover:shadow-md">
            <CardHeader className="py-3 bg-muted/30 border-b">
              <CardTitle className="text-md">Comments</CardTitle>
            </CardHeader>
            <CardContent className="relative z-0 p-4">
              <TaskCommentsList
                taskId={task.id}
                comments={task.comments}
                currentUserId={task.reporter?.id || ""}
                userImage={task.reporter?.image}
                onRefresh={onRefresh}
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="overflow-hidden border-border/50 transition-all hover:shadow-md">
            <CardHeader className="py-3 bg-muted/30 border-b">
              <CardTitle className="text-md">Details</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div>
                <p className="text-sm font-medium mb-1">Status</p>
                {savingStatus ? (
                  <div className="flex items-center h-9 px-3 text-sm">
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </div>
                ) : (
                  <Select
                    value={task.column?.name || "TO DO"}
                    onValueChange={handleStatusChange}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {statuses.map((status) => (
                        <SelectItem key={status} value={status}>
                          {getStatusBadge(status)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div>
                <p className="text-sm font-medium mb-1">Priority</p>
                {savingPriority ? (
                  <div className="flex items-center h-9 px-3 text-sm">
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </div>
                ) : (
                  <Select
                    value={task.priority || "MEDIUM"}
                    onValueChange={handlePriorityChange}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOW">{getPriorityBadge("LOW")}</SelectItem>
                      <SelectItem value="MEDIUM">{getPriorityBadge("MEDIUM")}</SelectItem>
                      <SelectItem value="HIGH">{getPriorityBadge("HIGH")}</SelectItem>
                      <SelectItem value="URGENT">{getPriorityBadge("URGENT")}</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div>
                <p className="text-sm font-medium mb-1">Assignee</p>
                {savingAssignee ? (
                  <div className="flex items-center h-9 px-3 text-sm">
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </div>
                ) : (
                  <AssigneeSelect
                    value={task.assignee?.id}
                    onChange={handleAssigneeChange}
                    workspaceId={task.workspaceId}
                  />
                )}
              </div>

              <div>
                <p className="text-sm font-medium mb-1">Reporter</p>
                <div className="flex items-center h-9 px-3 text-sm border rounded-md">
                  {task.reporter ? (
                    <div className="flex items-center gap-2">
                      {task.reporter.useCustomAvatar ? (
                        <CustomAvatar user={task.reporter} size="sm" />
                      ) : (
                        <Avatar className="h-5 w-5">
                          <AvatarImage
                            src={task.reporter.image || ""}
                            alt={task.reporter.name || ""}
                          />
                          <AvatarFallback className="text-[10px]">
                            {task.reporter.name?.charAt(0) || "U"}
                          </AvatarFallback>
                        </Avatar>
                      )}
                      <span>{task.reporter.name || "Unknown"}</span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">No reporter</span>
                  )}
                </div>
              </div>

              <div>
                <p className="text-sm font-medium mb-1">Due Date</p>
                {savingDueDate ? (
                  <div className="flex items-center h-9 px-3 text-sm">
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </div>
                ) : (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !dueDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dueDate ? format(dueDate, "MMM d, yyyy") : "Set due date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={dueDate}
                        onSelect={handleDueDateChange}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            </CardContent>
          </Card>

          {task.attachments && task.attachments.length > 0 && (
            <Card className="overflow-hidden border-border/50 transition-all hover:shadow-md">
              <CardHeader className="py-3 bg-muted/30 border-b">
                <CardTitle className="text-md">Attachments</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <ul className="space-y-2">
                  {task.attachments.map((attachment) => (
                    <li key={attachment.id}>
                      <Link
                        href={attachment.url}
                        target="_blank"
                        className="text-sm text-primary hover:underline flex items-center gap-1"
                      >
                        {attachment.name || "File"}
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
} 