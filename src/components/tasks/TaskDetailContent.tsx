/* eslint-disable */
"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { format, formatDistanceToNow } from "date-fns";
import { Loader2, Check, X, PenLine, Calendar as CalendarIcon, CheckSquare, Bug, Sparkles, TrendingUp, Plus, Play, Pause, StopCircle, History, Clock } from "lucide-react";
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
import { useTasks } from "@/context/TasksContext";
import { useActivity } from "@/context/ActivityContext";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import React from "react";
import { AssigneeSelect } from "./selectors/AssigneeSelect";
import CreateTaskForm from "@/components/tasks/CreateTaskForm";
import { extractMentionUserIds } from "@/utils/mentions";
import axios from "axios";
import { useSession } from "next-auth/react";
import { TaskHelpersSection } from "@/components/tasks/TaskHelpersSection";
import { useWorkspaceSettings } from "@/hooks/useWorkspaceSettings";

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
    useCustomAvatar?: boolean;
    avatarSkinTone?: number | null;
    avatarEyes?: number | null;
    avatarBrows?: number | null;
    avatarMouth?: number | null;
    avatarNose?: number | null;
    avatarHair?: number | null;
    avatarEyewear?: number | null;
    avatarAccessory?: number | null;
  };
  html?: string | null;
  parentId?: string | null;
  reactions?: {
    id: string;
    type: string;
    authorId: string;
    author?: {
      id: string;
      name?: string | null;
      image?: string | null;
      useCustomAvatar?: boolean;
    };
  }[];
  replies?: TaskComment[];
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
  description?: string | null;
  status: string | null;
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
  milestoneId?: string;
  milestone?: {
    id: string;
    title: string;
  };
  epicId?: string;
  epic?: {
    id: string;
    title: string;
  };
  storyId?: string;
  story?: {
    id: string;
    title: string;
  };
  parentTaskId?: string;
  parentTask?: {
    id: string;
    title: string;
    issueKey?: string;
  };
  subtasks?: {
    id: string;
    title: string;
    issueKey?: string;
    status: string;
  }[];
}

interface TaskDetailContentProps {
  task: Task | null;
  error: string | null;
  onRefresh: () => void;
  showHeader?: boolean;
  onClose?: () => void;
  boardId?: string;
}

// New interface for TaskActivity
export interface TaskActivity {
  id: string;
  action: string;
  details: string | null; // JSON string
  createdAt: Date;
  user: {
    id: string;
    name: string | null;
    image: string | null;
    useCustomAvatar?: boolean;
    avatarSkinTone?: number | null;
    avatarEyes?: number | null;
    avatarBrows?: number | null;
    avatarMouth?: number | null;
    avatarNose?: number | null;
    avatarHair?: number | null;
    avatarEyewear?: number | null;
    avatarAccessory?: number | null;
  };
}

