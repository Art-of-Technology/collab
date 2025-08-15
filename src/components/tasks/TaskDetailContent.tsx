/* eslint-disable */
"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow, format } from "date-fns";
import { Loader2, Check, X, PenLine, Calendar as CalendarIcon, Plus, Play, Pause, StopCircle, History, Clock, Copy, Trash2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { ShareButton } from "@/components/tasks/ShareButton";
import { TaskFollowButton } from "@/components/tasks/TaskFollowButton";
import { CustomAvatar } from "@/components/ui/custom-avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MarkdownEditor, type MarkdownEditorRef } from "@/components/ui/markdown-editor";
import { useToast } from "@/hooks/use-toast";
import { useTasks } from "@/context/TasksContext";
import { useActivity } from "@/context/ActivityContext";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import React from "react";
import { AssigneeSelect } from "./selectors/AssigneeSelect";
import { ReporterSelect } from "./selectors/ReporterSelect";
import { LabelSelector } from "@/components/ui/label-selector";
import CreateTaskForm from "@/components/tasks/CreateTaskForm";
import { extractMentionUserIds } from "@/utils/mentions";
import axios from "axios";
import { useSession } from "next-auth/react";
import { useWorkspaceSettings } from "@/hooks/useWorkspaceSettings";
import { useUpdateTask } from "@/hooks/queries/useTask";
import { StatusSelect } from "./selectors/StatusSelect";
import { useWorkspace } from "@/context/WorkspaceContext";
import { TimeAdjustmentModal } from "@/components/tasks/TimeAdjustmentModal";
import { TaskTabs } from "@/components/tasks/TaskTabs";
import { useQueryClient } from "@tanstack/react-query";
import { boardItemsKeys } from "@/hooks/queries/useBoardItems";
import { taskKeys } from "@/hooks/queries/useTask";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

// Import types and utilities
import type {
  Task,
  TaskComment as TaskCommentType,
  TaskActivity,
  PlayTime,
  PlayState,
  TaskDetailContentProps
} from "@/types/task";
import { formatDate, formatLiveTime, getPriorityBadge, getTypeBadge } from "@/utils/taskHelpers";

export function TaskDetailContent({
  task,
  error,
  onRefresh,
  showHeader = true,
  onClose,
  boardId,
}: TaskDetailContentProps) {
  const queryClient = useQueryClient();
  const { currentWorkspace } = useWorkspace();
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
  const [savingReporter, setSavingReporter] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingPriority, setSavingPriority] = useState(false);
  const [savingType, setSavingType] = useState(false);
  const [savingDueDate, setSavingDueDate] = useState(false);
  const [savingLabels, setSavingLabels] = useState(false);
  const [dueDate, setDueDate] = useState<Date | undefined>(task?.dueDate);
  const [comments, setComments] = useState<TaskCommentType[]>(task?.comments || []);
  const { toast } = useToast();
  const { refreshBoards } = useTasks();
  const { handleTaskAction, userStatus } = useActivity();
  const [subtaskFormOpen, setSubtaskFormOpen] = useState(false);

  // New state variables for play/pause feature
  const [totalPlayTime, setTotalPlayTime] = useState<PlayTime | null>(null);
  const [isTimerLoading, setIsTimerLoading] = useState(false);
  const [isLoadingPlayTime, setIsLoadingPlayTime] = useState(false);
  const [liveTimeDisplay, setLiveTimeDisplay] = useState<string | null>(null);
  const [showTimeAdjustmentModal, setShowTimeAdjustmentModal] = useState(false);
  const [timeAdjustmentData, setTimeAdjustmentData] = useState<{
    taskId: string;
    taskTitle: string;
    sessionDurationMs: number;
    totalDurationMs: number;
  } | null>(null);

  // Helper modal state
  const [showHelperModal, setShowHelperModal] = useState(false);
  
  // Delete task state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Ref for markdown editor to handle cancel
  const markdownEditorRef = useRef<MarkdownEditorRef>(null);

  // Copy to clipboard function
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copied",
        description: `${text} copied to clipboard`,
      });
    } catch (err) {
      console.error('Failed to copy: ', err);
      toast({
        title: "Error",
        description: "Failed to copy to clipboard",
        variant: "destructive",
      });
    }
  };

  // Use TanStack Query mutation
  const updateTaskMutation = useUpdateTask(task?.id || "");
  const canControlTimer = useMemo(() => {
    if (!task || !currentUserId) return false;
    // Allow assignee, reporter, or any user to control their own timer
    // Individual timer control is now per-user based
    return true;
  }, [task, currentUserId]);

  // Get current play state from user activity status
  const currentPlayState: PlayState = useMemo(() => {
    if (!userStatus || !task?.id) return "stopped";
    
    const isMyTask = userStatus.currentTaskId === task.id;
    if (!isMyTask) return "stopped";
    
    return userStatus.currentTaskPlayState || "stopped";
  }, [userStatus?.currentTaskId, userStatus?.currentTaskPlayState, task?.id]);

  // Update title state when task changes
  useEffect(() => {
    if (task?.title) {
      setTitle(task.title);
    }
  }, [task?.title]);

  // Update description state when task changes
  useEffect(() => {
    if (task?.description) {
      setDescription(task.description);
    }
  }, [task?.description]);

  // Update due date state when task changes
  useEffect(() => {
    setDueDate(task?.dueDate);
  }, [task?.dueDate]);

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
    // Only update local state, don't trigger save until user clicks Save button
    setDescription(md);
  }, []);



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

  // Fetch playtime when task ID changes or onRefresh is called
  useEffect(() => {
    if (task?.id) {
      fetchTotalPlayTime();
    }
  }, [task?.id, fetchTotalPlayTime, onRefresh]); // Added onRefresh to dependencies

  const handlePlayPauseStop = async (action: "play" | "pause" | "stop") => {
    if (!task?.id) return;

    // Check if user is assigned to this task before starting
    if (action === "play") {
      const isAssignedToMe = task.assignee?.id === currentUserId;
      
      if (!isAssignedToMe) {
        // User is not assigned, show helper modal
        setShowHelperModal(true);
        return;
      }
    }

    // Check for long session before stopping
    if (action === "stop" && userStatus?.statusStartedAt && userStatus?.currentTaskId === task.id) {
      const sessionStart = new Date(userStatus.statusStartedAt);
      const sessionDurationMs = Date.now() - sessionStart.getTime();
      const twentyFourHoursMs = 24 * 60 * 60 * 1000;

      if (sessionDurationMs > twentyFourHoursMs) {
        // Get total time before stopping
        const currentTotalMs = totalPlayTime?.totalTimeMs || 0;
        const finalTotalMs = currentTotalMs + sessionDurationMs;

        setTimeAdjustmentData({
          taskId: task.id,
          taskTitle: task.title,
          sessionDurationMs,
          totalDurationMs: finalTotalMs,
        });
        setShowTimeAdjustmentModal(true);
        return; // Don't proceed with stop until user decides
      }
    }

    setIsTimerLoading(true);
    try {
      // Use the ActivityContext for proper state management
      await handleTaskAction(action, task.id);

      // Fetch local data directly. These will update relevant states and UI parts.
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

  const handleTimeAdjustmentCancel = () => {
    // Don't stop the task, just close the modal
    setShowTimeAdjustmentModal(false);
    setTimeAdjustmentData(null);
  };

  const handleTimeAdjusted = async () => {
    // Stop the task after adjustment
    if (task?.id) {
      setIsTimerLoading(true);
      try {
        await handleTaskAction("stop", task.id);
        await fetchTotalPlayTime();
        refreshBoards();
      } catch (err: any) {
        console.error("Error stopping task after adjustment:", err);
      } finally {
        setIsTimerLoading(false);
      }
    }
    setShowTimeAdjustmentModal(false);
    setTimeAdjustmentData(null);
  };

  const handleHelperConfirm = async () => {
    if (!task?.id) return;

    try {
      // First, send help request
      const helpResponse = await fetch(`/api/tasks/${task.id}/request-help`, {
        method: 'POST',
      });

      if (!helpResponse.ok) {
        const error = await helpResponse.json();
        throw new Error(error.message || 'Failed to request help');
      }

      const helpData = await helpResponse.json();

      // Then, start working on the task as a helper
      setIsTimerLoading(true);
      await handleTaskAction("play", task.id);

      if (helpData.status === "approved") {
        toast({
          title: "Started as Helper",
          description: "You are already approved! Timer started and your time will be tracked separately.",
        });
      } else {
        toast({
          title: "Started as Helper",
          description: "Help request sent and timer started. Your time will be tracked separately.",
        });
      }

      setShowHelperModal(false);
      await fetchTotalPlayTime();
      refreshBoards();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to start as helper",
        variant: "destructive",
      });
    } finally {
      setIsTimerLoading(false);
    }
  };

  const handleHelperCancel = () => {
    setShowHelperModal(false);
  };

  const handleDeleteTask = async () => {
    if (!task?.id || isDeleting) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete task');
      }

      // Invalidate queries so taskboard and lists update immediately
      try {
        const resolvedBoardId = (boardId || task.taskBoard?.id || "");
        if (resolvedBoardId) {
          queryClient.invalidateQueries({ queryKey: boardItemsKeys.board(resolvedBoardId) });
          queryClient.invalidateQueries({ queryKey: taskKeys.board(resolvedBoardId) });
        }
        if (task.workspaceId) {
          queryClient.invalidateQueries({ queryKey: taskKeys.list(task.workspaceId) });
        }
        queryClient.invalidateQueries({ queryKey: taskKeys.detail(task.id) });
        queryClient.invalidateQueries({ queryKey: ['assignedTasks'] });
      } catch (e) {
        // No-op; invalidation best-effort
      }

      toast({
        title: "Task deleted",
        description: "The task has been successfully deleted.",
      });

      // Close modal and refresh data
      setShowDeleteModal(false);
      onClose?.();

    } catch (error) {
      console.error('Error deleting task:', error);
      toast({
        title: "Error",
        description: "Failed to delete task. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
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
      await updateTaskMutation.mutateAsync({ [field]: value });

      toast({
        title: 'Updated',
        description: `Task ${field} updated successfully`,
      });

      // Update local state to prevent UI flicker
      if (field === 'title') {
        setTitle(value);
      } else if (field === 'description') {
        setDescription(value || "");
      } else if (field === 'dueDate') {
        setDueDate(value);
      }

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

  // Handle description change (now just for mention processing)
  const handleDescriptionSave = useCallback(async (finalDescription: string) => {
    if (task?.id && finalDescription) {
      const mentionedUserIds = extractMentionUserIds(finalDescription);

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
  }, [task?.id, task?.title]);

  // Handle assignee change
  const handleAssigneeChange = async (userId: string) => {
    setSavingAssignee(true);
    try {
      await updateTaskMutation.mutateAsync({ assigneeId: userId === 'unassigned' ? null : userId });
      toast({
        title: 'Updated',
        description: 'Task assignee updated successfully',
      });
    } catch (error) {
      console.error('Error updating assignee:', error);
      toast({
        title: 'Error',
        description: 'Failed to update assignee',
        variant: 'destructive',
      });
    } finally {
      setSavingAssignee(false);
    }
  };

  // Handle reporter change
  const handleReporterChange = async (userId: string) => {
    setSavingReporter(true);
    try {
      await updateTaskMutation.mutateAsync({ reporterId: userId === 'none' ? null : userId });
      toast({
        title: 'Updated',
        description: 'Task reporter updated successfully',
      });
    } catch (error) {
      console.error('Error updating reporter:', error);
      toast({
        title: 'Error',
        description: 'Failed to update reporter',
        variant: 'destructive',
      });
    } finally {
      setSavingReporter(false);
    }
  };

  // Handle status change
  const handleStatusChange = async (status: string) => {
    setSavingStatus(true);
    try {
      await updateTaskMutation.mutateAsync({ status });
      toast({
        title: 'Updated',
        description: 'Task status updated successfully',
      });
    } catch (error) {
      console.error('Error updating status:', error);
      toast({
        title: 'Error',
        description: 'Failed to update status',
        variant: 'destructive',
      });
    } finally {
      setSavingStatus(false);
    }
  };

  // Handle priority change
  const handlePriorityChange = async (priority: string) => {
    setSavingPriority(true);
    try {
      await updateTaskMutation.mutateAsync({ priority: priority as "LOW" | "MEDIUM" | "HIGH" });
      toast({
        title: 'Updated',
        description: 'Task priority updated successfully',
      });
    } catch (error) {
      console.error('Error updating priority:', error);
      toast({
        title: 'Error',
        description: 'Failed to update priority',
        variant: 'destructive',
      });
    } finally {
      setSavingPriority(false);
    }
  };

  // Handle type change
  const handleTypeChange = async (type: string) => {
    setSavingType(true);
    try {
      await updateTaskMutation.mutateAsync({ type });
      toast({
        title: 'Updated',
        description: 'Task type updated successfully',
      });
    } catch (error) {
      console.error('Error updating type:', error);
      toast({
        title: 'Error',
        description: 'Failed to update type',
        variant: 'destructive',
      });
    } finally {
      setSavingType(false);
    }
  };

  // Handle due date change
  const handleDueDateChange = async (date: Date | undefined) => {
    setDueDate(date);
    setSavingDueDate(true);
    try {
      await updateTaskMutation.mutateAsync({ dueDate: date });
      toast({
        title: 'Updated',
        description: 'Task due date updated successfully',
      });
    } catch (error) {
      console.error('Error updating due date:', error);
      toast({
        title: 'Error',
        description: 'Failed to update due date',
        variant: 'destructive',
      });
    } finally {
      setSavingDueDate(false);
    }
  };

  // Handle labels change
  const handleLabelsChange = async (labelIds: string[]) => {
    setSavingLabels(true);
    try {
      await updateTaskMutation.mutateAsync({ labels: labelIds });
      toast({
        title: 'Updated',
        description: 'Task labels updated successfully',
      });
    } catch (error) {
      console.error('Error updating labels:', error);
      toast({
        title: 'Error',
        description: 'Failed to update labels',
        variant: 'destructive',
      });
    } finally {
      setSavingLabels(false);
    }
  };







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
    <div className="pt-3 sm:pt-6 space-y-4 sm:space-y-8">
      {showHeader && (
        <div className="space-y-4 bg-gradient-to-r from-background to-muted/30 p-3 sm:p-6 rounded-xl border border-border/50 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div className="space-y-2 flex-1">
              {editingTitle ? (
                <div className="flex flex-col gap-2 w-full">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                    <div
                      className="group relative font-mono px-2 sm:px-3 py-1.5 text-xs sm:text-sm bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/20 text-primary/80 cursor-pointer hover:bg-gradient-to-r hover:from-primary/10 hover:to-primary/15 hover:border-primary/40 hover:text-primary transition-all duration-200 rounded-lg flex items-center h-7 sm:h-8 shadow-sm hover:shadow-md overflow-hidden w-fit"
                      onClick={() => copyToClipboard(task.issueKey || '')}
                      title="Click to copy"
                    >
                      <span className="font-semibold tracking-wide whitespace-nowrap">{task.issueKey}</span>
                      <Copy className="h-3 sm:h-3.5 ml-0 group-hover:ml-2 opacity-0 group-hover:opacity-100 transition-all duration-200 text-primary/60 w-0 group-hover:w-3 sm:group-hover:w-3.5" />
                    </div>
                    <div className="relative flex-1">
                      <Input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="text-lg sm:text-2xl font-bold py-2 px-2 sm:px-3 h-auto border-primary/20 focus-visible:ring-primary/30"
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
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                  <div
                    className="group relative font-mono px-2 sm:px-3 py-1.5 text-xs sm:text-sm bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/20 text-primary/80 cursor-pointer hover:bg-gradient-to-r hover:from-primary/10 hover:to-primary/15 hover:border-primary/40 hover:text-primary transition-all duration-200 rounded-lg flex items-center h-7 sm:h-8 shadow-sm hover:shadow-md overflow-hidden w-fit"
                    onClick={() => copyToClipboard(task.issueKey || '')}
                    title="Click to copy"
                  >
                    <span className="font-semibold tracking-wide whitespace-nowrap">{task.issueKey}</span>
                    <Copy className="h-3 sm:h-3.5 ml-0 group-hover:ml-2 opacity-0 group-hover:opacity-100 transition-all duration-200 text-primary/60 w-0 group-hover:w-3 sm:group-hover:w-3.5" />
                  </div>
                  <div
                    className="group relative cursor-pointer flex-1"
                    onClick={() => setEditingTitle(true)}
                  >
                    <h1 className="text-xl sm:text-2xl font-bold group-hover:text-primary transition-colors pr-6 sm:pr-8">
                      {task.title}
                    </h1>
                    <PenLine className="h-3.5 sm:h-4 w-3.5 sm:w-4 absolute right-0 top-1 sm:top-2 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground group-hover:text-primary" />
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
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

            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              {/* Play/Pause/Stop Controls & Total Playtime - Only show if time tracking is enabled */}
              {settings?.timeTrackingEnabled && (
                <div className="flex items-center gap-1 bg-muted/30 px-1.5 sm:px-2 py-1 rounded-md border border-border/50 shadow-sm">
                  {currentPlayState === "stopped" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handlePlayPauseStop("play")}
                      disabled={isTimerLoading || !task?.id || !canControlTimer}
                      className="h-7 w-7 p-0 hover:bg-green-500/10 text-green-600 hover:text-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Start Timer"
                    >
                      {isTimerLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
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
                      {isTimerLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />}
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
                      {isTimerLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
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
                      {isTimerLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <StopCircle className="h-4 w-4" />}
                    </Button>
                  )}

                  <div className="border-l h-5 border-border/70 mx-1"></div>

                  {isLoadingPlayTime ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : userStatus?.currentTaskId === task?.id && userStatus?.currentTaskPlayState === "playing" ? (
                    <div className="text-xs font-medium text-muted-foreground flex items-center gap-1 pl-1" title={`Total time spent (live): ${liveTimeDisplay || totalPlayTime?.formattedTime || '0h 0m 0s'}`}>
                      <Clock className="h-3.5 w-3.5 text-green-500" />
                      <span className="text-green-500 font-semibold">{liveTimeDisplay || totalPlayTime?.formattedTime || '0h 0m 0s'}</span>
                    </div>
                  ) : totalPlayTime ? (
                    <div className="text-xs font-medium text-muted-foreground flex items-center gap-1 pl-1" title={`Total time spent: ${totalPlayTime.formattedTime}`}>
                      <Clock className="h-3.5 w-3.5" />
                      <span>{totalPlayTime.formattedTime}</span>
                    </div>
                  ) : (
                    <div className="text-xs font-medium text-muted-foreground/60 flex items-center gap-1 pl-1" title="No time logged yet">
                      <Clock className="h-3.5 w-3.5" />
                      <span>0h 0m 0s</span>
                    </div>
                  )}
                </div>
              )}
              {/* Task Type Select */}
              <div className="relative">
                <Select
                  value={task.type}
                  onValueChange={handleTypeChange}
                  disabled={savingType}
                >
                  <SelectTrigger className="min-w-[100px] sm:min-w-[130px] h-9 sm:h-10 border-dashed hover:border-primary hover:text-primary transition-colors">
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
              
              {/* Task Follow Button */}
              <TaskFollowButton taskId={task.id} boardId={boardId} />
              
              {/* Share Button */}
              <ShareButton entityId={task.id} issueKey={task.issueKey || ""} entityType="tasks" />
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 sm:gap-6">
        <div className="lg:col-span-3 space-y-4 sm:space-y-6">
          <Card className="overflow-hidden border-border/50 transition-all hover:shadow-md">
            <CardHeader className="flex flex-row items-center justify-between py-3 bg-muted/30 border-b">
              <CardTitle className="text-md">Description</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditingDescription(!editingDescription)}
                className="h-8 w-8 p-0 rounded-full"
              >
                <PenLine className="h-3.5 w-3.5" />
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div>
                {editingDescription ? (

                  <div className="p-4">
                    <MarkdownEditor
                      ref={markdownEditorRef}
                      onChange={handleDescriptionChange}
                      placeholder="Add a description..."
                      minHeight="150px"
                      maxHeight="400px"
                      onAiImprove={handleAiImproveDescription}
                       content={task.description || ''}
                      collabDocumentId={`task:${task.id}:description`}
                      key={`edit-${task.id}`}
                    />
                    <div className="mt-3 flex gap-2">

                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          // Broadcast reset to collaborators by restoring last persisted description
                          const original = task.description || '';
                          markdownEditorRef.current?.resetTo?.(original);
                          setEditingDescription(false);
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={async () => {
                          // Save button: take current editor HTML and persist it via existing mutation
                          const html = markdownEditorRef.current?.getContent() || '';
                          const ok = await saveTaskField('description', html);
                          if (ok) {
                            setEditingDescription(false);
                            await handleDescriptionSave(html);
                          }
                        }}
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                ) : (

                  <div className="p-4 min-h-[120px]">

                    {task.description ? (
                      <MarkdownEditor
                        readOnly
                        className="border-0"
                        content={task.description || ''}
                        minHeight="120px"
                        maxHeight="100%"
                      />
                    ) : (
                      <div
                        className="flex items-center justify-center h-[100px] text-muted-foreground border border-dashed rounded-md bg-muted/5 cursor-pointer"
                        onClick={() => setEditingDescription(true)}
                      >
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

          {/* Task Tabs Section */}
          <TaskTabs
            taskId={task.id}
            initialComments={comments}
            currentUserId={currentUserId || ""}
            assigneeId={task.assignee?.id}
            reporterId={task.reporter?.id || ""}
            taskData={task}
            onRefresh={() => {
              fetchTotalPlayTime();
              onRefresh();
            }}
          />
        </div>

        <div className="space-y-4 sm:space-y-6 min-w-0">
          <Card className="overflow-hidden border-border/50 transition-all hover:shadow-md min-w-0">
            <CardHeader className="py-3 bg-muted/30 border-b">
              <CardTitle className="text-md">Details</CardTitle>
            </CardHeader>
            <CardContent className="p-3 sm:p-4 space-y-3 sm:space-y-4">
              <div>
                <p className="text-sm font-medium mb-1">Status</p>
                <div className="relative">
                  <StatusSelect
                    value={task.status || task.column?.name}
                    onValueChange={handleStatusChange}
                    boardId={boardId || task.taskBoard?.id || ""}
                    disabled={savingStatus}
                  />
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
                    <SelectTrigger className="w-full pl-1">
                      <SelectValue>
                        {getPriorityBadge(task.priority || "MEDIUM")}
                      </SelectValue>
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
                <div className="relative">
                  <ReporterSelect
                    value={task.reporter?.id}
                    onChange={handleReporterChange}
                    workspaceId={task.workspaceId}
                    disabled={savingReporter}
                  />
                  {savingReporter && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-md">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
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
                          "w-full justify-start text-left font-normal min-w-0",
                          !dueDate && "text-muted-foreground"
                        )}
                        disabled={savingDueDate}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4 flex-shrink-0" />
                        <span className="truncate">
                          {dueDate ? format(dueDate, "MMM d, yyyy") : "Set due date"}
                        </span>
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

              <div>
                <p className="text-sm font-medium mb-1">Labels</p>
                <div className="relative">
                  <LabelSelector
                    value={task.labels.map(label => label.id)}
                    onChange={handleLabelsChange}
                    workspaceId={task.workspaceId}
                    disabled={savingLabels}
                  />
                  {savingLabels && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-md">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  )}
                </div>
              </div>

              {/* Delete Task Section */}
              <div className="pt-4 border-t">
                <p className="text-sm font-medium mb-2">Danger Zone</p>
                <Button
                  onClick={() => setShowDeleteModal(true)}
                  variant="destructive"
                  size="sm"
                  className="w-full gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete Task
                </Button>
                <p className="text-xs text-muted-foreground mt-1">
                  This action cannot be undone
                </p>
              </div>

            </CardContent>
          </Card>

          {task.attachments && task.attachments.length > 0 && (
            <Card className="overflow-hidden border-border/50 transition-all hover:shadow-md min-w-0">
              <CardHeader className="py-3 bg-muted/30 border-b">
                <CardTitle className="text-md">Attachments</CardTitle>
              </CardHeader>
              <CardContent className="p-3 sm:p-4">
                <ul className="space-y-1.5 sm:space-y-2">
                  {task.attachments.map((attachment) => (
                    <li key={attachment.id}>
                      <Link
                        href={attachment.url}
                        target="_blank"
                        className="text-sm text-primary hover:underline flex items-center gap-1 min-w-0"
                      >
                        <span className="truncate">
                          {attachment.name || "File"}
                        </span>
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

      {/* Helper Confirmation Modal */}
      <Dialog open={showHelperModal} onOpenChange={setShowHelperModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Work as Helper</DialogTitle>
            <DialogDescription>
              You are not assigned to this task. You will be added as a helper and your time will be tracked separately.
              {task?.assignee && (
                <span className="block mt-2 text-sm">
                  This task is assigned to <strong>{task.assignee.name}</strong>.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          
          {task && (
            <div className="py-4">
              <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                <Play className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1">
                  <p className="font-medium text-sm">{task.title}</p>
                  {task.issueKey && (
                    <p className="text-xs text-muted-foreground font-mono">{task.issueKey}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button
              variant="outline"
              onClick={handleHelperCancel}
              disabled={isTimerLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleHelperConfirm}
              disabled={isTimerLoading}
            >
              {isTimerLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Starting...
                </>
              ) : (
                "Yes, Start as Helper"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Time Adjustment Modal */}
      {timeAdjustmentData && (
        <TimeAdjustmentModal
          isOpen={showTimeAdjustmentModal}
          onClose={handleTimeAdjustmentCancel}
          originalDuration={formatLiveTime(timeAdjustmentData.totalDurationMs)}
          originalDurationMs={timeAdjustmentData.totalDurationMs}
          taskTitle={timeAdjustmentData.taskTitle}
          taskId={timeAdjustmentData.taskId}
          onTimeAdjusted={handleTimeAdjusted}
        />
      )}

      {/* Delete Confirmation Modal */}
      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Task</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this task? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          
          {task && (
            <div className="py-4">
              <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                <Trash2 className="h-4 w-4 text-destructive" />
                <div className="flex-1">
                  <p className="font-medium text-sm">{task.title}</p>
                  {task.issueKey && (
                    <p className="text-xs text-muted-foreground font-mono">{task.issueKey}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setShowDeleteModal(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteTask}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Task
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
} 