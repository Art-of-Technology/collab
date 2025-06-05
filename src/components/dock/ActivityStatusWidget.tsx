"use client";

import React, { useState, useEffect, useCallback } from 'react';
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
  ChevronDown,
  Activity,
  Timer,
  X
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
import { useToast } from "@/hooks/use-toast";
import { useAssignedTasks } from "@/hooks/useAssignedTasks";
import { cn } from "@/lib/utils";

interface ActivityStatusWidgetProps {
  className?: string;
}

interface UserStatus {
  id: string;
  currentStatus: string;
  currentTaskId?: string;
  statusStartedAt: string;
  statusText?: string;
  isAvailable: boolean;
  autoEndAt?: string;
  currentTask?: {
    id: string;
    title: string;
    issueKey?: string;
    priority: string;
  };
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
  { type: "LUNCH_START", label: "Going to Lunch", duration: 60, eventType: "LUNCH_START" },
  { type: "BREAK_START", label: "Taking a Break", duration: 15, eventType: "BREAK_START" },
  { type: "MEETING_START", label: "In a Meeting", duration: 30, eventType: "MEETING_START" },
  { type: "RESEARCH_START", label: "Researching", duration: null, eventType: "RESEARCH_START" },
  { type: "TRAVEL_START", label: "Traveling", duration: null, eventType: "TRAVEL_START" },
  { type: "OFFLINE", label: "Going Offline", duration: null, eventType: "OFFLINE" },
];

