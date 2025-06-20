"use client";

import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { CalendarIcon, AlertTriangle, Clock, Info } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface SessionAdjustmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionDurationMs: number;
  taskId: string;
  onSessionAdjusted: () => void;
  mode?: 'auto' | 'manual'; // auto = triggered by 24h+ session, manual = user clicked adjust button
}

export function SessionAdjustmentModal({
  isOpen,
  onClose,
  sessionDurationMs,
  taskId,
  onSessionAdjusted,
  mode = 'auto'
}: SessionAdjustmentModalProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  
  const [adjustForm, setAdjustForm] = useState({
    startDate: null as Date | null,
    startHour: "",
    startMinute: "",
    endDate: null as Date | null,
    endHour: "",
    endMinute: "",
    reason: "",
  });

  // Generate hour and minute options
  const hourOptions = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
  const minuteOptions = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'));

  // Quick adjustment presets
  const quickAdjustments = [
    { label: "1 hour", hours: 1, minutes: 0 },
    { label: "2 hours", hours: 2, minutes: 0 },
    { label: "4 hours", hours: 4, minutes: 0 },
    { label: "8 hours", hours: 8, minutes: 0 },
  ];

  // Initialize form when modal opens
  useEffect(() => {
    if (isOpen && !isInitialized) {
      const now = new Date();
      const sessionStartTime = new Date(now.getTime() - sessionDurationMs);
      
      // Default to a reasonable session duration based on mode
      const defaultDurationMs = mode === 'auto' ? 8 * 60 * 60 * 1000 : sessionDurationMs; // 8 hours for auto, original for manual
      const defaultEndTime = new Date(sessionStartTime.getTime() + defaultDurationMs);
      
      // Ensure default end time is not in the future
      const maxEndTime = defaultEndTime > now ? now : defaultEndTime;
      
      setAdjustForm({
        startDate: sessionStartTime,
        startHour: sessionStartTime.getHours().toString().padStart(2, '0'),
        startMinute: sessionStartTime.getMinutes().toString().padStart(2, '0'),
        endDate: maxEndTime,
        endHour: maxEndTime.getHours().toString().padStart(2, '0'),
        endMinute: maxEndTime.getMinutes().toString().padStart(2, '0'),
        reason: mode === 'auto' 
          ? "Long session detected - adjusted to actual work time"
          : "Manual session time adjustment",
      });
      setIsInitialized(true);
    }
  }, [isOpen, sessionDurationMs, mode, isInitialized]);

  // Reset initialization flag when modal closes
  useEffect(() => {
    if (!isOpen) {
      setIsInitialized(false);
    }
  }, [isOpen]);

  const combineDateTime = (date: Date | null, hour: string, minute: string): Date | null => {
    if (!date || !hour || !minute) return null;
    const combined = new Date(date);
    combined.setHours(parseInt(hour), parseInt(minute), 0, 0);
    return combined;
  };

  const formatDuration = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const d = Math.floor(totalSeconds / (3600 * 24));
    const h = Math.floor((totalSeconds % (3600 * 24)) / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);

    if (d > 0) return `${d}d ${h}h ${m}m`;
    return `${h}h ${m}m`;
  };

  const handleQuickAdjustment = (preset: { hours: number; minutes: number }) => {
    if (!adjustForm.startDate) return;
    
    const now = new Date();
    const newEndTime = new Date(adjustForm.startDate);
    newEndTime.setHours(
      adjustForm.startDate.getHours() + preset.hours,
      adjustForm.startDate.getMinutes() + preset.minutes,
      0,
      0
    );
    
    // Ensure the new end time is not in the future
    const finalEndTime = newEndTime > now ? now : newEndTime;
    
    setAdjustForm(prev => ({
      ...prev,
      endDate: finalEndTime,
      endHour: finalEndTime.getHours().toString().padStart(2, '0'),
      endMinute: finalEndTime.getMinutes().toString().padStart(2, '0'),
    }));
  };

  const handleSave = async () => {
    if (!adjustForm.reason.trim()) {
      toast({
        title: "Error",
        description: "Please provide a reason for the adjustment.",
        variant: "destructive",
      });
      return;
    }

    const startTime = combineDateTime(adjustForm.startDate, adjustForm.startHour, adjustForm.startMinute);
    const endTime = combineDateTime(adjustForm.endDate, adjustForm.endHour, adjustForm.endMinute);

    if (!startTime || !endTime) {
      toast({
        title: "Invalid Time",
        description: "Please select both start and end dates and times.",
        variant: "destructive",
      });
      return;
    }

    const now = new Date();

    // Client-side validation
    if (startTime >= endTime) {
      toast({
        title: "Invalid Time Range",
        description: "Start time must be before end time.",
        variant: "destructive",
      });
      return;
    }

    // Since start time is read-only (current session start), we only need to validate end time
    if (endTime > now) {
      toast({
        title: "Invalid End Time", 
        description: "End time cannot be in the future.",
        variant: "destructive",
      });
      return;
    }



    const adjustedDurationMs = endTime.getTime() - startTime.getTime();
    if (adjustedDurationMs <= 0) {
      toast({
        title: "Invalid Duration",
        description: "The adjusted session duration must be greater than 0.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      // Stop the current session with adjustment metadata
      const response = await fetch(`/api/tasks/${taskId}/stop-with-adjustment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adjustedStartTime: startTime.toISOString(),
          adjustedEndTime: endTime.toISOString(),
          adjustedDurationMs,
          originalDurationMs: sessionDurationMs,
          adjustmentReason: adjustForm.reason.trim(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to stop and adjust session');
      }

      toast({
        title: "Session Adjusted",
        description: `Session stopped and adjusted to ${formatDuration(adjustedDurationMs)}.`,
      });

      onSessionAdjusted();
      onClose();
    } catch (error) {
      console.error('Error adjusting session:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to adjust session",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleStopWithoutAdjustment = async () => {
    setIsLoading(true);
    try {
      // Just stop the session normally without adjustment
      const response = await fetch(`/api/tasks/${taskId}/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to stop session');
      }

      toast({
        title: "Session Stopped",
        description: "Session stopped with original duration.",
      });

      onSessionAdjusted();
      onClose();
    } catch (error) {
      console.error('Error stopping session:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to stop session",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setAdjustForm({
      startDate: null,
      startHour: "",
      startMinute: "",
      endDate: null,
      endHour: "",
      endMinute: "",
      reason: "",
    });
    setIsInitialized(false);
    onClose();
  };

  // Calculate adjusted duration for display
  const adjustedDuration = combineDateTime(adjustForm.endDate, adjustForm.endHour, adjustForm.endMinute) && 
                           combineDateTime(adjustForm.startDate, adjustForm.startHour, adjustForm.startMinute)
    ? formatDuration(
        combineDateTime(adjustForm.endDate, adjustForm.endHour, adjustForm.endMinute)!.getTime() - 
        combineDateTime(adjustForm.startDate, adjustForm.startHour, adjustForm.startMinute)!.getTime()
      )
    : "Invalid";

  const getModalContent = () => {
    const originalDuration = formatDuration(sessionDurationMs);

    if (mode === 'auto') {
      return {
        title: "Long Session Detected",
        alertIcon: <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />,
        alertClass: "bg-amber-50 border border-amber-200 rounded-md p-3 dark:bg-amber-950/20 dark:border-amber-800",
        alertTextClass: "text-sm text-amber-800 dark:text-amber-200",
        message: (
          <>
            <p className="font-medium mb-1">Session Duration: {originalDuration}</p>
            <p className="text-xs text-amber-700 dark:text-amber-300">
              This seems unusually long. Please adjust to your actual work time or keep if accurate.
            </p>
          </>
        )
      };
    } else {
      return {
        title: "Adjust Session Time",
        alertIcon: <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />,
        alertClass: "bg-blue-50 border border-blue-200 rounded-md p-3 dark:bg-blue-950/20 dark:border-blue-800",
        alertTextClass: "text-sm text-blue-800 dark:text-blue-200",
        message: (
          <>
            <p className="font-medium mb-1">Current Session: {originalDuration}</p>
            <p className="text-xs text-blue-700 dark:text-blue-300">
              Adjust the session start and end times to reflect your actual work period.
            </p>
          </>
        )
      };
    }
  };

  const modalContent = getModalContent();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            {modalContent.title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status Info */}
          <div className={modalContent.alertClass}>
            <div className="flex items-start gap-2">
              {modalContent.alertIcon}
              <div className={modalContent.alertTextClass}>
                {modalContent.message}
              </div>
            </div>
          </div>

          {/* Session Adjustment Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-md p-3 dark:bg-blue-950/20 dark:border-blue-800">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-800 dark:text-blue-200">
                <p className="font-medium mb-1">Quick Session Adjustment:</p>
                <ul className="text-xs space-y-1 text-blue-700 dark:text-blue-300">
                  <li>• Start time is fixed to when you began this session</li>
                  <li>• Only end time can be adjusted (cannot be in the future)</li>
                  <li>• For more complex edits, use &quot;Edit Session&quot; after stopping</li>
                </ul>
              </div>
            </div>
          </div>

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

          {/* Time Selection */}
          <div className="space-y-6">
            {/* Start Time */}
            <div className="space-y-2">
              <Label>Start Time (Session Start)</Label>
              <div className="text-xs text-muted-foreground mb-2">
                Fixed to when you actually started this session
              </div>
              
              {/* Start Date */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      disabled={true}
                      className={cn(
                        "w-full justify-start text-left font-normal opacity-60 cursor-not-allowed",
                        !adjustForm.startDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {adjustForm.startDate ? format(adjustForm.startDate, "MMM d, yyyy") : "Select date"}
                    </Button>
                  </PopoverTrigger>
                </Popover>
              </div>

              {/* Start Time */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Hour</Label>
                  <Select value={adjustForm.startHour} disabled={true}>
                    <SelectTrigger className="opacity-60 cursor-not-allowed">
                      <SelectValue placeholder="HH" />
                    </SelectTrigger>
                    <SelectContent>
                      {hourOptions.map((hour) => (
                        <SelectItem key={hour} value={hour}>{hour}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Minute</Label>
                  <Select value={adjustForm.startMinute} disabled={true}>
                    <SelectTrigger className="opacity-60 cursor-not-allowed">
                      <SelectValue placeholder="MM" />
                    </SelectTrigger>
                    <SelectContent>
                      {minuteOptions.map((minute) => (
                        <SelectItem key={minute} value={minute}>{minute}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* End Time */}
            <div className="space-y-2">
              <Label>End Time (Adjustable)</Label>
              <div className="text-xs text-muted-foreground mb-2">
                Set when you actually stopped working
              </div>
              
              {/* End Date */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !adjustForm.endDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {adjustForm.endDate ? format(adjustForm.endDate, "MMM d, yyyy") : "Select date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={adjustForm.endDate || undefined}
                      onSelect={(date) => setAdjustForm(prev => ({ ...prev, endDate: date || null }))}
                      disabled={(date) => date > new Date()}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* End Time */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Hour</Label>
                  <Select value={adjustForm.endHour} onValueChange={(value) => setAdjustForm(prev => ({ ...prev, endHour: value }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="HH" />
                    </SelectTrigger>
                    <SelectContent>
                      {hourOptions.map((hour) => (
                        <SelectItem key={hour} value={hour}>{hour}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Minute</Label>
                  <Select value={adjustForm.endMinute} onValueChange={(value) => setAdjustForm(prev => ({ ...prev, endMinute: value }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="MM" />
                    </SelectTrigger>
                    <SelectContent>
                      {minuteOptions.map((minute) => (
                        <SelectItem key={minute} value={minute}>{minute}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="text-xs text-muted-foreground">
                Cannot be in the future or before session start
              </div>
            </div>
          </div>

          {/* Duration Preview */}
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <span className="text-sm text-muted-foreground">Adjusted Duration:</span>
            <span className="text-sm font-medium">{adjustedDuration}</span>
          </div>

          {/* Adjustment Reason */}
          <div className="space-y-2">
            <Label htmlFor="reason">Reason for Adjustment</Label>
            <Textarea
              id="reason"
              value={adjustForm.reason}
              onChange={(e) => setAdjustForm(prev => ({ ...prev, reason: e.target.value }))}
              placeholder="Why are you adjusting this session? (e.g., forgot to stop timer, break time included)"
              rows={3}
              className="resize-none"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={handleStopWithoutAdjustment}
              disabled={isLoading}
            >
              {isLoading ? "Stopping..." : "Keep Original"}
            </Button>
            <Button
              onClick={handleSave}
              disabled={isLoading || !adjustForm.reason.trim()}
            >
              {isLoading ? "Adjusting..." : "Adjust & Stop"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
} 