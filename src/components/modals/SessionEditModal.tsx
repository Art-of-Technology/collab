"use client";

import React, { useState, useEffect } from "react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
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
import { useToast } from "@/hooks/use-toast";
import { CalendarIcon, Clock, Info } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useUpdateSession } from "@/hooks/queries/useTaskSessions";

interface SessionEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: {
    id: string;
    startTime: string;
    endTime?: string;
    isOngoing: boolean;
  } | null;
  taskId: string;
  onSessionUpdated?: () => void;
  adjacentSessions?: {
    previous?: { endTime: string };
    next?: { startTime: string };
  };
}

export function SessionEditModal({ 
  isOpen, 
  onClose, 
  session, 
  taskId, 
  onSessionUpdated,
  adjacentSessions 
}: SessionEditModalProps) {
  const [editForm, setEditForm] = useState({
    startDate: null as Date | null,
    startHour: "",
    startMinute: "",
    endDate: null as Date | null,
    endHour: "",
    endMinute: "",
    reason: "",
  });
  const { toast } = useToast();
  const updateSessionMutation = useUpdateSession();
  const [isInitialized, setIsInitialized] = useState(false);

  // Generate hour and minute options
  const hourOptions = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
  const minuteOptions = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'));

  // Initialize form only once when modal opens with a session
  useEffect(() => {
    if (isOpen && session && !session.isOngoing && session.endTime && !isInitialized) {
      const startDate = new Date(session.startTime);
      const endDate = new Date(session.endTime);
      
      setEditForm({
        startDate: startDate,
        startHour: startDate.getHours().toString().padStart(2, '0'),
        startMinute: startDate.getMinutes().toString().padStart(2, '0'),
        endDate: endDate,
        endHour: endDate.getHours().toString().padStart(2, '0'),
        endMinute: endDate.getMinutes().toString().padStart(2, '0'),
        reason: "",
      });
      setIsInitialized(true);
    }
  }, [isOpen, session, isInitialized]);

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

  const handleSubmitEdit = async () => {
    if (!session || !editForm.reason.trim()) {
      toast({
        title: "Error",
        description: "Please provide a reason for the edit.",
        variant: "destructive",
      });
      return;
    }

    const startTime = combineDateTime(editForm.startDate, editForm.startHour, editForm.startMinute);
    const endTime = combineDateTime(editForm.endDate, editForm.endHour, editForm.endMinute);

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

    if (startTime > now) {
      toast({
        title: "Invalid Start Time",
        description: "Start time cannot be in the future.",
        variant: "destructive",
      });
      return;
    }

    if (endTime > now) {
      toast({
        title: "Invalid End Time", 
        description: "End time cannot be in the future.",
        variant: "destructive",
      });
      return;
    }

    // Check against adjacent sessions if provided
    if (adjacentSessions?.previous && startTime <= new Date(adjacentSessions.previous.endTime)) {
      toast({
        title: "Session Overlap",
        description: `Start time cannot be earlier than or equal to the previous session's end time (${format(new Date(adjacentSessions.previous.endTime), "MMM d, HH:mm")}).`,
        variant: "destructive",
      });
      return;
    }

    if (adjacentSessions?.next && endTime >= new Date(adjacentSessions.next.startTime)) {
      toast({
        title: "Session Overlap",
        description: `End time cannot be later than or equal to the next session's start time (${format(new Date(adjacentSessions.next.startTime), "MMM d, HH:mm")}).`,
        variant: "destructive",
      });
      return;
    }

    try {
      await updateSessionMutation.mutateAsync({
        taskId,
        sessionId: session.id,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        reason: editForm.reason.trim(),
      });

      toast({
        title: "Session Updated",
        description: "The work session has been updated successfully.",
      });
      
      onClose();
      onSessionUpdated?.();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update session",
        variant: "destructive",
      });
    }
  };

  const handleClose = () => {
    setEditForm({ 
      startDate: null,
      startHour: "",
      startMinute: "",
      endDate: null,
      endHour: "",
      endMinute: "",
      reason: "" 
    });
    setIsInitialized(false);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Work Session</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Constraints Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-md p-3 dark:bg-blue-950/20 dark:border-blue-800">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-800 dark:text-blue-200">
                <p className="font-medium mb-1">Session Edit Constraints:</p>
                <ul className="text-xs space-y-1 text-blue-700 dark:text-blue-300">
                  <li>• Times cannot be in the future</li>
                  <li>• Start time must be before end time</li>
                  <li>• Sessions cannot overlap with adjacent sessions</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Start Time */}
            <div className="space-y-2">
              <Label>Start Time</Label>
              
              {/* Start Date */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !editForm.startDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {editForm.startDate ? format(editForm.startDate, "MMM d, yyyy") : "Select date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={editForm.startDate || undefined}
                      onSelect={(date) => setEditForm(prev => ({ ...prev, startDate: date || null }))}
                      disabled={(date) => date > new Date()}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Start Time */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Hour</Label>
                  <Select value={editForm.startHour} onValueChange={(value) => setEditForm(prev => ({ ...prev, startHour: value }))}>
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
                  <Select value={editForm.startMinute} onValueChange={(value) => setEditForm(prev => ({ ...prev, startMinute: value }))}>
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

              {adjacentSessions?.previous && (
                <p className="text-xs text-muted-foreground">
                  Must be after: {format(new Date(adjacentSessions.previous.endTime), "MMM d, HH:mm")}
                </p>
              )}
            </div>

            {/* End Time */}
            <div className="space-y-2">
              <Label>End Time</Label>
              
              {/* End Date */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !editForm.endDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {editForm.endDate ? format(editForm.endDate, "MMM d, yyyy") : "Select date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={editForm.endDate || undefined}
                      onSelect={(date) => setEditForm(prev => ({ ...prev, endDate: date || null }))}
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
                  <Select value={editForm.endHour} onValueChange={(value) => setEditForm(prev => ({ ...prev, endHour: value }))}>
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
                  <Select value={editForm.endMinute} onValueChange={(value) => setEditForm(prev => ({ ...prev, endMinute: value }))}>
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

              {adjacentSessions?.next && (
                <p className="text-xs text-muted-foreground">
                  Must be before: {format(new Date(adjacentSessions.next.startTime), "MMM d, HH:mm")}
                </p>
              )}
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="reason">Reason for Edit</Label>
            <Textarea
              id="reason"
              placeholder="Why are you editing this session? (e.g., forgot to stop timer, incorrect time tracking)"
              value={editForm.reason}
              onChange={(e) => setEditForm(prev => ({ ...prev, reason: e.target.value }))}
              rows={3}
              className="resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={updateSessionMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmitEdit}
              disabled={updateSessionMutation.isPending || !editForm.reason.trim()}
            >
              {updateSessionMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
} 