"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { SessionEditModal } from "@/components/modals/SessionEditModal";
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
  const { toast } = useToast();

  // Use TanStack Query for sessions
  const { data: sessionsData, isLoading: loading, error } = useTaskSessions(taskId);

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

      {/* Edit Session Modal */}
      <SessionEditModal
        isOpen={!!editingSession}
        onClose={() => setEditingSession(null)}
        session={editingSession ? {
          id: editingSession.id,
          startTime: new Date(editingSession.startEvent.startedAt).toISOString(),
          endTime: editingSession.endEvent?.startedAt ? new Date(editingSession.endEvent.startedAt).toISOString() : undefined,
          isOngoing: editingSession.isOngoing,
        } : null}
        taskId={taskId}
        onSessionUpdated={() => {
          setEditingSession(null);
          onRefresh?.();
        }}
        adjacentSessions={editingSession ? (() => {
          const currentSessionIndex = sessions.findIndex(s => s.id === editingSession.id);
          const prevSession = currentSessionIndex < sessions.length - 1 ? sessions[currentSessionIndex + 1] : null;
          const nextSession = currentSessionIndex > 0 ? sessions[currentSessionIndex - 1] : null;
          return {
            previous: prevSession?.endEvent ? { endTime: new Date(prevSession.endEvent.startedAt).toISOString() } : undefined,
            next: nextSession ? { startTime: new Date(nextSession.startEvent.startedAt).toISOString() } : undefined,
          };
        })() : undefined}
      />
    </>
  );
} 