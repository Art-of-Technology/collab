"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

// TODO: Update this type to match Issue sessions API structure
interface IssueSession {
  id: string;
  isOngoing: boolean;
  formattedDuration: string;
  isAdjusted: boolean;
  startEvent: {
    startedAt: string;
  };
  endEvent?: {
    startedAt: string;
    eventType: string;
  };
  user: {
    id: string;
    name: string | null;
    image: string | null;
  };
}

interface IssueSessionsData {
  sessions: IssueSession[];
  formattedTotalTime: string;
}

interface IssueSessionsViewProps {
  issueId: string;
  onRefresh?: () => void;
}

export function IssueSessionsView({ issueId, onRefresh }: IssueSessionsViewProps) {
  const [editingSession, setEditingSession] = useState<IssueSession | null>(null);
  const [sessionsData, setSessionsData] = useState<IssueSessionsData>({ sessions: [], formattedTotalTime: "0h 0m 0s" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // TODO: Implement useIssueSessions hook similar to useTaskSessions
  // For now, this is a placeholder implementation
  React.useEffect(() => {
    const fetchSessions = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/issues/${issueId}/sessions`);
        if (response.ok) {
          const data = await response.json();
          setSessionsData(data);
        } else {
          throw new Error("Failed to fetch sessions");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load sessions");
      } finally {
        setLoading(false);
      }
    };

    fetchSessions();
  }, [issueId]);

  const sessions = sessionsData.sessions;
  const totalTime = sessionsData.formattedTotalTime;

  const handleEditSession = (session: IssueSession) => {
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

  const getSessionIcon = (session: IssueSession) => {
    if (session.isOngoing) return <Play className="h-4 w-4 text-green-500" />;
    if (session.endEvent?.eventType === "TASK_PAUSE") return <Pause className="h-4 w-4 text-yellow-500" />;
    return <Square className="h-4 w-4 text-red-500" />;
  };

  const getSessionStatus = (session: IssueSession) => {
    if (session.isOngoing) return "Playing";
    if (session.endEvent?.eventType === "TASK_PAUSE") return "Paused";
    return "Stopped";
  };

  const getSessionStatusColor = (session: IssueSession) => {
    if (session.isOngoing) return "bg-green-500/20 text-green-400 border-green-500/30";
    if (session.endEvent?.eventType === "TASK_PAUSE") return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    return "bg-red-500/20 text-red-400 border-red-500/30";
  };

  if (loading) {
    return (
      <div className="p-8 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-400 mb-2">Failed to load time tracking data</p>
        <p className="text-sm text-[#666]">{error}</p>
      </div>
    );
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <div className="text-sm font-medium text-[#888]">
          Total: {totalTime}
        </div>
      </div>

      <div>
          {sessions.length === 0 ? (
            <div className="text-center py-8">
              <Clock className="h-12 w-12 mx-auto mb-4 text-[#333]" />
              <p className="text-[#ccc] text-sm">No work sessions recorded yet</p>
              <p className="text-[#666] text-xs mt-1">Start working on this issue to track time</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="group flex items-center justify-between p-3 border border-[#1f1f1f] rounded-lg hover:bg-[#0d0d0d] transition-colors"
                >
                  <div className="flex items-center gap-4 flex-1">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={session.user.image || undefined} alt={session.user.name || "User"} />
                        <AvatarFallback className="bg-[#1a1a1a] text-[#ccc]">
                          {session.user.name?.charAt(0).toUpperCase() || "U"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex items-center gap-2">
                        {getSessionIcon(session)}
                        <Badge className={getSessionStatusColor(session)}>
                          {getSessionStatus(session)}
                        </Badge>
                      </div>
                    </div>
                    
                    <div className="flex-1">
                      <div className="flex items-center gap-4 text-sm">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3 text-[#666]" />
                          <span className="text-[#ccc]">
                            {format(new Date(session.startEvent.startedAt), "MMM d, HH:mm")}
                          </span>
                        </div>
                        {session.endEvent && (
                          <>
                            <span className="text-[#666]">→</span>
                            <span className="text-[#ccc]">
                              {format(new Date(session.endEvent.startedAt), "HH:mm")}
                            </span>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="font-medium text-sm text-[#e1e7ef]">
                          {getSessionStatus(session) === "Playing" ? "In progress" : session.formattedDuration}
                        </span>
                        <span className="text-xs text-[#666]">
                          by {session.user.name}
                        </span>
                        {session.isAdjusted && (
                          <Badge variant="outline" className="text-xs border-[#333] text-[#888]">
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
                        className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-[#1a1a1a] text-[#666] hover:text-[#ccc]"
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
      </div>

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
        taskId={issueId} // TODO: Update SessionEditModal to support issues
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
