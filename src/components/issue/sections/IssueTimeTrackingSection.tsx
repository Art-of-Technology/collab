"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Clock,
  Plus,
  Timer,
  Loader2,
  Trash2,
  Target,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Issue, WorkLog, WorkLogsListResponse } from "@/types/issue";
import { formatDistanceToNow } from "date-fns";

interface IssueTimeTrackingSectionProps {
  issue: Issue;
  workspaceId: string;
  onRefresh?: () => void;
}

// Helper to format minutes as hours/minutes
function formatMinutes(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${mins}m`;
}

// Parse time string to minutes (e.g., "2h 30m", "1.5h", "90m", "1d")
function parseTimeToMinutes(input: string): number | null {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;

  const fullMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*h(?:ours?)?\s*(?:(\d+)\s*m(?:ins?)?)?$/);
  if (fullMatch) {
    const hours = parseFloat(fullMatch[1]);
    const mins = fullMatch[2] ? parseInt(fullMatch[2]) : 0;
    return Math.round(hours * 60 + mins);
  }

  const hoursMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*h(?:ours?)?$/);
  if (hoursMatch) {
    return Math.round(parseFloat(hoursMatch[1]) * 60);
  }

  const minsMatch = trimmed.match(/^(\d+)\s*m(?:ins?)?$/);
  if (minsMatch) {
    return parseInt(minsMatch[1]);
  }

  const daysMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*d(?:ays?)?$/);
  if (daysMatch) {
    return Math.round(parseFloat(daysMatch[1]) * 8 * 60);
  }

  const numMatch = trimmed.match(/^(\d+)$/);
  if (numMatch) {
    return parseInt(numMatch[1]);
  }

  const colonMatch = trimmed.match(/^(\d+):(\d{1,2})$/);
  if (colonMatch) {
    return parseInt(colonMatch[1]) * 60 + parseInt(colonMatch[2]);
  }

  return null;
}

export function IssueTimeTrackingSection({
  issue,
  workspaceId,
  onRefresh,
}: IssueTimeTrackingSectionProps) {
  const [workLogs, setWorkLogs] = useState<WorkLog[]>([]);
  const [summary, setSummary] = useState<{
    totalTimeSpent: number;
    timeEstimate: number | null;
    timeRemaining: number | null;
    logCount: number;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showLogTimeDialog, setShowLogTimeDialog] = useState(false);
  const [showEstimateDialog, setShowEstimateDialog] = useState(false);

  const [timeInput, setTimeInput] = useState("");
  const [description, setDescription] = useState("");
  const [estimateInput, setEstimateInput] = useState("");

  const { toast } = useToast();

  const fetchWorkLogs = useCallback(async () => {
    if (!issue.id) return;
    setIsLoading(true);
    try {
      const response = await fetch(`/api/issues/${issue.id}/work-logs`);
      if (response.ok) {
        const data: WorkLogsListResponse = await response.json();
        setWorkLogs(data.workLogs || []);
        setSummary(data.summary);
      }
    } catch (error) {
      console.error("Failed to fetch work logs:", error);
    } finally {
      setIsLoading(false);
    }
  }, [issue.id]);

  useEffect(() => {
    fetchWorkLogs();
  }, [fetchWorkLogs]);

  const handleLogTime = async () => {
    const minutes = parseTimeToMinutes(timeInput);
    if (minutes === null || minutes <= 0) {
      toast({
        title: "Invalid time",
        description: "Please enter a valid time (e.g., '2h 30m', '90m', '1.5h')",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/issues/${issue.id}/work-logs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timeSpent: minutes,
          description: description.trim() || undefined,
        }),
      });

      if (!response.ok) throw new Error("Failed to log time");

      toast({
        title: "Time logged",
        description: `Logged ${formatMinutes(minutes)}`,
      });

      setTimeInput("");
      setDescription("");
      setShowLogTimeDialog(false);
      fetchWorkLogs();
      onRefresh?.();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to log time",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSetEstimate = async () => {
    const minutes = estimateInput.trim() ? parseTimeToMinutes(estimateInput) : null;

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/issues/${issue.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timeEstimateMinutes: minutes }),
      });

      if (!response.ok) throw new Error("Failed to update estimate");

      toast({
        title: "Estimate updated",
        description: minutes ? `Set to ${formatMinutes(minutes)}` : "Cleared",
      });
      setShowEstimateDialog(false);
      setEstimateInput("");
      fetchWorkLogs();
      onRefresh?.();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update estimate",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteWorkLog = async (workLogId: string) => {
    try {
      const response = await fetch(
        `/api/issues/${issue.id}/work-logs/${workLogId}`,
        { method: "DELETE" }
      );
      if (!response.ok) throw new Error("Failed to delete");
      toast({ title: "Entry deleted" });
      fetchWorkLogs();
      onRefresh?.();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete entry",
        variant: "destructive",
      });
    }
  };

  const timeEstimate = summary?.timeEstimate ?? issue.timeEstimateMinutes ?? null;
  const timeSpent = summary?.totalTimeSpent ?? issue.timeSpentMinutes ?? 0;
  const timeRemaining = timeEstimate ? Math.max(0, timeEstimate - timeSpent) : null;
  const progressPercent = timeEstimate ? Math.min(100, Math.round((timeSpent / timeEstimate) * 100)) : 0;
  const isOverEstimate = timeEstimate && timeSpent > timeEstimate;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-4 w-4 animate-spin text-[#52525b]" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Compact Stats Row */}
      <div className="flex items-center justify-between gap-6 px-3 py-2.5 bg-[#0d0d0e] rounded-lg border border-[#1f1f1f]">
        <div className="flex items-center gap-6">
          {/* Logged */}
          <div className="flex items-center gap-2">
            <Timer className="h-3.5 w-3.5 text-[#52525b]" />
            <span className="text-[11px] text-[#71717a] uppercase tracking-wider">Logged</span>
            <span className="text-[13px] font-medium text-[#fafafa] tabular-nums">
              {timeSpent > 0 ? formatMinutes(timeSpent) : "0m"}
            </span>
          </div>

          {/* Estimate */}
          <div className="flex items-center gap-2">
            <Target className="h-3.5 w-3.5 text-[#52525b]" />
            <span className="text-[11px] text-[#71717a] uppercase tracking-wider">Estimate</span>
            <Dialog open={showEstimateDialog} onOpenChange={setShowEstimateDialog}>
              <DialogTrigger asChild>
                <button className="text-[13px] font-medium text-[#a1a1aa] hover:text-[#3b82f6] transition-colors tabular-nums">
                  {timeEstimate ? formatMinutes(timeEstimate) : "Set"}
                </button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-sm bg-[#0d0d0e] border-[#27272a]">
                <DialogHeader>
                  <DialogTitle className="text-[#fafafa] text-sm">Set Estimate</DialogTitle>
                  <DialogDescription className="text-[#71717a] text-xs">
                    Estimated time to complete this issue.
                  </DialogDescription>
                </DialogHeader>
                <div className="py-3">
                  <Input
                    placeholder="e.g., 4h, 2d, 30m"
                    value={estimateInput}
                    onChange={(e) => setEstimateInput(e.target.value)}
                    className="bg-[#09090b] border-[#27272a] text-[#fafafa] text-sm h-8"
                    autoFocus
                  />
                  <p className="text-[10px] text-[#52525b] mt-1.5">
                    Formats: 2h 30m, 90m, 1.5h, 1d (8h)
                  </p>
                </div>
                <DialogFooter className="gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowEstimateDialog(false)}
                    className="text-[#a1a1aa] hover:text-[#fafafa] hover:bg-[#27272a] h-7 text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSetEstimate}
                    disabled={isSubmitting}
                    className="bg-[#3b82f6] hover:bg-[#2563eb] text-white h-7 text-xs"
                  >
                    {isSubmitting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {/* Remaining (only if estimate exists) */}
          {timeEstimate && (
            <div className="flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 text-[#52525b]" />
              <span className="text-[11px] text-[#71717a] uppercase tracking-wider">Left</span>
              <span className={cn(
                "text-[13px] font-medium tabular-nums",
                isOverEstimate ? "text-red-400" : "text-[#fafafa]"
              )}>
                {isOverEstimate ? `+${formatMinutes(timeSpent - timeEstimate)}` : formatMinutes(timeRemaining || 0)}
              </span>
            </div>
          )}
        </div>

        {/* Progress indicator */}
        {timeEstimate && (
          <div className="flex items-center gap-2">
            <TrendingUp className="h-3.5 w-3.5 text-[#52525b]" />
            <div className="w-24 h-1.5 bg-[#27272a] rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-300",
                  isOverEstimate ? "bg-red-500" : "bg-[#3b82f6]"
                )}
                style={{ width: `${Math.min(progressPercent, 100)}%` }}
              />
            </div>
            <span className={cn(
              "text-[11px] font-medium tabular-nums",
              isOverEstimate ? "text-red-400" : "text-[#71717a]"
            )}>
              {progressPercent}%
            </span>
          </div>
        )}
      </div>

      {/* Work Logs Section */}
      <div className="space-y-2">
        {/* Section Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-[#71717a] uppercase tracking-wider">
              Entries
            </span>
            <span className="text-[10px] text-[#3f3f46]">
              {summary?.logCount || 0}
            </span>
          </div>
          <Dialog open={showLogTimeDialog} onOpenChange={setShowLogTimeDialog}>
            <DialogTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[11px] text-[#71717a] hover:text-[#fafafa] hover:bg-[#27272a] gap-1"
              >
                <Plus className="h-3 w-3" />
                Log Time
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-sm bg-[#0d0d0e] border-[#27272a]">
              <DialogHeader>
                <DialogTitle className="text-[#fafafa] text-sm">Log Time</DialogTitle>
                <DialogDescription className="text-[#71717a] text-xs">
                  Record time spent on this issue.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-3">
                <div className="space-y-1.5">
                  <Label className="text-[#a1a1aa] text-xs">Time *</Label>
                  <Input
                    placeholder="e.g., 2h 30m, 90m"
                    value={timeInput}
                    onChange={(e) => setTimeInput(e.target.value)}
                    className="bg-[#09090b] border-[#27272a] text-[#fafafa] text-sm h-8"
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[#a1a1aa] text-xs">Description</Label>
                  <Textarea
                    placeholder="What did you work on?"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    className="bg-[#09090b] border-[#27272a] text-[#fafafa] text-sm resize-none"
                  />
                </div>
              </div>
              <DialogFooter className="gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowLogTimeDialog(false)}
                  className="text-[#a1a1aa] hover:text-[#fafafa] hover:bg-[#27272a] h-7 text-xs"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleLogTime}
                  disabled={isSubmitting || !timeInput.trim()}
                  className="bg-[#3b82f6] hover:bg-[#2563eb] text-white h-7 text-xs"
                >
                  {isSubmitting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Log"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Entries List */}
        {workLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <Clock className="h-5 w-5 text-[#3f3f46] mb-2" />
            <p className="text-[11px] text-[#52525b]">No time logged yet</p>
          </div>
        ) : (
          <div className="space-y-1">
            {workLogs.map((log) => (
              <div
                key={log.id}
                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[#18181b] group transition-colors"
              >
                <div className="w-1 h-1 rounded-full bg-[#3b82f6] flex-shrink-0" />
                <div className="flex-1 min-w-0 flex items-center gap-3">
                  <span className="text-[13px] font-medium text-[#fafafa] tabular-nums w-14 flex-shrink-0">
                    {formatMinutes(log.timeSpent)}
                  </span>
                  <span className="text-[11px] text-[#52525b] truncate flex-1">
                    {log.description || <span className="text-[#3f3f46] italic">No description</span>}
                  </span>
                  <span className="text-[10px] text-[#3f3f46] flex-shrink-0">
                    {log.user?.name?.split(' ')[0] || "—"}
                  </span>
                  <span className="text-[10px] text-[#3f3f46] flex-shrink-0 w-16 text-right">
                    {formatDistanceToNow(new Date(log.loggedAt), { addSuffix: false })}
                  </span>
                </div>
                <button
                  onClick={() => handleDeleteWorkLog(log.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-[#27272a] transition-all"
                >
                  <Trash2 className="h-3 w-3 text-[#52525b] hover:text-red-400" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
