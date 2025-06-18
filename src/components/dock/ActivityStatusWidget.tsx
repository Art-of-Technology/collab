/* eslint-disable */
"use client";

import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { 
  Play, 
  Pause, 
  StopCircle, 
  Loader2, 
  Coffee, 
  Users, 
  Car, 
  Eye, 
  Search, 
  Moon, 
  CheckCircle,
  ChevronUp,
  Activity,
  Timer,
  X,
  Trash2,
  ExternalLink,
  Settings
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAssignedTasks, TaskOption } from "@/hooks/useAssignedTasks";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useActivity } from "@/context/ActivityContext";
import { useWorkspaceSettings } from "@/hooks/useWorkspaceSettings";
import { cn } from "@/lib/utils";
import { SessionAdjustmentModal } from "@/components/tasks/SessionAdjustmentModal";

interface ActivityStatusWidgetProps {
  className?: string;
}

const STATUS_CONFIGS = {
  WORKING: {
    label: "Working",
    icon: Play,
    color: "bg-green-500",
    textColor: "text-green-400",
    description: "Actively working on a task",
  },
  LUNCH: {
    label: "Lunch",
    icon: Coffee,
    color: "bg-orange-500",
    textColor: "text-orange-400",
    description: "Taking a lunch break",
  },
  BREAK: {
    label: "Break",
    icon: Pause,
    color: "bg-blue-500",
    textColor: "text-blue-400",
    description: "Taking a short break",
  },
  MEETING: {
    label: "Meeting",
    icon: Users,
    color: "bg-purple-500",
    textColor: "text-purple-400",
    description: "In a meeting",
  },
  TRAVEL: {
    label: "Travel",
    icon: Car,
    color: "bg-indigo-500",
    textColor: "text-indigo-400",
    description: "Traveling",
  },
  REVIEW: {
    label: "Review",
    icon: Eye,
    color: "bg-teal-500",
    textColor: "text-teal-400",
    description: "Reviewing work",
  },
  RESEARCH: {
    label: "Research",
    icon: Search,
    color: "bg-cyan-500",
    textColor: "text-cyan-400",
    description: "Researching",
  },
  OFFLINE: {
    label: "Offline",
    icon: Moon,
    color: "bg-gray-500",
    textColor: "text-gray-400",
    description: "Currently offline",
  },
  AVAILABLE: {
    label: "Available",
    icon: CheckCircle,
    color: "bg-green-400",
    textColor: "text-green-400",
    description: "Available for work",
  },
};

const QUICK_ACTIVITIES = [
  { type: "LUNCH_START", label: "Going to Lunch", duration: null, eventType: "LUNCH_START" },
  { type: "BREAK_START", label: "Taking a Break", duration: null, eventType: "BREAK_START" },
  { type: "MEETING_START", label: "In a Meeting", duration: null, eventType: "MEETING_START" },
  { type: "RESEARCH_START", label: "Researching", duration: null, eventType: "RESEARCH_START" },
  { type: "TRAVEL_START", label: "Traveling", duration: null, eventType: "TRAVEL_START" },
  { type: "OFFLINE", label: "Going Offline", duration: null, eventType: "OFFLINE" },
];