export function ActivityStatusWidget({ className }: ActivityStatusWidgetProps) {
  const { boards, loading: tasksLoading, refetch } = useAssignedTasks();
  const [selectedTaskId, setSelectedTaskId] = useState<string>("");
  const [userStatus, setUserStatus] = useState<UserStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [liveTime, setLiveTime] = useState<string | null>(null);
  const [taskSearchQuery, setTaskSearchQuery] = useState<string>("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const { toast } = useToast();

  // Fetch current user status
  const fetchUserStatus = useCallback(async () => {
    try {
      setStatusLoading(true);
      const response = await fetch("/api/activities/status");
      if (response.ok) {
        const data = await response.json();
        setUserStatus(data.status);
        
        // Set selected task if user is currently working on one
        if (data.status?.currentTaskId && data.status?.currentTaskId !== selectedTaskId) {
          setSelectedTaskId(data.status.currentTaskId);
        }
      }
    } catch (error) {
      console.error("Error fetching user status:", error);
    } finally {
      setStatusLoading(false);
    }
  }, [selectedTaskId]);

  // Live timer effect
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;

    if (userStatus?.statusStartedAt) {
      const tick = () => {
        const start = new Date(userStatus.statusStartedAt);
        const now = new Date();
        const diff = now.getTime() - start.getTime();
        setLiveTime(formatDuration(diff));
      };

      tick(); // Initial update
      intervalId = setInterval(tick, 1000);
    } else {
      setLiveTime(null);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [userStatus?.statusStartedAt]);

  // Fetch status on mount and every 30 seconds
  useEffect(() => {
    fetchUserStatus();
    const interval = setInterval(fetchUserStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchUserStatus]);

  // Sync selectedTaskId with userStatus.currentTaskId
  useEffect(() => {
    if (userStatus?.currentStatus === "WORKING" && userStatus.currentTaskId) {
      setSelectedTaskId(userStatus.currentTaskId);
    } else if (userStatus?.currentStatus !== "WORKING") {
      setSelectedTaskId("");
    }
  }, [userStatus?.currentTaskId, userStatus?.currentStatus]);

  const formatDuration = (ms: number): string => {
    if (ms < 0) ms = 0;
    const totalSeconds = Math.floor(ms / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;

    if (h > 0) return `${h}h ${m}m ${s}s`;
    return `${m}m ${s}s`;
  };

  const startActivity = async (eventType: string, taskId?: string, duration?: number) => {
    setIsLoading(true);
    try {
      // First, ensure any previous activity is stopped if switching activities
      const isTaskActivity = eventType.startsWith("TASK_");
      const isCurrentlyWorking = userStatus?.currentStatus === "WORKING";
      const hasCurrentActivity = userStatus?.currentStatus && userStatus.currentStatus !== "AVAILABLE";
      const isSwitchingTasks = isTaskActivity && isCurrentlyWorking && taskId !== userStatus?.currentTaskId;
      const isSwitchingToNonTask = !isTaskActivity && isCurrentlyWorking;
      const isSwitchingActivities = hasCurrentActivity && !isCurrentlyWorking;

      // Stop previous activity when switching
      if (isSwitchingTasks || isSwitchingToNonTask) {
        // Stop previous task work
        try {
          await fetch("/api/activities/start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              eventType: "TASK_STOP",
              taskId: userStatus?.currentTaskId,
              description: `Stopped work on previous task`,
            }),
          });
        } catch (error) {
          console.warn("Failed to stop previous task:", error);
        }
      } else if (isSwitchingActivities) {
        // End any current non-task activity
        try {
          await fetch("/api/activities/end", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              description: "Switching to new activity",
            }),
          });
        } catch (error) {
          console.warn("Failed to end previous activity:", error);
        }
      }

      const autoEndAt = duration 
        ? new Date(Date.now() + duration * 60 * 1000).toISOString()
        : undefined;

      // Get task details for better description
      const task = taskId ? getTaskById(taskId) : null;
      const taskDescription = task ? `${task.issueKey} - ${task.title}` : undefined;

      const response = await fetch("/api/activities/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType,
          taskId,
          description: taskDescription || QUICK_ACTIVITIES.find(a => a.eventType === eventType)?.label || `Started ${eventType.toLowerCase().replace('_', ' ')}`,
          autoEndAt,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        
        // Update selected task if starting task work
        if (isTaskActivity && taskId) {
          setSelectedTaskId(taskId);
        }
        
        // Clear search and close dropdown
        setTaskSearchQuery("");
        setIsDropdownOpen(false);

        toast({
          title: "Status Updated",
          description: data.message,
        });
        await Promise.all([fetchUserStatus(), refetch()]);
      } else {
        const errorData = await response.json().catch(() => ({ message: "Failed to update status" }));
        throw new Error(errorData.message || "Failed to update status");
      }
    } catch (error) {
      console.error("Error starting activity:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update status",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const endActivity = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/activities/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: "Set to available",
        }),
      });

      if (response.ok) {
        const data = await response.json();
        
        // Clear task selection if we were working on a task
        if (userStatus?.currentStatus === "WORKING") {
          setSelectedTaskId("");
        }
        
        toast({
          title: "Status Updated",
          description: data.message || "You are now available",
        });
        await Promise.all([fetchUserStatus(), refetch()]);
      } else {
        const errorData = await response.json().catch(() => ({ message: "Failed to end activity" }));
        throw new Error(errorData.message || "Failed to end activity");
      }
    } catch (error) {
      console.error("Error ending activity:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update status",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleTaskAction = async (action: "play" | "pause" | "stop") => {
    if (!selectedTaskId) return;

    const eventTypeMap = {
      play: "TASK_START",
      pause: "TASK_PAUSE", 
      stop: "TASK_STOP"
    };

    await startActivity(eventTypeMap[action], selectedTaskId);
  };

  const getSelectedTask = () => {
    for (const board of boards) {
      const task = board.tasks.find(t => t.id === selectedTaskId);
      if (task) return task;
    }
    return null;
  };

  const getTaskById = (taskId: string) => {
    for (const board of boards) {
      const task = board.tasks.find(t => t.id === taskId);
      if (task) return task;
    }
    return null;
  };

  const selectedTask = getSelectedTask();
  const currentConfig = STATUS_CONFIGS[userStatus?.currentStatus as keyof typeof STATUS_CONFIGS] || STATUS_CONFIGS.AVAILABLE;
  const StatusIcon = currentConfig.icon;

  // Filter tasks based on search query
  const getFilteredTasks = () => {
    if (!taskSearchQuery.trim()) {
      return boards.flatMap(board => board.tasks);
    }
    
    const query = taskSearchQuery.toLowerCase();
    return boards.flatMap(board => 
      board.tasks.filter(task => 
        task.title.toLowerCase().includes(query) ||
        task.issueKey?.toLowerCase().includes(query) ||
        board.name.toLowerCase().includes(query)
      )
    );
  };

  const getActionButtons = () => {
    if (userStatus?.currentStatus === "WORKING" && selectedTask) {
      // Get current play state from task or determine from status
      const currentState = selectedTask.currentPlayState || "stopped";

      if (currentState === "stopped") {
        return (
          <button
            onClick={() => handleTaskAction("play")}
            disabled={isLoading}
            className="h-10 w-10 rounded-full bg-green-500/20 hover:bg-green-500/30 text-green-400 hover:text-green-300 flex items-center justify-center transition-all duration-200 hover:scale-110 disabled:opacity-50 backdrop-blur-sm border border-green-400/30 hover:border-green-300/50 shadow-lg hover:shadow-green-500/25"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 ml-0.5" />}
          </button>
        );
      }

      return (
        <div className="flex items-center gap-2">
          {currentState === "playing" && (
            <button
              onClick={() => handleTaskAction("pause")}
              disabled={isLoading}
              className="h-10 w-10 rounded-full bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 hover:text-amber-300 flex items-center justify-center transition-all duration-200 hover:scale-110 disabled:opacity-50 backdrop-blur-sm border border-amber-400/30 hover:border-amber-300/50 shadow-lg hover:shadow-amber-500/25"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />}
            </button>
          )}
          {currentState === "paused" && (
            <button
              onClick={() => handleTaskAction("play")}
              disabled={isLoading}
              className="h-10 w-10 rounded-full bg-green-500/20 hover:bg-green-500/30 text-green-400 hover:text-green-300 flex items-center justify-center transition-all duration-200 hover:scale-110 disabled:opacity-50 backdrop-blur-sm border border-green-400/30 hover:border-green-300/50 shadow-lg hover:shadow-green-500/25"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 ml-0.5" />}
            </button>
          )}
          <button
            onClick={() => handleTaskAction("stop")}
            disabled={isLoading}
            className="h-8 w-8 rounded-full bg-red-500/15 hover:bg-red-500/25 text-red-400/70 hover:text-red-400 flex items-center justify-center transition-all duration-200 hover:scale-110 disabled:opacity-50 backdrop-blur-sm border border-red-400/20 hover:border-red-400/40 shadow-lg hover:shadow-red-500/20"
          >
            {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <StopCircle className="h-3.5 w-3.5" />}
          </button>
        </div>
      );
    }

    // For non-task activities, show end activity button
    if (userStatus?.currentStatus !== "AVAILABLE") {
      return (
        <button
          onClick={endActivity}
          disabled={isLoading}
          className="h-10 w-10 rounded-full bg-red-500/20 hover:bg-red-500/30 text-red-400 hover:text-red-300 flex items-center justify-center transition-all duration-200 hover:scale-110 disabled:opacity-50 backdrop-blur-sm border border-red-400/30 hover:border-red-300/50 shadow-lg hover:shadow-red-500/25"
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <StopCircle className="h-4 w-4" />}
        </button>
      );
    }

    return null;
  };

  if (statusLoading && !userStatus) {
    return (
      <div className={cn("flex items-center gap-3", className)}>
        <div className="h-5 w-5 rounded-full bg-gray-500 animate-pulse" />
        <span className="text-sm text-white/70">Loading status...</span>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-3", className)}>
      {/* Status Indicator */}
      <div className="relative">
        <div className={cn("h-4 w-4 rounded-full", currentConfig.color)} />
        <StatusIcon className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 text-white bg-gray-800 rounded-full p-0.5" />
      </div>

      {/* Main Content */}
      <div className="flex items-center gap-3">
        {/* Status Display */}
        <div className="min-w-[160px]">
          {userStatus?.currentStatus === "WORKING" && userStatus.currentTask ? (
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-white/60">{userStatus.currentTask.issueKey}</span>
                <span className="text-sm text-white truncate font-medium max-w-[120px]">
                  {userStatus.currentTask.title}
                </span>
                {selectedTask?.currentPlayState === "playing" && (
                  <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
                )}
                {selectedTask?.currentPlayState === "paused" && (
                  <div className="h-2 w-2 bg-amber-500 rounded-full" />
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className={cn("text-xs", currentConfig.textColor)}>
                  {liveTime || "0m 0s"}
                </span>
                <span className="text-xs text-white/50">•</span>
                <span className="text-xs text-white/60">{currentConfig.label}</span>
              </div>
            </div>
          ) : (
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className={cn("text-sm font-medium", currentConfig.textColor)}>
                  {currentConfig.label}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-white/70">
                  {liveTime || "Just started"}
                </span>
                {userStatus?.statusText && (
                  <>
                    <span className="text-xs text-white/50">•</span>
                    <span className="text-xs text-white/60 truncate max-w-[100px]">
                      {userStatus.statusText}
                    </span>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {getActionButtons()}
          
          {/* Status Switcher */}
          <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-10 w-10 rounded-full bg-white/5 hover:bg-white/10 text-white/70 hover:text-white p-0 backdrop-blur-sm border border-white/10 hover:border-white/20 shadow-lg hover:shadow-white/10 transition-all duration-200 hover:scale-110"
                disabled={isLoading}
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <DropdownMenuLabel>Switch Status</DropdownMenuLabel>
              <DropdownMenuSeparator />
              
              {/* Task Selection */}
              {!tasksLoading && boards.length > 0 && (
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

                  {/* Filtered Tasks */}
                  <div className="max-h-48 overflow-y-auto">
                    {getFilteredTasks().length > 0 ? (
                      getFilteredTasks().map((task) => {
                        const board = boards.find(b => b.tasks.some(t => t.id === task.id));
                        return (
                          <DropdownMenuItem
                            key={task.id}
                            onClick={() => {
                              startActivity("TASK_START", task.id);
                            }}
                            disabled={isLoading}
                            className="pl-6"
                          >
                            <div className="flex flex-col gap-1 w-full">
                              <div className="flex items-center gap-2">
                                <Activity className="h-3 w-3 flex-shrink-0" />
                                <span className="font-mono text-xs opacity-70 flex-shrink-0">{task.issueKey}</span>
                                <span className="truncate flex-1 font-medium">{task.title}</span>
                                {task.currentPlayState === "playing" && (
                                  <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse flex-shrink-0" />
                                )}
                                {task.currentPlayState === "paused" && (
                                  <div className="h-2 w-2 bg-amber-500 rounded-full flex-shrink-0" />
                                )}
                              </div>
                              {board && (
                                <div className="text-xs text-muted-foreground pl-5">
                                  {board.name}
                                </div>
                              )}
                            </div>
                          </DropdownMenuItem>
                        );
                      })
                    ) : (
                      <div className="px-6 py-2 text-sm text-muted-foreground">
                        {taskSearchQuery ? "No tasks found" : "No tasks available"}
                      </div>
                    )}
                  </div>
                  <DropdownMenuSeparator />
                </>
              )}

              {/* Quick Activities */}
              <DropdownMenuLabel className="text-xs">Other Activities</DropdownMenuLabel>
              {QUICK_ACTIVITIES.map((activity) => {
                const config = STATUS_CONFIGS[activity.type.replace("_START", "") as keyof typeof STATUS_CONFIGS];
                const Icon = config?.icon || Timer;
                
                return (
                  <DropdownMenuItem
                    key={activity.type}
                    onClick={() => startActivity(activity.eventType, undefined, activity.duration || undefined)}
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
                onClick={endActivity}
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
  );
} 