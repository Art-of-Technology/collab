"use client";

import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { useToast } from "@/hooks/use-toast";
import { AlertTriangle } from "lucide-react";

interface SessionAdjustmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionDurationMs: number;
  taskId: string;
  onSessionAdjusted: () => void;
}

export function SessionAdjustmentModal({
  isOpen,
  onClose,
  sessionDurationMs,
  taskId,
  onSessionAdjusted,
}: SessionAdjustmentModalProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  
  const [days, setDays] = useState(0);
  const [hours, setHours] = useState(8); // Default to 8 hours
  const [minutes, setMinutes] = useState(0);
  const [adjustmentReason, setAdjustmentReason] = useState("Long session detected - adjusted to actual work time");
  
  // Quick adjustment presets for common work session lengths
  const quickAdjustments = [
    { label: "1 hour", days: 0, hours: 1, minutes: 0 },
    { label: "2 hours", days: 0, hours: 2, minutes: 0 },
    { label: "4 hours", days: 0, hours: 4, minutes: 0 },
    { label: "8 hours", days: 0, hours: 8, minutes: 0 },
    { label: "Full day (8h)", days: 0, hours: 8, minutes: 0 },
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
  const originalDurationFormatted = formatDuration(sessionDurationMs);

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
        description: "Please provide a reason for the session adjustment.",
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
          adjustedDurationMs: newDurationMs,
          originalDurationMs: sessionDurationMs,
          adjustmentReason: adjustmentReason,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to stop and adjust session');
      }

      toast({
        title: "Session Adjusted",
        description: `Session stopped and adjusted to ${formatDuration(newDurationMs)}.`,
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
    // Reset to defaults
    setDays(0);
    setHours(8);
    setMinutes(0);
    setAdjustmentReason("Long session detected - adjusted to actual work time");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Long Session Detected</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Info Alert - matching the style from Edit Session */}
          <div className="bg-amber-50 border border-amber-200 rounded-md p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-amber-800">
                <p className="font-medium mb-1">Session Duration: {originalDurationFormatted}</p>
                <p className="text-xs text-amber-700">
                  This seems unusually long. Please adjust to your actual work time or keep if accurate.
                </p>
              </div>
            </div>
          </div>

          {/* Quick Adjustments - more compact */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Quick Adjustments</Label>
            <div className="grid grid-cols-3 gap-2">
              {quickAdjustments.slice(0, 3).map((preset) => (
                <Button
                  key={preset.label}
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickAdjustment(preset)}
                  className="text-xs h-8"
                >
                  {preset.label}
                </Button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {quickAdjustments.slice(3).map((preset) => (
                <Button
                  key={preset.label}
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickAdjustment(preset)}
                  className="text-xs h-8"
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Manual Time Input - more compact */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="hours" className="text-sm">Hours</Label>
              <Input
                id="hours"
                type="number"
                min="0"
                max="23"
                value={hours}
                onChange={(e) => setHours(Math.max(0, parseInt(e.target.value) || 0))}
                className="text-center h-8"
              />
            </div>
            <div>
              <Label htmlFor="minutes" className="text-sm">Minutes</Label>
              <Input
                id="minutes"
                type="number"
                min="0"
                max="59"
                value={minutes}
                onChange={(e) => setMinutes(Math.max(0, parseInt(e.target.value) || 0))}
                className="text-center h-8"
              />
            </div>
            <div>
              <Label htmlFor="days" className="text-sm">Days</Label>
              <Input
                id="days"
                type="number"
                min="0"
                max="7"
                value={days}
                onChange={(e) => setDays(Math.max(0, parseInt(e.target.value) || 0))}
                className="text-center h-8"
              />
            </div>
          </div>

          {/* Duration Preview - more compact */}
          <div className="flex items-center justify-between p-2 bg-muted rounded-md">
            <span className="text-sm text-muted-foreground">Adjusted Duration:</span>
            <span className="text-sm font-medium">{formatDuration(newDurationMs)}</span>
          </div>

          {/* Adjustment Reason */}
          <div>
            <Label htmlFor="reason">Reason for Adjustment</Label>
            <Textarea
              id="reason"
              value={adjustmentReason}
              onChange={(e) => setAdjustmentReason(e.target.value)}
              placeholder="Why are you adjusting this session? (e.g., forgot to stop timer, break time included)"
              rows={3}
            />
          </div>

          {/* Action Buttons - matching the style */}
          <div className="flex justify-end gap-2">
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
              disabled={isLoading || !adjustmentReason.trim()}
            >
              {isLoading ? "Adjusting..." : "Adjust & Stop"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
} 