export function ActivityStatusWidget({ className }: ActivityStatusWidgetProps) {
  const { data: session } = useSession();
  const { currentWorkspace } = useWorkspace();
  const { settings } = useWorkspaceSettings();
  const { boards, loading: tasksLoading, refetch } = useAssignedTasks(currentWorkspace?.id);
  const { userStatus, isLoading, startActivity, endActivity, handleTaskAction } = useActivity();
  const router = useRouter();
  const [selectedTaskId, setSelectedTaskId] = useState<string>("");
  const [liveTime, setLiveTime] = useState<string | null>(null);
  const [taskTotalTime, setTaskTotalTime] = useState<string>("0h 0m 0s");
  const [taskSearchQuery, setTaskSearchQuery] = useState<string>("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchTasks, setSearchTasks] = useState<TaskOption[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showHelperModal, setShowHelperModal] = useState(false);
  const [selectedTaskForHelper, setSelectedTaskForHelper] = useState<TaskOption | null>(null);
  const [showTimeAdjustmentModal, setShowTimeAdjustmentModal] = useState(false);
  const [timeAdjustmentData, setTimeAdjustmentData] = useState<{
    taskId: string;
    taskTitle: string;
    sessionDurationMs: number;
    totalDurationMs: number;
  } | null>(null);
  const { toast } = useToast();

  // Live timer effect
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;

    if (userStatus?.statusStartedAt) {
      const isTaskWorking = userStatus.currentStatus === "WORKING" && userStatus.currentTaskId && settings?.timeTrackingEnabled;
      const isTaskPlaying = isTaskWorking && userStatus.currentTaskPlayState === "playing";
      
      if (isTaskPlaying) {
        // For playing tasks, count up from total time
        const tick = async () => {
          const start = new Date(userStatus.statusStartedAt);
          const now = new Date();
          const sessionElapsed = now.getTime() - start.getTime();
          
          // Parse total time to milliseconds
          const totalTimeMs = parseDurationToMs(taskTotalTime);
          const currentTotalMs = totalTimeMs + sessionElapsed;
          setLiveTime(formatDuration(currentTotalMs));
        };

        tick(); // Initial update
        intervalId = setInterval(tick, 1000);
      } else if (!isTaskWorking) {
        // For non-task activities, count session time from zero
        const tick = () => {
          const start = new Date(userStatus.statusStartedAt);
          const now = new Date();
          const diff = now.getTime() - start.getTime();
          setLiveTime(formatDuration(diff));
        };

        tick(); // Initial update
        intervalId = setInterval(tick, 1000);
      } else {
        // For paused/stopped tasks, show static total time
        setLiveTime(null);
      }
    } else {
      setLiveTime(null);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [userStatus?.statusStartedAt, userStatus?.currentStatus, userStatus?.currentTaskId, userStatus?.currentTaskPlayState, settings?.timeTrackingEnabled, taskTotalTime]);

  // Helper function to parse duration string to milliseconds
  const parseDurationToMs = (duration: string): number => {
    const regex = /(?:(\d+)d\s*)?(?:(\d+)h\s*)?(?:(\d+)m\s*)?(?:(\d+)s\s*)?/;
    const match = duration.match(regex);
    if (!match) return 0;

    const [, days = "0", hours = "0", minutes = "0", seconds = "0"] = match;
    return (
      parseInt(days) * 24 * 60 * 60 * 1000 +
      parseInt(hours) * 60 * 60 * 1000 +
      parseInt(minutes) * 60 * 1000 +
      parseInt(seconds) * 1000
    );
  };

  // Sync selectedTaskId with userStatus.currentTaskId
  useEffect(() => {
    if (userStatus?.currentStatus === "WORKING" && userStatus.currentTaskId) {
      setSelectedTaskId(userStatus.currentTaskId);
    } else if (userStatus?.currentStatus !== "WORKING") {
      setSelectedTaskId("");
    }
  }, [userStatus?.currentTaskId, userStatus?.currentStatus]);

  // Fetch total time when current task changes
  useEffect(() => {
    if (userStatus?.currentTaskId && settings?.timeTrackingEnabled) {
      fetchTaskTotalTime(userStatus.currentTaskId);
    } else {
      setTaskTotalTime("0h 0m 0s");
    }
  }, [userStatus?.currentTaskId, settings?.timeTrackingEnabled]);

  const formatDuration = (ms: number): string => {
    if (ms < 0) ms = 0;
    const totalSeconds = Math.floor(ms / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;

    if (h > 0) return `${h}h ${m}m ${s}s`;
    return `${m}m ${s}s`;
  };

  // Fetch total play time for a task
  const fetchTaskTotalTime = async (taskId: string) => {
    try {
      const response = await fetch(`/api/tasks/${taskId}/playtime`);
      if (response.ok) {
        const data = await response.json();
        setTaskTotalTime(data.formattedTime || "0h 0m 0s");
        return data.totalPlayTimeMs || 0;
      }
    } catch (error) {
      console.error("Error fetching task total time:", error);
    }
    return 0;
  };

  const handleTaskNavigation = (taskId: string) => {
    if (currentWorkspace?.id) {
      router.push(`/${currentWorkspace.id}/tasks/${taskId}`);
      setIsDropdownOpen(false);
    }
  };

  const handleTaskClick = (task: TaskOption) => {
    const isAssignedToMe = task.assignee?.id === session?.user?.id;
    
    if (isAssignedToMe) {
      // User is assigned to this task, start normally
      handleQuickStartTask(task.id);
    } else {
      // User is not assigned, show helper modal
      setSelectedTaskForHelper(task);
      setShowHelperModal(true);
    }
  };

  const handleQuickStartTask = async (taskId: string) => {
    try {
      await startActivity("TASK_START", taskId);
      setTaskSearchQuery("");
      setIsDropdownOpen(false);
      refetch();
    } catch (error) {
      // Error handling is done in the context
    }
  };

  const handleHelperConfirm = async () => {
    if (!selectedTaskForHelper) return;

    try {
      // First, send help request
      const helpResponse = await fetch(`/api/tasks/${selectedTaskForHelper.id}/request-help`, {
        method: 'POST',
      });

      if (!helpResponse.ok) {
        const error = await helpResponse.json();
        throw new Error(error.message || 'Failed to request help');
      }

      const helpData = await helpResponse.json();

      // Then, start working on the task as a helper
      await startActivity("TASK_START", selectedTaskForHelper.id);

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
      setSelectedTaskForHelper(null);
      refetch();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to start as helper",
        variant: "destructive",
      });
    }
  };

  const handleHelperCancel = () => {
    setShowHelperModal(false);
    setSelectedTaskForHelper(null);
  };

  const handleTimeAdjustmentConfirm = () => {
    // Continue with stopping the task without adjustment
    if (userStatus?.currentTaskId) {
      handleTaskAction("stop", userStatus.currentTaskId);
    }
    setShowTimeAdjustmentModal(false);
    setTimeAdjustmentData(null);
  };

  const handleTimeAdjustmentCancel = () => {
    // Don't stop the task, just close the modal
    setShowTimeAdjustmentModal(false);
    setTimeAdjustmentData(null);
  };

  const handleTimeAdjusted = () => {
    // Stop the task after adjustment
    if (userStatus?.currentTaskId) {
      handleTaskAction("stop", userStatus.currentTaskId);
    }
    setShowTimeAdjustmentModal(false);
    setTimeAdjustmentData(null);
  };

  const handleQuickActivity = async (eventType: string, duration?: number) => {
    try {
      await startActivity(eventType, undefined, duration);
      setIsDropdownOpen(false);
    } catch (error) {
      // Error handling is done in the context
    }
  };

  const handleEndActivity = async () => {
    try {
      await endActivity();
      setSelectedTaskId("");
    } catch (error) {
      // Error handling is done in the context
    }
  };

  const handleTaskControlAction = async (action: "play" | "pause" | "stop") => {
    const taskId = userStatus?.currentTaskId;
    if (!taskId) return;

    // Check for long session before stopping
    if (action === "stop" && userStatus?.statusStartedAt) {
      const sessionStart = new Date(userStatus.statusStartedAt);
      const sessionDurationMs = Date.now() - sessionStart.getTime();
      const twentyFourHoursMs = 1000 * 60 * 60 * 24;

      if (sessionDurationMs > twentyFourHoursMs) {
        // Show session adjustment modal instead of time adjustment modal
        setTimeAdjustmentData({
          taskId,
          taskTitle: userStatus.currentTask?.title || "Task",
          sessionDurationMs,
          totalDurationMs: sessionDurationMs, // For session adjustment, we only care about this session
        });
        setShowTimeAdjustmentModal(true);
        return; // Don't proceed with stop until user decides
      }
    }

    try {
      await handleTaskAction(action, taskId);
      // Refresh the total play time after the action
      await fetchTaskTotalTime(taskId);
    } catch (error) {
      // Error handling is done in the context
    }
  };

  const currentConfig = STATUS_CONFIGS[userStatus?.currentStatus as keyof typeof STATUS_CONFIGS] || STATUS_CONFIGS.AVAILABLE;
  const StatusIcon = currentConfig.icon;

  // Search all tasks in workspace when query changes
  useEffect(() => {
    if (!taskSearchQuery.trim() || !currentWorkspace?.id) {
      setSearchTasks([]);
      return;
    }

    const searchAllTasks = async () => {
      if (!currentWorkspace?.id) {
        console.warn('No current workspace available for search');
        setSearchTasks([]);
        return;
      }

      setIsSearching(true);
      try {
        const response = await fetch(`/api/workspaces/${currentWorkspace.id}/search-tasks?q=${encodeURIComponent(taskSearchQuery)}`);
        if (response.ok) {
          const data = await response.json();
          setSearchTasks(data.tasks || []);
        } else {
          console.error('Search failed:', response.status, response.statusText);
          setSearchTasks([]);
        }
      } catch (error) {
        console.error('Error searching tasks:', error);
        setSearchTasks([]);
      } finally {
        setIsSearching(false);
      }
    };

    const debounceTimer = setTimeout(searchAllTasks, 300);
    return () => clearTimeout(debounceTimer);
  }, [taskSearchQuery, currentWorkspace?.id]);

  // Filter tasks based on search query
  const getFilteredTasks = () => {
    if (!taskSearchQuery.trim()) {
      // Show most recently created tasks assigned to me, fallback to all tasks if none assigned
      const allTasks = boards.flatMap(board => board.tasks);
      const myTasks = allTasks.filter(task => task.assignee?.id === session?.user?.id);
      
      if (myTasks.length > 0) {
        // Sort by most recently created and take top 3
        return myTasks
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 3);
      }
      
      // If no tasks assigned to me, show 3 most recent tasks for search purposes
      return allTasks
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 3);
    }
    
    return searchTasks;
  };

  const getActionButtons = () => {
    if (userStatus?.currentStatus === "WORKING" && userStatus.currentTaskId) {
      // Only show time tracking controls if enabled in workspace settings
      if (!settings?.timeTrackingEnabled) {
        return null;
      }
      
      // Get current play state from user status
      const currentState = userStatus.currentTaskPlayState || "stopped";

      if (currentState === "stopped") {
        return (
          <button
            onClick={() => handleTaskControlAction("play")}
            disabled={isLoading}
            className="h-8 w-8 md:h-10 md:w-10 rounded-full bg-green-500/20 hover:bg-green-500/30 text-green-400 hover:text-green-300 flex items-center justify-center transition-all duration-200 hover:scale-110 disabled:opacity-50 backdrop-blur-sm border border-green-400/30 hover:border-green-300/50 shadow-lg hover:shadow-green-500/25"
          >
            {isLoading ? <Loader2 className="h-3 w-3 md:h-4 md:w-4 animate-spin" /> : <Play className="h-3 w-3 md:h-4 md:w-4 ml-0.5" />}
          </button>
        );
      }

      return (
        <div className="flex items-center gap-1 md:gap-2">
          {currentState === "playing" && (
            <button
              onClick={() => handleTaskControlAction("pause")}
              disabled={isLoading}
              className="h-8 w-8 md:h-10 md:w-10 rounded-full bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 hover:text-amber-300 flex items-center justify-center transition-all duration-200 hover:scale-110 disabled:opacity-50 backdrop-blur-sm border border-amber-400/30 hover:border-amber-300/50 shadow-lg hover:shadow-amber-500/25"
            >
              {isLoading ? <Loader2 className="h-3 w-3 md:h-4 md:w-4 animate-spin" /> : <Pause className="h-3 w-3 md:h-4 md:w-4" />}
            </button>
          )}
          {currentState === "paused" && (
            <button
              onClick={() => handleTaskControlAction("play")}
              disabled={isLoading}
              className="h-8 w-8 md:h-10 md:w-10 rounded-full bg-green-500/20 hover:bg-green-500/30 text-green-400 hover:text-green-300 flex items-center justify-center transition-all duration-200 hover:scale-110 disabled:opacity-50 backdrop-blur-sm border border-green-400/30 hover:border-green-300/50 shadow-lg hover:shadow-green-500/25"
            >
              {isLoading ? <Loader2 className="h-3 w-3 md:h-4 md:w-4 animate-spin" /> : <Play className="h-3 w-3 md:h-4 md:w-4 ml-0.5" />}
            </button>
          )}
          <div className="relative">
            <button
              onClick={() => handleTaskControlAction("stop")}
              disabled={isLoading}
              className="h-8 w-8 md:h-10 md:w-10 rounded-full bg-red-500/20 hover:bg-red-500/30 text-red-400 hover:text-red-300 flex items-center justify-center transition-all duration-200 hover:scale-110 disabled:opacity-50 backdrop-blur-sm border border-red-400/30 hover:border-red-300/50 shadow-lg hover:shadow-red-500/25"
            >
              {isLoading ? <Loader2 className="h-3 w-3 md:h-4 md:w-4 animate-spin" /> : <StopCircle className="h-3 w-3 md:h-4 md:w-4" />}
            </button>
            <button
              onClick={() => {
                if (userStatus?.currentTaskId) {
                  setTimeAdjustmentData({
                    taskId: userStatus.currentTaskId,
                    taskTitle: userStatus.currentTask?.title || "Task",
                    sessionDurationMs: userStatus?.statusStartedAt ? Date.now() - new Date(userStatus.statusStartedAt).getTime() : 0,
                    totalDurationMs: userStatus?.statusStartedAt ? Date.now() - new Date(userStatus.statusStartedAt).getTime() : 0,
                  });
                  setShowTimeAdjustmentModal(true);
                }
              }}
              disabled={isLoading}
              className="absolute -bottom-[10px] -right-[6px] h-4 w-4 rounded-full bg-gray-500/20 hover:bg-gray-500/30 text-gray-400 hover:text-gray-300 flex items-center justify-center transition-all duration-200 hover:scale-110 disabled:opacity-50 backdrop-blur-sm border border-gray-400/30 hover:border-gray-300/50"
              title="Stop with time adjustment"
            >
              <Settings className="h-2 w-2" />
            </button>
          </div>
        </div>
      );
    }

    // For non-task activities, show end activity button
    if (userStatus?.currentStatus !== "AVAILABLE") {
      return (
        <button
          onClick={handleEndActivity}
          disabled={isLoading}
          className="h-8 w-8 md:h-10 md:w-10 rounded-full bg-red-500/20 hover:bg-red-500/30 text-red-400 hover:text-red-300 flex items-center justify-center transition-all duration-200 hover:scale-110 disabled:opacity-50 backdrop-blur-sm border border-red-400/30 hover:border-red-300/50 shadow-lg hover:shadow-red-500/25"
        >
          {isLoading ? <Loader2 className="h-3 w-3 md:h-4 md:w-4 animate-spin" /> : <Trash2 className="h-3 w-3 md:h-4 md:w-4" />}
        </button>
      );
    }

    return null;
  };

  if (isLoading && !userStatus) {
    return (
      <div className={cn("flex items-center gap-2 md:gap-3", className)}>
        <div className="h-4 w-4 md:h-5 md:w-5 rounded-full bg-gray-500 animate-pulse" />
        <span className="text-xs md:text-sm text-white/70">Loading status...</span>
      </div>
    );
  }

  return (
    <>
      <div className={cn("flex items-center gap-2 md:gap-3", className)}>
        {/* Status Indicator */}
        <div className="relative">
          <div className={cn("h-3 w-3 md:h-4 md:w-4 rounded-full", currentConfig.color)} />
          <StatusIcon className="absolute -bottom-0.5 -right-0.5 h-2 w-2 md:h-2.5 md:w-2.5 text-white bg-gray-800 rounded-full p-0.5" />
        </div>

      {/* Main Content */}
      <div className="flex items-center gap-1 md:gap-2">
        {/* Status Display */}
        <div className={settings?.timeTrackingEnabled ? "min-w-[120px] md:min-w-[160px]" : "min-w-[80px] md:min-w-[100px]"}>
          {userStatus?.currentStatus === "WORKING" && userStatus.currentTask && settings?.timeTrackingEnabled ? (
            <div className="space-y-0.5">
              <div className="flex items-center gap-1 md:gap-2">
                <button
                  onClick={() => handleTaskNavigation(userStatus.currentTask!.id)}
                  className="font-mono text-xs text-white/60 hover:text-white/90 hover:underline transition-colors cursor-pointer"
                  title="Click to view full task"
                >
                  {userStatus.currentTask.issueKey}
                </button>
                <span className="text-xs md:text-sm text-white truncate font-medium max-w-[80px] md:max-w-[120px]">
                  {userStatus.currentTask.title}
                </span>
                {userStatus.currentTaskPlayState === "playing" && (
                  <div className="h-1.5 w-1.5 md:h-2 md:w-2 bg-green-500 rounded-full animate-pulse" />
                )}
                {userStatus.currentTaskPlayState === "paused" && (
                  <div className="h-1.5 w-1.5 md:h-2 md:w-2 bg-amber-500 rounded-full" />
                )}
              </div>
              <div className="flex items-center gap-1 md:gap-2">
                <span className={cn("text-xs", 
                  userStatus?.currentTaskPlayState === "playing" ? "text-green-400 font-semibold" : currentConfig.textColor
                )}>
                  {userStatus?.currentTaskPlayState === "playing" && liveTime ? liveTime : taskTotalTime}
                </span>
                <span className="text-xs text-white/50">•</span>
                <span className="text-xs text-white/60">{currentConfig.label}</span>
              </div>
            </div>
          ) : (
            <div className="space-y-0.5">
              <div className="flex items-center gap-1 md:gap-2">
                {settings?.timeTrackingEnabled ? (
                  <span className={cn("text-xs md:text-sm font-medium", currentConfig.textColor)}>
                    {currentConfig.label}
                  </span>
                ) : (
                  <span className="text-xs text-white/60">
                    Status:
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 md:gap-2">
                {settings?.timeTrackingEnabled ? (
                  <>
                    {/* Only show live time for non-WORKING statuses or when time tracking is disabled */}
                    {(userStatus?.currentStatus !== "WORKING" || !settings?.timeTrackingEnabled) && (
                      <span className="text-xs text-white/70">
                        {liveTime || "Just started"}
                      </span>
                    )}
                    {userStatus?.statusText && (
                      <>
                        {(userStatus?.currentStatus !== "WORKING" || !settings?.timeTrackingEnabled) && (
                          <span className="text-xs text-white/50">•</span>
                        )}
                        <span className="text-xs text-white/60 truncate max-w-[60px] md:max-w-[100px]">
                          {userStatus.statusText}
                        </span>
                      </>
                    )}
                  </>
                ) : (
                  <span className={cn("text-xs md:text-sm font-medium", currentConfig.textColor)}>
                    {currentConfig.label}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1 md:gap-2">
          {getActionButtons()}
          
          {/* Status Switcher */}
          <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 md:h-10 md:w-10 rounded-full bg-white/5 hover:bg-white/10 text-white/70 hover:text-white p-0 backdrop-blur-sm border border-white/10 hover:border-white/20 shadow-lg hover:shadow-white/10 transition-all duration-200 hover:scale-110"
                disabled={isLoading}
              >
                <ChevronUp className="h-3 w-3 md:h-4 md:w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <DropdownMenuLabel>Switch Status</DropdownMenuLabel>
              <DropdownMenuSeparator />
              
              {/* Task Selection - Always show if time tracking is enabled */}
              {settings?.timeTrackingEnabled && (
                <>
                  <DropdownMenuLabel className="text-xs">Work on Task</DropdownMenuLabel>
                  
                  {/* Task Search */}
                  <div className="px-2 py-1">
                    <div className="relative">
                      <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search tasks..."
                        value={taskSearchQuery}
                        onChange={(e) => setTaskSearchQuery(e.target.value)}
                        className="pl-8 h-8 text-sm"
                        disabled={tasksLoading}
                      />
                      {taskSearchQuery && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="absolute right-1 top-1 h-6 w-6 p-0"
                          onClick={() => setTaskSearchQuery("")}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Loading State */}
                  {(tasksLoading || isSearching) && (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      <span className="ml-2 text-sm text-muted-foreground">
                        {tasksLoading ? "Loading tasks..." : "Searching..."}
                      </span>
                    </div>
                  )}

                  {/* Filtered Tasks */}
                  {!tasksLoading && !isSearching && (
                    <div className="max-h-48 overflow-y-auto">
                      {getFilteredTasks().length > 0 ? (
                        <>
                          {!taskSearchQuery && (
                            <div className="px-2 py-1">
                              <div className="text-xs text-muted-foreground">
                                {getFilteredTasks().some(task => task.assignee?.id === session?.user?.id) 
                                  ? "Recent tasks assigned to you:" 
                                  : "Available tasks:"
                                }
                              </div>
                            </div>
                          )}
                          {getFilteredTasks().map((task) => {
                            const board = boards.find(b => b.tasks.some(t => t.id === task.id));
                            const isAssignedToMe = task.assignee?.id === session?.user?.id;
                            
                            return (
                              <div key={task.id} className="group">
                                <DropdownMenuItem
                                  onClick={() => {
                                    handleTaskClick(task);
                                  }}
                                  disabled={isLoading}
                                  className="pl-6 pr-2"
                                >
                                  <div className="flex items-center gap-2 w-full">
                                    <div className="flex flex-col gap-1 flex-1 min-w-0">
                                      <div className="flex items-center gap-2">
                                        <Activity className="h-3 w-3 flex-shrink-0" />
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleTaskNavigation(task.id);
                                          }}
                                          className="font-mono text-xs opacity-70 flex-shrink-0 hover:opacity-100 hover:underline transition-opacity"
                                          title="Click to view full task"
                                        >
                                          {task.issueKey}
                                        </button>
                                        <span className="truncate flex-1 font-medium">{task.title}</span>
                                        {task.currentPlayState === "playing" && (
                                          <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse flex-shrink-0" />
                                        )}
                                        {task.currentPlayState === "paused" && (
                                          <div className="h-2 w-2 bg-amber-500 rounded-full flex-shrink-0" />
                                        )}
                                        {!isAssignedToMe && (
                                          <div className="h-2 w-2 bg-orange-400 rounded-full flex-shrink-0" title="Not assigned to you" />
                                        )}
                                      </div>
                                      <div className="flex items-center justify-between pl-5">
                                        {board && (
                                          <div className="text-xs text-muted-foreground">
                                            {board.name}
                                          </div>
                                        )}
                                        {task.assignee && (
                                          <div className="text-xs text-muted-foreground">
                                            Assigned to: {task.assignee.name}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleTaskNavigation(task.id);
                                      }}
                                      title="Open full task view"
                                    >
                                      <ExternalLink className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </DropdownMenuItem>
                              </div>
                            );
                          })}
                        </>
                      ) : (
                        <div className="px-6 py-2 text-sm text-muted-foreground">
                          {taskSearchQuery ? "No tasks found" : "No tasks available"}
                        </div>
                      )}
                    </div>
                  )}
                  <DropdownMenuSeparator />
                </>
              )}

              {/* Quick Activities */}
              {settings?.timeTrackingEnabled && (
                <DropdownMenuLabel className="text-xs">Other Activities</DropdownMenuLabel>
              )}
              {QUICK_ACTIVITIES.map((activity) => {
                const config = STATUS_CONFIGS[activity.type.replace("_START", "") as keyof typeof STATUS_CONFIGS];
                const Icon = config?.icon || Timer;
                
                return (
                  <DropdownMenuItem
                    key={activity.type}
                    onClick={() => handleQuickActivity(activity.eventType, activity.duration || undefined)}
                    disabled={isLoading}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="h-3 w-3" />
                      <span>{activity.label}</span>
                      {activity.duration && (
                        <span className="text-xs text-muted-foreground ml-auto">
                          {activity.duration}m
                        </span>
                      )}
                    </div>
                  </DropdownMenuItem>
                );
              })}
              
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleEndActivity}
                disabled={isLoading || userStatus?.currentStatus === "AVAILABLE"}
              >
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-3 w-3" />
                  <span>Set Available</span>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      </div>

      {/* Helper Confirmation Modal */}
      <Dialog open={showHelperModal} onOpenChange={setShowHelperModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Work as Helper</DialogTitle>
            <DialogDescription>
              You are not assigned to this task. You will be added as a helper and your time will be tracked separately.
              {selectedTaskForHelper?.assignee && (
                <span className="block mt-2 text-sm">
                  This task is assigned to <strong>{selectedTaskForHelper.assignee.name}</strong>.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          
          {selectedTaskForHelper && (
            <div className="py-4">
              <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                <Activity className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1">
                  <p className="font-medium text-sm">{selectedTaskForHelper.title}</p>
                  {selectedTaskForHelper.issueKey && (
                    <p className="text-xs text-muted-foreground font-mono">{selectedTaskForHelper.issueKey}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button
              variant="outline"
              onClick={handleHelperCancel}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleHelperConfirm}
              disabled={isLoading}
            >
              {isLoading ? (
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

      {/* Session Adjustment Modal */}
      {timeAdjustmentData && (
        <SessionAdjustmentModal
          isOpen={showTimeAdjustmentModal}
          onClose={handleTimeAdjustmentCancel}
          sessionDurationMs={timeAdjustmentData.sessionDurationMs}
          taskId={timeAdjustmentData.taskId}
          onSessionAdjusted={handleTimeAdjusted}
        />
      )}
    </>
  );
} 