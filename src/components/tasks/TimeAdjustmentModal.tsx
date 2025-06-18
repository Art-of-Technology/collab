"use client";

import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { useToast } from "@/hooks/use-toast";
import { Loader2, Clock, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface TimeAdjustmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  originalDuration: string; // e.g., "198h 45m 30s"
  originalDurationMs: number;
  taskTitle: string;
  taskId: string;
  onTimeAdjusted: () => void;
  activityId?: string; // If editing a specific activity
}

export function TimeAdjustmentModal({
  isOpen,
  onClose,
  originalDuration,
  originalDurationMs,
  taskTitle,
  taskId,
  onTimeAdjusted,
  activityId,
}: TimeAdjustmentModalProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  
  // Parse original duration into components
  const parseOriginalDuration = () => {
    const regex = /(?:(\d+)d\s*)?(?:(\d+)h\s*)?(?:(\d+)m\s*)?(?:(\d+)s\s*)?/;
    const match = originalDuration.match(regex);
    if (!match) return { days: 0, hours: 0, minutes: 0 };

    const [, days = "0", hours = "0", minutes = "0"] = match;
    return {
      days: parseInt(days),
      hours: parseInt(hours),
      minutes: parseInt(minutes),
    };
  };

  const original = parseOriginalDuration();
  const [days, setDays] = useState(original.days);
  const [hours, setHours] = useState(original.hours);
  const [minutes, setMinutes] = useState(original.minutes);
  const [adjustmentReason, setAdjustmentReason] = useState("");
  
  // Quick adjustment presets
  const quickAdjustments = [
    { label: "1 hour", days: 0, hours: 1, minutes: 0 },
    { label: "2 hours", days: 0, hours: 2, minutes: 0 },
    { label: "4 hours", days: 0, hours: 4, minutes: 0 },
    { label: "8 hours (1 day)", days: 0, hours: 8, minutes: 0 },
    { label: "16 hours (2 days)", days: 0, hours: 16, minutes: 0 },
  ];

  const calculateNewDurationMs = () => {
    return (days * 24 * 60 * 60 * 1000) + (hours * 60 * 60 * 1000) + (minutes * 60 * 1000);
  };

  const formatDuration = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const d = Math.floor(totalSeconds / (3600 * 24));
    const h = Math.floor((totalSeconds % (3600 * 24)) / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);

    if (d > 0) return `${d}d ${h}h ${m}m`;
    return `${h}h ${m}m`;
  };

  const newDurationMs = calculateNewDurationMs();
  const timeDifference = newDurationMs - originalDurationMs;
  const isReduction = timeDifference < 0;

  const handleQuickAdjustment = (preset: { days: number; hours: number; minutes: number }) => {
    setDays(preset.days);
    setHours(preset.hours);
    setMinutes(preset.minutes);
  };

  const handleSave = async () => {
    if (newDurationMs <= 0) {
      toast({
        title: "Invalid Duration",
        description: "The adjusted time must be greater than 0.",
        variant: "destructive",
      });
      return;
    }

    if (!adjustmentReason.trim()) {
      toast({
        title: "Reason Required",
        description: "Please provide a reason for the time adjustment.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const endpoint = activityId 
        ? `/api/tasks/${taskId}/activities/${activityId}/adjust-time`
        : `/api/tasks/${taskId}/adjust-time`;
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newDurationMs,
          reason: adjustmentReason,
          originalDurationMs,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to adjust time');
      }

      toast({
        title: "Time Adjusted",
        description: `Task time has been adjusted to ${formatDuration(newDurationMs)}.`,
      });

      onTimeAdjusted();
      onClose();
    } catch (error) {
      console.error('Error adjusting time:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to adjust time",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    // Reset to original values
    setDays(original.days);
    setHours(original.hours);
    setMinutes(original.minutes);
    setAdjustmentReason("");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Adjust Time
          </DialogTitle>
          <DialogDescription>
            Adjust the time logged for <strong>{taskTitle}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Original Time Display */}
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Original time:</strong> {originalDuration}
              {originalDurationMs > 24 * 60 * 60 * 1000 && (
                <span className="text-amber-600 ml-2">
                  (This seems unusually long - you may have forgotten to stop the timer)
                </span>
              )}
            </AlertDescription>
          </Alert>

          {/* Quick Adjustments */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Quick Adjustments</Label>
            <div className="grid grid-cols-2 gap-2">
              {quickAdjustments.map((preset) => (
                <Button
                  key={preset.label}
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickAdjustment(preset)}
                  className="justify-start"
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Manual Time Input */}
          <div>
            <Label className="text-sm font-medium mb-3 block">Manual Adjustment</Label>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label htmlFor="days" className="text-xs text-muted-foreground">Days</Label>
                <Input
                  id="days"
                  type="number"
                  min="0"
                  max="365"
                  value={days}
                  onChange={(e) => setDays(Math.max(0, parseInt(e.target.value) || 0))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="hours" className="text-xs text-muted-foreground">Hours</Label>
                <Input
                  id="hours"
                  type="number"
                  min="0"
                  max="23"
                  value={hours}
                  onChange={(e) => setHours(Math.max(0, Math.min(23, parseInt(e.target.value) || 0)))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="minutes" className="text-xs text-muted-foreground">Minutes</Label>
                <Input
                  id="minutes"
                  type="number"
                  min="0"
                  max="59"
                  value={minutes}
                  onChange={(e) => setMinutes(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                  className="mt-1"
                />
              </div>
            </div>
          </div>

          {/* New Duration Preview */}
          <div className="bg-muted/30 p-4 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">New duration:</span>
              <span className="font-mono font-bold text-lg">{formatDuration(newDurationMs)}</span>
            </div>
            {timeDifference !== 0 && (
              <div className="mt-2 text-sm text-muted-foreground">
                {isReduction ? "Reducing" : "Adding"} {formatDuration(Math.abs(timeDifference))}
              </div>
            )}
          </div>

          {/* Reason Input */}
          <div>
            <Label htmlFor="reason" className="text-sm font-medium">
              Reason for adjustment <span className="text-red-500">*</span>
            </Label>
            <Input
              id="reason"
              placeholder="e.g., Forgot to stop timer over weekend"
              value={adjustmentReason}
              onChange={(e) => setAdjustmentReason(e.target.value)}
              className="mt-1"
              maxLength={200}
            />
            <p className="text-xs text-muted-foreground mt-1">
              This will be logged in the task activity history
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isLoading || newDurationMs <= 0 || !adjustmentReason.trim()}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Adjusting...
              </>
            ) : (
              "Adjust Time"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 