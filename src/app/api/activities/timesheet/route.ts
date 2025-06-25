import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { EventType } from "@prisma/client";
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfDay, endOfDay, format } from "date-fns";
import { formatDurationDetailed } from "@/utils/duration";

export interface TimesheetEntry {
  id: string;
  date: string;
  task?: {
    id: string;
    title: string;
    issueKey?: string;
    priority: string;
    taskBoard?: {
      id: string;
      name: string;
    };
  };
  sessions: TimesheetSession[];
  totalDuration: number;
  formattedDuration: string;
  activityType: string;
  status: 'completed' | 'paused' | 'ongoing';
}

export interface TimesheetSession {
  id: string;
  startTime: string;
  endTime?: string;
  duration: number;
  formattedDuration: string;
  isOngoing: boolean;
  isAdjusted: boolean;
  eventType: EventType;
  description?: string;
}

export interface TimesheetSummary {
  totalWorkTime: number;
  totalBreakTime: number;
  totalMeetingTime: number;
  totalResearchTime: number;
  totalReviewTime: number;
  totalTasks: number;
  totalActiveTasks: number;
  totalPausedTasks: number;
  formattedTotalWorkTime: string;
  formattedTotalBreakTime: string;
  formattedTotalMeetingTime: string;
  formattedTotalResearchTime: string;
  formattedTotalReviewTime: string;
  productivityScore: number;
}

export interface TimesheetData {
  entries: TimesheetEntry[];
  summary: TimesheetSummary;
  dateRange: {
    start: string;
    end: string;
  };
}



function getActivityType(eventType: EventType): string {
  const typeMap: Record<EventType, string> = {
    [EventType.TASK_START]: 'work',
    [EventType.TASK_PAUSE]: 'work',
    [EventType.TASK_STOP]: 'work',
    [EventType.TASK_COMPLETE]: 'work',
    [EventType.LUNCH_START]: 'break',
    [EventType.LUNCH_END]: 'break',
    [EventType.BREAK_START]: 'break',
    [EventType.BREAK_END]: 'break',
    [EventType.MEETING_START]: 'meeting',
    [EventType.MEETING_END]: 'meeting',
    [EventType.TRAVEL_START]: 'travel',
    [EventType.TRAVEL_END]: 'travel',
    [EventType.REVIEW_START]: 'review',
    [EventType.REVIEW_END]: 'review',
    [EventType.RESEARCH_START]: 'research',
    [EventType.RESEARCH_END]: 'research',
    [EventType.OFFLINE]: 'offline',
    [EventType.AVAILABLE]: 'available',
  };
  return typeMap[eventType] || 'other';
}

