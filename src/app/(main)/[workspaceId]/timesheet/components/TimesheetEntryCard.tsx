"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { SessionEditModal } from "@/components/modals/SessionEditModal";
import { 
  Clock, 
  Play, 
  Pause, 
  Square, 
  ChevronDown, 
  ExternalLink,
  Target,
  Coffee,
  Users,
  Activity,
  Eye,
  Search,
  CheckCircle2,
  PenLine
} from "lucide-react";
import { format, parseISO } from "date-fns";
import type { TimesheetEntry, TimesheetSession } from "@/app/api/activities/timesheet/route";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/context/WorkspaceContext";
import { EventType } from "@prisma/client";

interface TimesheetEntryCardProps {
  entry: TimesheetEntry;
  onRefresh: () => void;
}

export function TimesheetEntryCard({ entry, onRefresh }: TimesheetEntryCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [editingSession, setEditingSession] = useState<TimesheetSession | null>(null);
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();
  const { toast } = useToast();

  const getStatusIcon = (status: TimesheetEntry['status']) => {
    switch (status) {
      case 'ongoing':
        return <Play className="h-4 w-4 text-green-500 animate-pulse" />;
      case 'paused':
        return <Pause className="h-4 w-4 text-amber-500" />;
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-blue-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: TimesheetEntry['status']) => {
    switch (status) {
      case 'ongoing':
        return "bg-green-500/10 text-white border-green-400/30";
      case 'paused':
        return "bg-amber-500/10 text-white border-amber-400/30";
      case 'completed':
        return "bg-blue-500/10 text-white border-blue-400/30";
      default:
        return "bg-gray-500/10 text-white border-gray-400/30";
    }
  };

  const getActivityConfig = (activityType: string) => {
    switch (activityType) {
      case 'work':
        return {
          label: 'Work',
          icon: Target,
          textColor: 'text-green-400',
        };
      case 'break':
        return {
          label: 'Break',
          icon: Coffee,
          textColor: 'text-blue-400',
        };
      case 'lunch':
        return {
          label: 'Lunch',
          icon: Coffee,
          textColor: 'text-orange-400',
        };
      case 'meeting':
        return {
          label: 'Meeting',
          icon: Users,
          textColor: 'text-purple-400',
        };
      case 'travel':
        return {
          label: 'Travel',
          icon: Activity,
          textColor: 'text-indigo-400',
        };
      case 'review':
        return {
          label: 'Review',
          icon: Eye,
          textColor: 'text-teal-400',
        };
      case 'research':
        return {
          label: 'Research',
          icon: Search,
          textColor: 'text-cyan-400',
        };
      default:
        return {
          label: 'Activity',
          icon: Clock,
          textColor: 'text-gray-400',
        };
    }
  };

  const handleTaskNavigation = () => {
    if (entry.task && currentWorkspace) {
      // Try to use workspace slug and issue key if available
      if (currentWorkspace.slug && entry.task.issueKey) {
        // For timesheet entries, we might not have board slug, so construct URL manually
        router.push(`/${currentWorkspace.slug}/tasks/${entry.task.issueKey}`);
      } else {
        // Fallback to legacy URL format
        router.push(`/${currentWorkspace.id}/tasks/${entry.task.id}`);
      }
    }
  };



  const handleEditSession = (session: TimesheetSession) => {
    if (session.isOngoing || !session.endTime) {
      toast({
        title: "Cannot Edit",
        description: "Cannot edit ongoing sessions. Please stop the session first.",
        variant: "destructive",
      });
      return;
    }

    setEditingSession(session);
  };

  const getSessionIcon = (session: TimesheetSession) => {
    if (session.isOngoing) return <Play className="h-4 w-4 text-green-500" />;

    // Check the event type that ended the session
    if (session.eventType === EventType.TASK_PAUSE) {
      return <Pause className="h-4 w-4 text-amber-500" />;
    }

    return <Square className="h-4 w-4 text-red-500" />;
  };

  const getSessionStatus = (session: TimesheetSession) => {
    if (session.isOngoing) return "Playing";

    // Check the event type that ended the session
    if (session.eventType === EventType.TASK_PAUSE) {
      return "Paused";
    }

    return "Stopped";
  };

    const getSessionStatusColor = (session: TimesheetSession) => {
    if (session.isOngoing) return "bg-green-500/10 text-green-600/80 border-green-400/30";
    
    // Check the event type that ended the session
    if (session.eventType === EventType.TASK_PAUSE) {
      return "bg-amber-500/10 text-amber-600/80 border-amber-400/30";
    }
    
    return "bg-gray-500/10 text-gray-600/80 border-gray-400/30";
  };

    const activityConfig = getActivityConfig(entry.activityType);
  const ActivityIcon = activityConfig.icon;

  return (
    <>
      <Card 
        className="group cursor-pointer hover:shadow-md transition-shadow duration-200"
        onClick={() => setExpanded(!expanded)}
      >
        <CardHeader className="pb-3 md:pb-4">
          {/* Mobile Layout */}
          <div className="block md:hidden space-y-3">
            {/* Top Row: Activity Type + Time + Expand */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ActivityIcon className={`h-4 w-4 ${activityConfig.textColor}`} />
                <span className={`font-medium text-sm ${activityConfig.textColor}`}>
                  {activityConfig.label}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <div className="font-bold text-base text-foreground">
                    {entry.formattedDuration}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {entry.sessions.length} session{entry.sessions.length !== 1 ? 's' : ''}
                  </div>
                </div>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
              </div>
            </div>

            {/* Bottom Row: Task Info + Status */}
            {entry.task ? (
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {entry.task.issueKey && (
                      <span className="font-mono text-xs text-muted-foreground">
                        {entry.task.issueKey}
                      </span>
                    )}
                    <span className="font-medium text-sm text-foreground truncate">
                      {entry.task.title}
                    </span>
                  </div>
                  {entry.task.taskBoard && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {entry.task.taskBoard.name}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Badge 
                    variant="outline" 
                    className={`flex items-center gap-1 text-xs ${getStatusColor(entry.status)}`}
                  >
                    {getStatusIcon(entry.status)}
                    <span className="font-medium capitalize text-white">{entry.status}</span>
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTaskNavigation();
                    }}
                    className="h-6 w-6 p-0"
                    title="Open task"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm text-foreground">
                  {activityConfig.label} Activity
                </span>
                <Badge 
                  variant="outline" 
                  className={`flex items-center gap-1 text-xs ${getStatusColor(entry.status)}`}
                >
                  {getStatusIcon(entry.status)}
                  <span className="font-medium capitalize text-white">{entry.status}</span>
                </Badge>
              </div>
            )}
          </div>

          {/* Desktop Layout */}
          <div className="hidden md:flex items-center justify-between">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {/* Activity Type */}
              <div className="flex items-center gap-2">
                <ActivityIcon className={`h-4 w-4 ${activityConfig.textColor}`} />
                <span className={`font-medium text-sm ${activityConfig.textColor}`}>
                  {activityConfig.label}
                </span>
              </div>
              
              {/* Task Information */}
              {entry.task ? (
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {entry.task.issueKey && (
                      <span className="font-mono text-xs text-muted-foreground">
                        {entry.task.issueKey}
                      </span>
                    )}
                    <span className="font-medium text-foreground truncate">
                      {entry.task.title}
                    </span>
                    {/* Status Badge after task title */}
                    <Badge 
                      variant="outline" 
                      className={`flex items-center gap-1 ${getStatusColor(entry.status)}`}
                    >
                      {getStatusIcon(entry.status)}
                      <span className="font-medium capitalize text-white mt-1">{entry.status}</span>
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTaskNavigation();
                      }}
                      className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Open task"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  </div>
                  {entry.task.taskBoard && (
                    <div className="text-xs text-muted-foreground">
                      {entry.task.taskBoard.name}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex-1 flex items-center gap-2">
                  <span className="font-medium text-foreground">
                    {activityConfig.label} Activity
                  </span>
                  {/* Status Badge after activity title */}
                  <Badge 
                    variant="outline" 
                    className={`flex items-center gap-1 ${getStatusColor(entry.status)}`}
                  >
                    {getStatusIcon(entry.status)}
                    <span className="font-medium capitalize text-white mt-1">{entry.status}</span>
                  </Badge>
                </div>
              )}
            </div>

            {/* Time Info */}
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="font-bold text-lg text-foreground">
                  {entry.formattedDuration}
                </div>
                <div className="text-xs text-muted-foreground">
                  {entry.sessions.length} session{entry.sessions.length !== 1 ? 's' : ''}
                </div>
              </div>

              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
            </div>
          </div>
        </CardHeader>

        {expanded && (
          <CardContent className="border-t pt-4">
            <div className="space-y-4">
              {entry.sessions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No work sessions recorded yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {entry.sessions.map((session) => (
                    <div
                      key={session.id}
                      className="group/session flex items-center justify-between p-3 border rounded-lg hover:bg-muted/20 transition-colors"
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <div className="flex items-center gap-2">
                          {getSessionIcon(session)}
                          <Badge variant="outline" className={getSessionStatusColor(session)}>
                            {getSessionStatus(session)}
                          </Badge>
                        </div>
                        
                        <div className="flex-1">
                          <div className="flex items-center gap-3 text-sm">
                            <span>
                              {format(parseISO(session.startTime), "MMM d, HH:mm")}
                            </span>
                            {session.endTime && (
                              <>
                                <span className="text-muted-foreground">→</span>
                                <span>
                                  {format(parseISO(session.endTime), "HH:mm")}
                                </span>
                              </>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="font-medium text-sm">
                              {session.isOngoing ? "Not finished" : session.formattedDuration}
                            </span>
                            {session.isAdjusted && (
                              <Badge variant="outline" className="text-xs">
                                Adjusted
                              </Badge>
                            )}
                          </div>
                          {session.description && (
                            <div className="text-xs text-muted-foreground mt-1">
                              {session.description}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {!session.isOngoing && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 opacity-0 group-hover/session:opacity-100 transition-opacity"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditSession(session);
                            }}
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
          </CardContent>
        )}
      </Card>

      {/* Edit Session Modal */}
      <SessionEditModal
        isOpen={!!editingSession}
        onClose={() => setEditingSession(null)}
        session={editingSession}
        taskId={entry.task?.id || entry.id}
        onSessionUpdated={() => {
          setEditingSession(null);
          onRefresh?.();
        }}
      />
    </>
  );
} 