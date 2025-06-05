"use client";

import React, { useState, useEffect } from 'react';
import { Clock, Play, Pause, StopCircle, Loader2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAssignedTasks, TaskOption } from "@/hooks/useAssignedTasks";

interface TimeTrackingWidgetProps {
  className?: string;
}

export function TimeTrackingWidget({ className }: TimeTrackingWidgetProps) {
  const { boards, loading, refetch } = useAssignedTasks();
  const [selectedTaskId, setSelectedTaskId] = useState<string>("");
  const [selectedTask, setSelectedTask] = useState<TaskOption | null>(null);
  const [isTimerLoading, setIsTimerLoading] = useState(false);
  const [playTime, setPlayTime] = useState<string>("0h 0m 0s");
  const [liveTime, setLiveTime] = useState<string | null>(null);
  const { toast } = useToast();

  // Find selected task from boards
  useEffect(() => {
    if (selectedTaskId) {
      for (const board of boards) {
        const task = board.tasks.find(t => t.id === selectedTaskId);
        if (task) {
          setSelectedTask(task);
          fetchPlayTime(task.id);
          break;
        }
      }
    } else {
      setSelectedTask(null);
      setPlayTime("0h 0m 0s");
      setLiveTime(null);
    }
  }, [selectedTaskId, boards]);

  // Live timer effect
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;

    if (selectedTask?.currentPlayState === "playing") {
      const startTime = Date.now();
      const tick = () => {
        const elapsed = Date.now() - startTime;
        const totalMs = parseDurationToMs(playTime) + elapsed;
        setLiveTime(formatDuration(totalMs));
      };

      tick(); // Initial update
      intervalId = setInterval(tick, 1000);
    } else {
      setLiveTime(null);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [selectedTask?.currentPlayState, playTime]);

  const fetchPlayTime = async (taskId: string) => {
    try {
      const response = await fetch(`/api/tasks/${taskId}/playtime`);
      if (response.ok) {
        const data = await response.json();
        setPlayTime(data.formattedTime || "0h 0m 0s");
      }
    } catch (error) {
      console.error("Error fetching play time:", error);
    }
  };

  const handleTimerAction = async (action: "play" | "pause" | "stop") => {
    if (!selectedTask) return;

    setIsTimerLoading(true);
    try {
      const response = await fetch(`/api/tasks/${selectedTask.id}/${action}`, {
        method: "POST",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `Failed to ${action} task` }));
        throw new Error(errorData.message || `Failed to ${action} task`);
      }

      toast({
        title: `Timer ${action === 'play' ? 'Started' : action === 'pause' ? 'Paused' : 'Stopped'}`,
        description: `Task timer has been ${action === 'play' ? 'started/resumed' : action === 'pause' ? 'paused' : 'stopped'}.`,
      });

      // Refresh task data and playtime
      await Promise.all([
        refetch(),
        fetchPlayTime(selectedTask.id)
      ]);

    } catch (err: any) {
      console.error(`Error ${action} task:`, err);
      toast({
        title: "Error",
        description: err.message || `Could not ${action} task.`,
        variant: "destructive",
      });
    } finally {
      setIsTimerLoading(false);
    }
  };

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

  const formatDuration = (ms: number): string => {
    if (ms < 0) ms = 0;
    const totalSeconds = Math.floor(ms / 1000);
    const d = Math.floor(totalSeconds / (3600 * 24));
    const h = Math.floor((totalSeconds % (3600 * 24)) / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;

    if (d > 0) return `${d}d ${h}h ${m}m ${s}s`;
    return `${h}h ${m}m ${s}s`;
  };

  const getCurrentStateButton = () => {
    if (!selectedTask) return null;

    const currentState = selectedTask.currentPlayState || "stopped";

    if (currentState === "stopped") {
      return (
        <button
          onClick={() => handleTimerAction("play")}
          disabled={isTimerLoading}
          className="h-10 w-10 rounded-full bg-white hover:bg-gray-100 text-black flex items-center justify-center transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
        >
          {isTimerLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5 ml-0.5" />}
        </button>
      );
    }

    return (
      <div className="flex items-center gap-2">
        {currentState === "playing" && (
          <button
            onClick={() => handleTimerAction("pause")}
            disabled={isTimerLoading}
            className="h-10 w-10 rounded-full bg-white hover:bg-gray-100 text-black flex items-center justify-center transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
          >
            {isTimerLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Pause className="h-5 w-5" />}
          </button>
        )}
        {currentState === "paused" && (
          <button
            onClick={() => handleTimerAction("play")}
            disabled={isTimerLoading}
            className="h-10 w-10 rounded-full bg-white hover:bg-gray-100 text-black flex items-center justify-center transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
          >
            {isTimerLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5 ml-0.5" />}
          </button>
        )}
        <button
          onClick={() => handleTimerAction("stop")}
          disabled={isTimerLoading}
          className="h-8 w-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
        >
          {isTimerLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <StopCircle className="h-3.5 w-3.5" />}
        </button>
      </div>
    );
  };

  if (!selectedTask) {
    return (
      <div className={`flex items-center gap-3 ${className}`}>
        <Clock className="h-5 w-5 text-white/70 flex-shrink-0" />
        <div className="min-w-[280px]">
          <Select value={selectedTaskId} onValueChange={setSelectedTaskId} disabled={loading}>
            <SelectTrigger className="h-9 text-sm bg-white/10 border-white/20 text-white">
              <SelectValue placeholder={loading ? "Loading tasks..." : "Select a task to track"} />
            </SelectTrigger>
            <SelectContent>
              {boards.map((board) => (
                <React.Fragment key={board.id}>
                  <div className="px-2 py-1 text-xs font-medium text-muted-foreground bg-muted/50">
                    {board.name}
                  </div>
                  {board.tasks.map((task) => (
                    <SelectItem key={task.id} value={task.id} className="pl-4">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs opacity-70">{task.issueKey}</span>
                        <span className="truncate max-w-[200px]">{task.title}</span>
                        {task.currentPlayState === "playing" && (
                          <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse flex-shrink-0" />
                        )}
                        {task.currentPlayState === "paused" && (
                          <div className="h-2 w-2 bg-amber-500 rounded-full flex-shrink-0" />
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </React.Fragment>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-4 ${className}`}>
      <Clock className="h-5 w-5 text-white/70 flex-shrink-0" />
      
      <div className="min-w-[200px] max-w-[280px]">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-white/60">{selectedTask.issueKey}</span>
          <span className="text-sm text-white truncate font-medium">{selectedTask.title}</span>
          {selectedTask.currentPlayState === "playing" && (
            <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse flex-shrink-0" />
          )}
          {selectedTask.currentPlayState === "paused" && (
            <div className="h-2 w-2 bg-amber-500 rounded-full flex-shrink-0" />
          )}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className={`text-xs ${selectedTask.currentPlayState === "playing" ? "text-green-400 font-medium" : "text-white/70"}`}>
            {liveTime || playTime}
          </span>
          <button
            onClick={() => setSelectedTaskId("")}
            className="text-xs text-white/50 hover:text-white/80 transition-colors"
          >
            Change task
          </button>
        </div>
      </div>

      <div className="flex items-center">
        {getCurrentStateButton()}
      </div>
    </div>
  );
} 