// New interface for PlayTime
export interface PlayTime {
  totalTimeMs: number;
  formattedTime: string;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

type PlayState = "stopped" | "playing" | "paused";

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
  error,
  onRefresh,
  showHeader = true,
  onClose,
  boardId
}: TaskDetailContentProps) {
  const { data: session } = useSession();
  const { settings } = useWorkspaceSettings();
  const currentUserId = session?.user?.id;
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState(task?.title || "");
  const [savingTitle, setSavingTitle] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [savingDescription, setSavingDescription] = useState(false);
  const [isImprovingDescription, setIsImprovingDescription] = useState(false);
  const [description, setDescription] = useState(task?.description || "");
  const [savingAssignee, setSavingAssignee] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingPriority, setSavingPriority] = useState(false);
  const [savingType, setSavingType] = useState(false);
  const [savingDueDate, setSavingDueDate] = useState(false);
  const [dueDate, setDueDate] = useState<Date | undefined>(task?.dueDate);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [comments, setComments] = useState<TaskComment[]>(task?.comments || []);
  const { toast } = useToast();
  const { refreshBoards } = useTasks();
  const { handleTaskAction, userStatus } = useActivity();
  const [subtaskFormOpen, setSubtaskFormOpen] = useState(false);

  // New state variables for play/pause feature
  const [taskActivities, setTaskActivities] = useState<TaskActivity[]>([]);
  const [totalPlayTime, setTotalPlayTime] = useState<PlayTime | null>(null);
  const [isTimerLoading, setIsTimerLoading] = useState(false);
  const [currentPlayState, setCurrentPlayState] = useState<PlayState>("stopped");
  const [isLoadingActivities, setIsLoadingActivities] = useState(false);
  const [isLoadingPlayTime, setIsLoadingPlayTime] = useState(false);
  const [liveTimeDisplay, setLiveTimeDisplay] = useState<string | null>(null);

  const canControlTimer = useMemo(() => {
    if (!task || !currentUserId) return false;
    // Allow assignee, reporter, or any user to control their own timer
    // Individual timer control is now per-user based
    return true;
  }, [task, currentUserId]);

  // Update comments state when task changes
  useEffect(() => {
    if (task?.comments) {
      // Make sure comments have the right structure
      const structuredComments = task.comments.map(comment => ({
        ...comment,
        author: comment.author || {
          id: "unknown",
          name: "Unknown User",
          image: null
        }
      }));
      setComments(structuredComments);
    }
  }, [task?.comments]);

  const handleDescriptionChange = useCallback((md: string) => {
    setDescription(md);
  }, []);

  const fetchTaskActivities = useCallback(async () => {
    if (!task?.id) return;
    setIsLoadingActivities(true);
    try {
      const response = await fetch(`/api/tasks/${task.id}/activities`);
      if (!response.ok) {
        throw new Error("Failed to fetch task activities");
      }
      const data: TaskActivity[] = await response.json();
      setTaskActivities(data);
    } catch (err) {
      console.error("Error fetching task activities:", err);
      toast({
        title: "Error",
        description: "Could not load task activities.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingActivities(false);
    }
  }, [task?.id, toast]);

  const fetchTotalPlayTime = useCallback(async () => {
    if (!task?.id) return;
    setIsLoadingPlayTime(true);
    try {
      const response = await fetch(`/api/tasks/${task.id}/playtime`);
      if (!response.ok) {
        throw new Error("Failed to fetch total play time");
      }
      const data: PlayTime = await response.json();
      setTotalPlayTime(data);
    } catch (err) {
      console.error("Error fetching total play time:", err);
      // Do not toast for this, as it might be too noisy if it fails often initially
    } finally {
      setIsLoadingPlayTime(false);
    }
  }, [task?.id]);

  // Determine current play state from activities (filtered by current user)
  useEffect(() => {
    if (taskActivities.length > 0 && currentUserId) {
      const userActivities = [...taskActivities] // Create a new array to avoid mutating state directly
        .filter(act => 
          ["TASK_PLAY_STARTED", "TASK_PLAY_PAUSED", "TASK_PLAY_STOPPED"].includes(act.action) &&
          act.user.id === currentUserId // Explicitly filter by current user
        );
      
      const lastRelevantActivity = userActivities
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

      if (lastRelevantActivity) {
        if (lastRelevantActivity.action === "TASK_PLAY_STARTED") {
          setCurrentPlayState("playing");
        } else if (lastRelevantActivity.action === "TASK_PLAY_PAUSED") {
          setCurrentPlayState("paused");
        } else {
          setCurrentPlayState("stopped");
        }
      } else {
        setCurrentPlayState("stopped");
      }
    } else {
      setCurrentPlayState("stopped"); // Default to stopped if no activities or no current user
    }
  }, [taskActivities, currentUserId]);

  // Helper function to format milliseconds into a readable string (e.g., 1d 2h 3m 4s)
  const formatLiveTime = (ms: number): string => {
    if (ms < 0) ms = 0;
    const totalSecondsValue = Math.floor(ms / 1000);
    const d = Math.floor(totalSecondsValue / (3600 * 24));
    const h = Math.floor((totalSecondsValue % (3600 * 24)) / 3600);
    const m = Math.floor((totalSecondsValue % 3600) / 60);
    const s = totalSecondsValue % 60;
    
    // Consistent with API: Xh Ym Zs, or Dd Xh Ym Zs
    if (d > 0) return `${d}d ${h}h ${m}m ${s}s`;
    return `${h}h ${m}m ${s}s`;
  };

  // Effect for live timer when task is playing
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;

    // Wait for play time to be loaded before starting timer
    if (isLoadingPlayTime) {
      return;
    }

    if (userStatus?.statusStartedAt && task?.id) {
      const isMyTask = userStatus.currentTaskId === task.id;
      const isPlaying = userStatus.currentTaskPlayState === "playing";
      
      if (isMyTask && isPlaying) {
        const tick = () => {
          const start = new Date(userStatus.statusStartedAt);
          const now = new Date();
          const sessionElapsed = now.getTime() - start.getTime();
          
          // Use the totalTimeMs from the API if available, otherwise 0
          // The API already returns the accumulated time from all previous sessions
          const baseTime = totalPlayTime?.totalTimeMs || 0;
          const currentTotalMs = baseTime + sessionElapsed;
          const formatted = formatLiveTime(currentTotalMs);
          setLiveTimeDisplay(formatted);
        };

        tick();
        intervalId = setInterval(tick, 1000);
      } else if (!isPlaying && totalPlayTime) {
        setLiveTimeDisplay(totalPlayTime.formattedTime);
      }
    } else if (totalPlayTime && userStatus?.currentTaskId !== task?.id) {
      setLiveTimeDisplay(totalPlayTime.formattedTime);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [userStatus?.currentTaskId, userStatus?.currentTaskPlayState, userStatus?.statusStartedAt, task?.id, totalPlayTime?.totalTimeMs, totalPlayTime?.formattedTime, isLoadingPlayTime]);

  // Fetch activities and playtime when task ID changes or onRefresh is called
  useEffect(() => {
    if (task?.id) {
      fetchTaskActivities();
      fetchTotalPlayTime();
    }
  }, [task?.id, fetchTaskActivities, fetchTotalPlayTime, onRefresh]); // Added onRefresh to dependencies

  const handlePlayPauseStop = async (action: "play" | "pause" | "stop") => {
    if (!task?.id) return;
    
    setIsTimerLoading(true);
    try {
      // Use the ActivityContext for proper state management
      await handleTaskAction(action, task.id);

      // Fetch local data directly. These will update relevant states and UI parts.
      await fetchTaskActivities(); 
      await fetchTotalPlayTime();  

      // Refresh the boards context for other parts of the application (including dock widget)
      refreshBoards(); 
      // No longer calling onRefresh() here to prevent parent-induced re-fetch of the whole task object

    } catch (err: any) {
      console.error(`Error ${action} task:`, err);
      // Error handling is already done in the ActivityContext
    } finally {
      setIsTimerLoading(false);
    }
  };

  const handleAiImproveDescription = async (text: string): Promise<string> => {
    if (isImprovingDescription || !text.trim()) return text;

    setIsImprovingDescription(true);

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
      setIsImprovingDescription(false);
    }
  };

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

      const updatedTask = await response.json();

      toast({
        title: 'Updated',
        description: `Task ${field} updated successfully`,
      });

      // Don't trigger a full refresh which causes modal to disappear
      // Just update the necessary state
      if (field === 'title') {
        setTitle(updatedTask.title);
      } else if (field === 'description') {
        setDescription(updatedTask.description || "");
      } else if (field === 'assigneeId') {
        // The assignee is already updated in the UI by AssigneeSelect
      } else if (field === 'status') {
        // The status is already updated in the UI by the Select
      } else if (field === 'priority') {
        // The priority is already updated in the UI by the Select
      } else if (field === 'type') {
        // The type is already updated in the UI by the Select
      } else if (field === 'dueDate') {
        setDueDate(updatedTask.dueDate);
      }

      // Refresh in background without causing UI flicker
      setTimeout(() => {
        onRefresh();
        refreshBoards();
      }, 100);

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
        // Process mentions in the updated description
        if (task?.id && description) {
          const mentionedUserIds = extractMentionUserIds(description);

          if (mentionedUserIds.length > 0) {
            try {
              await axios.post("/api/mentions", {
                userIds: mentionedUserIds,
                sourceType: "task",
                sourceId: task.id,
                content: `mentioned you in a task: "${task.title.length > 100 ? task.title.substring(0, 97) + '...' : task.title}"`
              });
            } catch (error) {
              console.error("Failed to process mentions:", error);
              // Don't block UI if mentions fail
            }
          }
        }

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
    if (!task) return;

    setSavingStatus(true);
    try {
      // If task has a column, update the column ID based on the status
      if (task.column) {
        // Update the status and column together
        await saveTaskField('status', status);
      } else {
        // Just update the status directly
        await saveTaskField('status', status);
      }
    } catch (error) {
      console.error("Error updating status:", error);
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
      // Set default statuses in case there's no board attached
      const defaultStatuses = ["TO DO", "IN PROGRESS", "REVIEW", "DONE"];

      // First try task's own board ID, then fall back to boardId prop if available
      const effectiveBoardId = task.taskBoard?.id || boardId;

      // Only fetch statuses if we have a valid board ID
      if (effectiveBoardId) {
        // Fetch statuses (columns) for the board
        const columnsResponse = await fetch(`/api/tasks/boards/${effectiveBoardId}/columns`);
        if (columnsResponse.ok) {
          const columnsData = await columnsResponse.json();
          setStatuses(columnsData.map((col: any) => col.name));
        } else {
          // Fall back to default statuses if request fails
          console.warn("Failed to fetch board columns, using default statuses");
          setStatuses(defaultStatuses);
        }
      } else {
        // If no board ID, use default statuses
        console.info("No task board ID available, using default statuses");
        setStatuses(defaultStatuses);
      }
    } catch (error) {
      console.error("Error loading field options:", error);
      // Set default statuses in case of error
      setStatuses(["TO DO", "IN PROGRESS", "REVIEW", "DONE"]);
    }
  }, [task, boardId]);

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
      // Fetch activities and playtime when task initially loads as well
      // This is now handled by the other useEffect listening to task.id and onRefresh
    }
  }, [task, boardId]);

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

  const renderActivityItem = (activity: TaskActivity) => {
    let actionText = activity.action.replace("TASK_", "").replace(/_/g, " ").toLowerCase();
    if (actionText.startsWith("play ")) actionText = actionText.substring(5);
    else if (actionText === "commented on") actionText = "commented on"; // Keep specific phrases
    else actionText = actionText.replace("play", "timer"); // Generalize "play" to "timer"

    const activityTime = formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true });

    return (
      <div key={activity.id} className="flex items-start space-x-3 py-3 border-b border-border/30 last:border-b-0">
        <CustomAvatar user={activity.user} size="sm" />
        <div className="text-sm">
          <p>
            <span className="font-semibold">{activity.user.name || "Unknown User"}</span>
            <span className="text-muted-foreground"> {actionText} this task</span>
          </p>
          <p className="text-xs text-muted-foreground/80">{activityTime}</p>
        </div>
      </div>
    );
  };

  return (
    <div className="pt-6 space-y-8">
      {showHeader && (
        <div className="space-y-4 bg-gradient-to-r from-background to-muted/30 p-6 rounded-xl border border-border/50 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2 flex-1">
              {editingTitle ? (
                <div className="flex flex-col gap-2 w-full">
                  <div className="relative">
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
                      disabled={savingTitle}
                    />
                    {savingTitle && (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-md">
                        <Loader2 className="h-5 w-5 animate-spin" />
                      </div>
                    )}
                  </div>
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
              {/* Play/Pause/Stop Controls & Total Playtime - Only show if time tracking is enabled */}
              {settings?.timeTrackingEnabled && (
                <div className="flex items-center gap-1 bg-muted/30 px-2 py-1 rounded-md border border-border/50 shadow-sm">
                {currentPlayState === "stopped" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handlePlayPauseStop("play")}
                    disabled={isTimerLoading || !task?.id || !canControlTimer}
                    className="h-7 w-7 p-0 hover:bg-green-500/10 text-green-600 hover:text-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Start Timer"
                  >
                    {isTimerLoading && currentPlayState === "stopped" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  </Button>
                )}
                {currentPlayState === "playing" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handlePlayPauseStop("pause")}
                    disabled={isTimerLoading || !task?.id || !canControlTimer}
                    className="h-7 w-7 p-0 hover:bg-amber-500/10 text-amber-600 hover:text-amber-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Pause Timer"
                  >
                    {isTimerLoading && currentPlayState === "playing" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />}
                  </Button>
                )}
                {currentPlayState === "paused" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handlePlayPauseStop("play")}
                    disabled={isTimerLoading || !task?.id || !canControlTimer}
                    className="h-7 w-7 p-0 hover:bg-green-500/10 text-green-600 hover:text-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Resume Timer"
                  >
                    {isTimerLoading && currentPlayState === "paused" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  </Button>
                )}
                {(currentPlayState === "playing" || currentPlayState === "paused") && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handlePlayPauseStop("stop")}
                    disabled={isTimerLoading || !task?.id || !canControlTimer}
                    className="h-7 w-7 p-0 hover:bg-red-500/10 text-red-600 hover:text-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Stop Timer"
                  >
                    {isTimerLoading && (currentPlayState === "playing" || currentPlayState === "paused") ? <Loader2 className="h-4 w-4 animate-spin" /> : <StopCircle className="h-4 w-4" />}
                  </Button>
                )}

                <div className="border-l h-5 border-border/70 mx-1"></div>

                {isLoadingPlayTime ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : userStatus?.currentTaskId === task?.id && userStatus?.currentTaskPlayState === "playing" ? (
                  <div className="text-xs font-medium text-muted-foreground flex items-center gap-1 pl-1" title={`Total time spent (live): ${liveTimeDisplay || totalPlayTime?.formattedTime || '0h 0m 0s'}`}>
                     <Clock className="h-3.5 w-3.5 text-green-500"/> 
                     <span className="text-green-500 font-semibold">{liveTimeDisplay || totalPlayTime?.formattedTime || '0h 0m 0s'}</span>
                  </div>
                ) : totalPlayTime ? (
                  <div className="text-xs font-medium text-muted-foreground flex items-center gap-1 pl-1" title={`Total time spent: ${totalPlayTime.formattedTime}`}>
                     <Clock className="h-3.5 w-3.5"/> 
                     <span>{totalPlayTime.formattedTime}</span>
                  </div>
                ) : (
                   <div className="text-xs font-medium text-muted-foreground/60 flex items-center gap-1 pl-1" title="No time logged yet">
                     <Clock className="h-3.5 w-3.5"/> 
                     <span>0h 0m 0s</span>
                  </div>
                )}
              </div>
              )}

              <div className="relative">
                <Select
                  value={task.type}
                  onValueChange={handleTypeChange}
                  disabled={savingType}
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
                {savingType && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-md">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                )}
              </div>

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
                    <div className="relative">
                      <div className={savingDescription ? "opacity-50 pointer-events-none" : ""}>
                        <MarkdownEditor
                          initialValue={description}
                          onChange={handleDescriptionChange}
                          placeholder="Add a description..."
                          minHeight="150px"
                          maxHeight="400px"
                          onAiImprove={handleAiImproveDescription}
                        />
                      </div>
                      {savingDescription && (
                        <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-md">
                          <Loader2 className="h-5 w-5 animate-spin" />
                        </div>
                      )}
                    </div>
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
                      <MarkdownContent content={task.description} htmlContent={task.description} />
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
                initialComments={comments}
                currentUserId={currentUserId || ""}
              />
            </CardContent>
          </Card>

          {/* Task Helpers Section */}
          <TaskHelpersSection
            taskId={task.id}
            assigneeId={task.assignee?.id}
            reporterId={task.reporter?.id || ""}
            currentUserId={currentUserId}
            onRefresh={onRefresh}
          />
          {/* Task Activities Section */}
          <Card className="overflow-hidden border-border/50 transition-all hover:shadow-md">
            <CardHeader className="py-3 bg-muted/30 border-b flex flex-row items-center gap-2">
              <History className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-md">Activity</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {isLoadingActivities ? (
                <div className="p-6 text-center text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin inline mr-2" />
                  Loading activities...
                </div>
              ) : taskActivities.length > 0 ? (
                <div className="divide-y divide-border/30 px-4">
                  {taskActivities.map(renderActivityItem)}
                </div>
              ) : (
                <div className="p-6 text-center text-muted-foreground italic">
                  No activities recorded for this task yet.
                </div>
              )}
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
                <div className="relative">
                  <Select
                    value={task.column?.name || "TO DO"}
                    onValueChange={handleStatusChange}
                    disabled={savingStatus}
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
                  {savingStatus && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-md">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  )}
                </div>
              </div>

              <div>
                <p className="text-sm font-medium mb-1">Priority</p>
                <div className="relative">
                  <Select
                    value={task.priority || "MEDIUM"}
                    onValueChange={handlePriorityChange}
                    disabled={savingPriority}
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
                  {savingPriority && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-md">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  )}
                </div>
              </div>

              <div>
                <p className="text-sm font-medium mb-1">Assignee</p>
                <div className="relative">
                  <AssigneeSelect
                    value={task.assignee?.id}
                    onChange={handleAssigneeChange}
                    workspaceId={task.workspaceId}
                    disabled={savingAssignee}
                  />
                  {savingAssignee && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-md">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  )}
                </div>
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
                <div className="relative">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !dueDate && "text-muted-foreground"
                        )}
                        disabled={savingDueDate}
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
                  {savingDueDate && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-md">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  )}
                </div>
              </div>

              {/* Relations Section */}
              <div className="border-t border-border/50 pt-4 mt-2">
                <h3 className="text-sm font-medium mb-3">Relations</h3>

                {/* Milestone */}
                <div className="mb-3">
                  <p className="text-xs font-medium mb-1 text-muted-foreground">Milestone</p>
                  {task.milestone ? (
                    <Link href={`/milestones/${task.milestoneId}`} className="flex items-center gap-2 text-sm p-2 bg-muted/20 rounded-md hover:bg-muted/30 transition-colors">
                      <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">
                        Milestone
                      </Badge>
                      <span>{task.milestone.title}</span>
                    </Link>
                  ) : (
                    <div className="text-xs text-muted-foreground p-1">
                      No milestone linked
                    </div>
                  )}
                </div>

                {/* Epic */}
                <div className="mb-3">
                  <p className="text-xs font-medium mb-1 text-muted-foreground">Epic</p>
                  {task.epic ? (
                    <Link href={`/epics/${task.epicId}`} className="flex items-center gap-2 text-sm p-2 bg-muted/20 rounded-md hover:bg-muted/30 transition-colors">
                      <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                        Epic
                      </Badge>
                      <span>{task.epic.title}</span>
                    </Link>
                  ) : (
                    <div className="text-xs text-muted-foreground p-1">
                      No epic linked
                    </div>
                  )}
                </div>

                {/* Story */}
                <div className="mb-3">
                  <p className="text-xs font-medium mb-1 text-muted-foreground">Story</p>
                  {task.story ? (
                    <Link href={`/stories/${task.storyId}`} className="flex items-center gap-2 text-sm p-2 bg-muted/20 rounded-md hover:bg-muted/30 transition-colors">
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                        Story
                      </Badge>
                      <span>{task.story.title}</span>
                    </Link>
                  ) : (
                    <div className="text-xs text-muted-foreground p-1">
                      No story linked
                    </div>
                  )}
                </div>

                {/* Parent Task */}
                <div className="mb-3">
                  <p className="text-xs font-medium mb-1 text-muted-foreground">Parent Task</p>
                  {task.parentTask ? (
                    <Link href={`/tasks/${task.parentTaskId}`} className="flex items-center gap-2 text-sm p-2 bg-muted/20 rounded-md hover:bg-muted/30 transition-colors">
                      <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">
                        {task.parentTask.issueKey || 'Task'}
                      </Badge>
                      <span>{task.parentTask.title}</span>
                    </Link>
                  ) : (
                    <div className="text-xs text-muted-foreground p-1">
                      No parent task
                    </div>
                  )}
                </div>

                {/* Subtasks */}
                {task.subtasks && task.subtasks.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs font-medium mb-1 text-muted-foreground">Subtasks</p>
                    <ul className="space-y-2">
                      {task.subtasks.map((subtask) => (
                        <li key={subtask.id}>
                          <Link href={`/tasks/${subtask.id}`} className="flex items-center justify-between text-sm p-2 bg-muted/20 rounded-md hover:bg-muted/30 transition-colors">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">
                                {subtask.issueKey || 'Task'}
                              </Badge>
                              <span className="truncate">{subtask.title}</span>
                            </div>
                            <Badge className={`${subtask.status === 'DONE' ? 'bg-green-500' :
                                subtask.status === 'IN PROGRESS' ? 'bg-blue-500' :
                                  'bg-gray-500'
                              } text-white flex-shrink-0 ml-1`}>
                              {subtask.status}
                            </Badge>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Create Subtask Button */}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-2"
                  onClick={() => {
                    // Open task creation modal with parent task ID prefilled
                    setSubtaskFormOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Create Subtask
                </Button>
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

      {/* Subtask Creation Modal */}
      {subtaskFormOpen && (
        <CreateTaskForm
          isOpen={subtaskFormOpen}
          onClose={() => setSubtaskFormOpen(false)}
          initialData={{
            parentTaskId: task.id,
            taskBoardId: task.taskBoard?.id || "",
          }}
        />
      )}
    </div>
  );
} 