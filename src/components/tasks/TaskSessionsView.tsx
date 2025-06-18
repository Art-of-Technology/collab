"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { 
  Clock, 
  PenLine, 
  Play, 
  Pause, 
  Square, 
  Calendar,
  Info
} from "lucide-react";
import { format } from "date-fns";
import { TaskSession } from "@/app/api/tasks/[taskId]/sessions/route";
import { useTaskSessions, useUpdateSession } from "@/hooks/queries/useTaskSessions";

interface TaskSessionsViewProps {
  taskId: string;
  onRefresh?: () => void;
}

export function TaskSessionsView({ taskId, onRefresh }: TaskSessionsViewProps) {
  const [editingSession, setEditingSession] = useState<TaskSession | null>(null);
  const [editForm, setEditForm] = useState({
    startTime: "",
    endTime: "",
    reason: "",
  });
  const { toast } = useToast();

  // Use TanStack Query for sessions
  const { data: sessionsData, isLoading: loading, error } = useTaskSessions(taskId);
  const updateSessionMutation = useUpdateSession();

  const sessions = sessionsData?.sessions || [];
  const totalTime = sessionsData?.formattedTotalTime || "0h 0m 0s";

  if (error) {
    console.error("Error fetching sessions:", error);
  }

  const handleEditSession = (session: TaskSession) => {
    if (session.isOngoing || !session.endEvent) {
      toast({
        title: "Cannot Edit",
        description: "Cannot edit ongoing sessions. Please stop the session first.",
        variant: "destructive",
      });
      return;
    }

    setEditingSession(session);
    setEditForm({
      startTime: format(new Date(session.startEvent.startedAt), "yyyy-MM-dd'T'HH:mm"),
      endTime: format(new Date(session.endEvent.startedAt), "yyyy-MM-dd'T'HH:mm"),
      reason: "",
    });
  };

  const handleSubmitEdit = async () => {
    if (!editingSession || !editForm.reason.trim()) {
      toast({
        title: "Error",
        description: "Please provide a reason for the edit.",
        variant: "destructive",
      });
      return;
    }

    const startTime = new Date(editForm.startTime);
    const endTime = new Date(editForm.endTime);
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

    // Check against adjacent sessions
    const currentSessionIndex = sessions.findIndex(s => s.id === editingSession.id);
    
    // Check against previous session
    if (currentSessionIndex < sessions.length - 1) {
      const prevSession = sessions[currentSessionIndex + 1]; // Sessions are in reverse order
      if (prevSession.endEvent && startTime <= new Date(prevSession.endEvent.startedAt)) {
        toast({
          title: "Session Overlap",
          description: `Start time cannot be earlier than or equal to the previous session's end time (${format(new Date(prevSession.endEvent.startedAt), "MMM d, HH:mm")}).`,
          variant: "destructive",
        });
        return;
      }
    }

    // Check against next session
    if (currentSessionIndex > 0) {
      const nextSession = sessions[currentSessionIndex - 1]; // Sessions are in reverse order
      if (endTime >= new Date(nextSession.startEvent.startedAt)) {
        toast({
          title: "Session Overlap",
          description: `End time cannot be later than or equal to the next session's start time (${format(new Date(nextSession.startEvent.startedAt), "MMM d, HH:mm")}).`,
          variant: "destructive",
        });
        return;
      }
    }

    try {
      await updateSessionMutation.mutateAsync({
        taskId,
        sessionId: editingSession.id,
        startTime: editForm.startTime,
        endTime: editForm.endTime,
        reason: editForm.reason.trim(),
      });

      toast({
        title: "Session Updated",
        description: "The work session has been updated successfully.",
      });
      setEditingSession(null);
      onRefresh?.();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update session",
        variant: "destructive",
      });
    }
  };

  const getSessionIcon = (session: TaskSession) => {
    if (session.isOngoing) return <Play className="h-4 w-4 text-green-500" />;
    if (session.endEvent?.eventType === "TASK_PAUSE") return <Pause className="h-4 w-4 text-yellow-500" />;
    return <Square className="h-4 w-4 text-red-500" />;
  };

  const getSessionStatus = (session: TaskSession) => {
    if (session.isOngoing) return "Playing";
    if (session.endEvent?.eventType === "TASK_PAUSE") return "Paused";
    return "Stopped";
  };

  const getSessionStatusColor = (session: TaskSession) => {
    if (session.isOngoing) return "bg-green-100 text-green-800";
    if (session.endEvent?.eventType === "TASK_PAUSE") return "bg-yellow-100 text-yellow-800";
    return "bg-gray-100 text-gray-800";
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Work Sessions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Work Sessions
            </div>
            <div className="text-sm font-medium text-muted-foreground">
              Total: {totalTime}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No work sessions recorded yet</p>
            </div>
          ) : (
            <div className="space-y-4">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="group flex items-center justify-between p-4 border rounded-lg hover:bg-muted/20 transition-colors"
                >
                  <div className="flex items-center gap-4 flex-1">
                    <div className="flex items-center gap-2">
                      {getSessionIcon(session)}
                      <Badge className={getSessionStatusColor(session)}>
                        {getSessionStatus(session)}
                      </Badge>
                    </div>
                    
                    <div className="flex-1">
                      <div className="flex items-center gap-4 text-sm">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3 text-muted-foreground" />
                          <span>
                            {format(new Date(session.startEvent.startedAt), "MMM d, HH:mm")}
                          </span>
                        </div>
                        {session.endEvent && (
                          <>
                            <span className="text-muted-foreground">→</span>
                            <span>
                              {format(new Date(session.endEvent.startedAt), "HH:mm")}
                            </span>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="font-medium text-sm">
                          {getSessionStatus(session) === "Playing" ? "Not finished" : session.formattedDuration}
                        </span>
                        {session.isAdjusted && (
                          <Badge variant="outline" className="text-xs">
                            <Info className="h-3 w-3 mr-1" />
                            Adjusted
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {!session.isOngoing && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => handleEditSession(session)}
                        title="Edit session"
                      >
                        <PenLine className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Session Dialog */}
      <Dialog open={!!editingSession} onOpenChange={() => setEditingSession(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Work Session</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Constraints Info */}
            <div className="bg-lime-300 border border-lime-200 rounded-md p-3">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-lime-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-lime-800">
                  <p className="font-medium mb-1">Session Edit Constraints:</p>
                  <ul className="text-xs space-y-1 text-lime-700">
                    <li>• Times cannot be in the future</li>
                    <li>• Start time must be before end time</li>
                    <li>• Sessions cannot overlap with adjacent sessions</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="startTime">Start Time</Label>
                <Input
                  id="startTime"
                  type="datetime-local"
                  value={editForm.startTime}
                  onChange={(e) => setEditForm(prev => ({ ...prev, startTime: e.target.value }))}
                  max={new Date().toISOString().slice(0, 16)} // Prevent future dates
                />
                {editingSession && (() => {
                  const currentSessionIndex = sessions.findIndex(s => s.id === editingSession.id);
                  const prevSession = currentSessionIndex < sessions.length - 1 ? sessions[currentSessionIndex + 1] : null;
                  return prevSession?.endEvent && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Must be after: {format(new Date(prevSession.endEvent.startedAt), "MMM d, HH:mm")}
                    </p>
                  );
                })()}
              </div>
              <div>
                <Label htmlFor="endTime">End Time</Label>
                <Input
                  id="endTime"
                  type="datetime-local"
                  value={editForm.endTime}
                  onChange={(e) => setEditForm(prev => ({ ...prev, endTime: e.target.value }))}
                  max={new Date().toISOString().slice(0, 16)} // Prevent future dates
                />
                {editingSession && (() => {
                  const currentSessionIndex = sessions.findIndex(s => s.id === editingSession.id);
                  const nextSession = currentSessionIndex > 0 ? sessions[currentSessionIndex - 1] : null;
                  return nextSession && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Must be before: {format(new Date(nextSession.startEvent.startedAt), "MMM d, HH:mm")}
                    </p>
                  );
                })()}
              </div>
            </div>
            
            <div>
              <Label htmlFor="reason">Reason for Edit</Label>
              <Textarea
                id="reason"
                placeholder="Why are you editing this session? (e.g., forgot to stop timer, incorrect time tracking)"
                value={editForm.reason}
                onChange={(e) => setEditForm(prev => ({ ...prev, reason: e.target.value }))}
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setEditingSession(null)}
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
    </>
  );
} 