function getSessionDescription(startEventType: EventType, endEventType?: EventType, activityNote?: string): string {
  // For ongoing sessions (no end event)
  if (!endEventType) {
    const baseDescription = (() => {
      switch (startEventType) {
        case EventType.TASK_START:
          return 'Working on task';
        case EventType.LUNCH_START:
          return 'On lunch break';
        case EventType.BREAK_START:
          return 'Taking a break';
        case EventType.MEETING_START:
          return 'In a meeting';
        case EventType.TRAVEL_START:
          return 'Traveling';
        case EventType.REVIEW_START:
          return 'Reviewing work';
        case EventType.RESEARCH_START:
          return 'Researching';
        default:
          return 'Active';
      }
    })();

    // Add activity note if available
    return activityNote ? `${baseDescription}: ${activityNote}` : baseDescription;
  }

  // For completed sessions, focus on what was accomplished
  const baseDescription = (() => {
    switch (startEventType) {
      case EventType.TASK_START:
        if (endEventType === EventType.TASK_PAUSE) {
          return 'Work session (paused)';
        } else if (endEventType === EventType.TASK_STOP) {
          return 'Work session (completed)';
        }
        return 'Work session';
      case EventType.LUNCH_START:
        return 'Lunch break';
      case EventType.BREAK_START:
        return 'Break time';
      case EventType.MEETING_START:
        return 'Meeting session';
      case EventType.TRAVEL_START:
        return 'Travel time';
      case EventType.REVIEW_START:
        return 'Review session';
      case EventType.RESEARCH_START:
        return 'Research session';
      default:
        return 'Activity session';
    }
  })();

  // Add activity note if available
  return activityNote ? `${baseDescription}: ${activityNote}` : baseDescription;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId');
    const view = searchParams.get('view') || 'daily'; // daily, weekly, monthly
    const date = searchParams.get('date') || new Date().toISOString();
    const boardId = searchParams.get('boardId'); // Optional filter
    const userId = session.user.id;

    if (!workspaceId) {
      return NextResponse.json({ error: "Workspace ID is required" }, { status: 400 });
    }

    // Verify workspace access
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        OR: [
          { ownerId: userId },
          { members: { some: { userId } } }
        ]
      }
    });

    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found or access denied" }, { status: 403 });
    }

    // Calculate date range based on view
    const targetDate = new Date(date);
    let startDate: Date, endDate: Date;

    switch (view) {
      case 'weekly':
        startDate = startOfWeek(targetDate, { weekStartsOn: 1 }); // Monday
        endDate = endOfWeek(targetDate, { weekStartsOn: 1 }); // Sunday
        break;
      case 'monthly':
        startDate = startOfMonth(targetDate);
        endDate = endOfMonth(targetDate);
        break;
      default: // daily
        startDate = startOfDay(targetDate);
        endDate = endOfDay(targetDate);
        break;
    }

    // Debug logging for the specific issue
    console.log(`[TIMESHEET DEBUG] View: ${view}, Target Date: ${targetDate.toISOString()}`);
    console.log(`[TIMESHEET DEBUG] Date range: ${startDate.toISOString()} to ${endDate.toISOString()}`);
    console.log(`[TIMESHEET DEBUG] June 19, 2024 would be: ${new Date('2024-06-19').toISOString()}`);

    // Fetch user events in the date range
    const userEvents = await prisma.userEvent.findMany({
      where: {
        userId,
        startedAt: {
          gte: startDate,
          lte: endDate,
        },
        ...(boardId && {
          task: {
            taskBoardId: boardId
          }
        })
      },
      include: {
        task: {
          select: {
            id: true,
            title: true,
            issueKey: true,
            priority: true,
            status: true,
            taskBoard: {
              select: {
                id: true,
                name: true,
              }
            }
          }
        }
      },
      orderBy: { startedAt: 'asc' }
    });

    // Process events into proper sessions, handling activity transitions
    const taskSessions: Record<string, TimesheetSession[]> = {};
    
    // Sort ALL events by time first to detect transitions
    const allEventsSorted = userEvents.sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
    
    // Group events by task/activity while preserving order
    const eventsByKey: Record<string, typeof userEvents> = {};
    for (const event of allEventsSorted) {
      const activityType = getActivityType(event.eventType);
      const sessionKey = event.taskId ? `task-${event.taskId}` : `activity-${activityType}`;
      
      if (!eventsByKey[sessionKey]) {
        eventsByKey[sessionKey] = [];
      }
      eventsByKey[sessionKey].push(event);
    }

    // Find the most recent activity to determine what's truly ongoing
    let mostRecentActivity: { sessionKey: string; startTime: Date } | null = null;
    for (const event of allEventsSorted) {
      if (event.eventType === EventType.TASK_START || event.eventType.endsWith('_START')) {
        const activityType = getActivityType(event.eventType);
        const sessionKey = event.taskId ? `task-${event.taskId}` : `activity-${activityType}`;
        mostRecentActivity = { sessionKey, startTime: event.startedAt };
      }
    }

    // Process each task/activity's events into sessions
    for (const [sessionKey, events] of Object.entries(eventsByKey)) {
      taskSessions[sessionKey] = [];
      
      // Sort events by time
      events.sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
      
      let currentStart: typeof events[0] | null = null;
      
      for (const event of events) {
        // Handle session start events
        if (event.eventType === EventType.TASK_START || event.eventType.endsWith('_START')) {
          currentStart = event;
        }
        // Handle session end events
        else if ((event.eventType === EventType.TASK_PAUSE || 
                  event.eventType === EventType.TASK_STOP ||
                  event.eventType.endsWith('_END')) && currentStart) {
          
          const duration = event.startedAt.getTime() - currentStart.startedAt.getTime();
          const oneMinuteMs = 60 * 1000; // 1 minute in milliseconds
          
          // Skip sessions shorter than 1 minute (these are test sessions)
          if (duration < oneMinuteMs) {
            currentStart = null;
            continue;
          }
          
          // Check if session was edited and get edit reason
          const startMetadata = (currentStart.metadata as any) || {};
          const endMetadata = (event.metadata as any) || {};
          const isAdjusted = !!(endMetadata.editedAt || startMetadata.editedAt);
          const editReason = endMetadata.editReason || startMetadata.editReason;
          
          // Get the base description with original activity note
          let sessionDescription = getSessionDescription(currentStart.eventType, event.eventType, currentStart.description || undefined);
          
          // If session was adjusted, append the edit reason
          if (isAdjusted && editReason) {
            sessionDescription += ` (Adjusted: ${editReason})`;
          }
          
          const session: TimesheetSession = {
            id: `${currentStart.id}-${event.id}`,
            startTime: currentStart.startedAt.toISOString(),
            endTime: event.startedAt.toISOString(),
            duration,
            formattedDuration: formatDurationDetailed(duration),
            isOngoing: false,
            isAdjusted,
            eventType: event.eventType, // Use the END event type to determine session status
            description: sessionDescription,
          };
          taskSessions[sessionKey].push(session);
          currentStart = null;
        }
      }
      
      // Handle ongoing sessions (currentStart exists but no end event)
      if (currentStart) {
        // Check if this is actually the most recent activity
        const isCurrentlyOngoing = mostRecentActivity && 
          mostRecentActivity.sessionKey === sessionKey &&
          mostRecentActivity.startTime.getTime() === currentStart.startedAt.getTime();

        if (isCurrentlyOngoing) {
          // This is truly ongoing
          const duration = Date.now() - currentStart.startedAt.getTime();
          
          // Check if start event was edited
          const startMetadata = (currentStart.metadata as any) || {};
          const isAdjusted = !!startMetadata.editedAt;
          const editReason = startMetadata.editReason;
          
          // Get the base description with original activity note
          let sessionDescription = getSessionDescription(currentStart.eventType, undefined, currentStart.description || undefined);
          
          // If session was adjusted, append the edit reason
          if (isAdjusted && editReason) {
            sessionDescription += ` (Adjusted: ${editReason})`;
          }
          
          const session: TimesheetSession = {
            id: `${currentStart.id}-ongoing`,
            startTime: currentStart.startedAt.toISOString(),
            duration,
            formattedDuration: formatDurationDetailed(duration),
            isOngoing: true,
            isAdjusted,
            eventType: currentStart.eventType,
            description: sessionDescription,
          };
          taskSessions[sessionKey].push(session);
        } else {
          // This was ended by a transition to another activity
          // Find when the next activity started to determine end time
          const nextActivityStart = allEventsSorted.find(e => 
            e.startedAt.getTime() > currentStart!.startedAt.getTime() &&
            (e.eventType === EventType.TASK_START || e.eventType.endsWith('_START'))
          );

          if (nextActivityStart) {
            const duration = nextActivityStart.startedAt.getTime() - currentStart.startedAt.getTime();
            const oneMinuteMs = 60 * 1000; // 1 minute in milliseconds
            
            // Skip auto-ended sessions shorter than 1 minute (these are test sessions)
            if (duration >= oneMinuteMs) {
              // Check if start event was edited
              const startMetadata = (currentStart.metadata as any) || {};
              const isAdjusted = !!startMetadata.editedAt;
              const editReason = startMetadata.editReason;
              
              // Get the base description with original activity note
              let sessionDescription = getSessionDescription(currentStart.eventType, EventType.TASK_STOP, currentStart.description || undefined);
              
              // If session was adjusted, append the edit reason
              if (isAdjusted && editReason) {
                sessionDescription += ` (Adjusted: ${editReason})`;
              }
              
              const session: TimesheetSession = {
                id: `${currentStart.id}-auto-ended`,
                startTime: currentStart.startedAt.toISOString(),
                endTime: nextActivityStart.startedAt.toISOString(),
                duration,
                formattedDuration: formatDurationDetailed(duration),
                isOngoing: false,
                isAdjusted,
                eventType: EventType.TASK_STOP, // Auto-ended, treat as stopped
                description: sessionDescription,
              };
              taskSessions[sessionKey].push(session);
            }
          }
        }
      }
    }



    // Build entries from sessions
    const entries: TimesheetEntry[] = [];
    
    for (const [sessionKey, sessions] of Object.entries(taskSessions)) {
      if (sessions.length === 0) continue;

      const isTask = sessionKey.startsWith('task-');
      const taskId = isTask ? sessionKey.replace('task-', '') : undefined;
      const task = taskId ? sessions[0] ? userEvents.find(e => e.taskId === taskId)?.task : undefined : undefined;
      
      const totalDuration = sessions.reduce((sum, s) => sum + s.duration, 0);
      const activityType = isTask ? 'work' : sessionKey.replace('activity-', '');
      
      // Determine status - match TaskSessionsView logic
      let status: 'completed' | 'paused' | 'ongoing' = 'completed';
      const hasOngoing = sessions.some(s => s.isOngoing);
      
      if (hasOngoing) {
        status = 'ongoing';
      } else if (isTask) {
        // For tasks, check the last session's end type
        const lastSession = sessions[sessions.length - 1];
        if (lastSession?.eventType === EventType.TASK_PAUSE) {
          status = 'paused';
        } else {
          // If stopped or completed, show as completed
          status = 'completed';
        }
      }

      const entry: TimesheetEntry = {
        id: sessionKey,
        date: sessions[0]?.startTime ? format(new Date(sessions[0].startTime), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
        task: task ? {
          id: task.id,
          title: task.title,
          issueKey: task.issueKey || undefined,
          priority: task.priority,
          taskBoard: task.taskBoard || undefined
        } : undefined,
        sessions,
        totalDuration,
        formattedDuration: formatDurationDetailed(totalDuration),
        activityType,
        status
      };

      entries.push(entry);
    }

    // Calculate summary
    const workEntries = entries.filter(e => e.activityType === 'work');
    const breakEntries = entries.filter(e => e.activityType === 'break');
    const meetingEntries = entries.filter(e => e.activityType === 'meeting');
    const researchEntries = entries.filter(e => e.activityType === 'research');
    const reviewEntries = entries.filter(e => e.activityType === 'review');
    
    const totalWorkTime = workEntries.reduce((sum, e) => sum + e.totalDuration, 0);
    const totalBreakTime = breakEntries.reduce((sum, e) => sum + e.totalDuration, 0);
    const totalMeetingTime = meetingEntries.reduce((sum, e) => sum + e.totalDuration, 0);
    const totalResearchTime = researchEntries.reduce((sum, e) => sum + e.totalDuration, 0);
    const totalReviewTime = reviewEntries.reduce((sum, e) => sum + e.totalDuration, 0);
    
    const totalTasks = workEntries.length;
    const totalActiveTasks = workEntries.filter(e => e.status === 'ongoing').length;
    const totalPausedTasks = workEntries.filter(e => e.status === 'paused').length;
    
    // Include meetings, research, and review as productive work time
    const totalProductiveTime = totalWorkTime + totalMeetingTime + totalResearchTime + totalReviewTime;
    const totalTime = totalProductiveTime + totalBreakTime;
    const productivityScore = totalTime > 0 ? Math.round((totalProductiveTime / totalTime) * 100) : 0;

    const summary: TimesheetSummary = {
      totalWorkTime: totalProductiveTime, // Include all productive activities
      totalBreakTime,
      totalMeetingTime,
      totalResearchTime,
      totalReviewTime,
      totalTasks,
      totalActiveTasks,
      totalPausedTasks,
      formattedTotalWorkTime: formatDurationDetailed(totalProductiveTime),
      formattedTotalBreakTime: formatDurationDetailed(totalBreakTime),
      formattedTotalMeetingTime: formatDurationDetailed(totalMeetingTime),
      formattedTotalResearchTime: formatDurationDetailed(totalResearchTime),
      formattedTotalReviewTime: formatDurationDetailed(totalReviewTime),
      productivityScore
    };

    const timesheetData: TimesheetData = {
      entries: entries.sort((a, b) => {
        // Sort by most recent session start time (latest activity first)
        const aLatestSession = a.sessions.length > 0 ? Math.max(...a.sessions.map(s => new Date(s.startTime).getTime())) : 0;
        const bLatestSession = b.sessions.length > 0 ? Math.max(...b.sessions.map(s => new Date(s.startTime).getTime())) : 0;
        return bLatestSession - aLatestSession;
      }),
      summary,
      dateRange: {
        start: startDate.toISOString(),
        end: endDate.toISOString()
      }
    };

    return NextResponse.json(timesheetData);

  } catch (error) {
    console.error("Error fetching timesheet data:", error);
    return NextResponse.json(
      { error: "Failed to fetch timesheet data" },
      { status: 500 }
    );
  }
} 