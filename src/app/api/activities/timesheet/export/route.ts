import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { EventType } from "@prisma/client";
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfDay, endOfDay, format } from "date-fns";
import { formatDurationDetailed } from "@/utils/duration";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId');
    const view = searchParams.get('view') || 'daily';
    const date = searchParams.get('date') || new Date().toISOString();
    const boardId = searchParams.get('boardId');
    const exportFormat = searchParams.get('format') || 'csv';
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
        startDate = startOfWeek(targetDate, { weekStartsOn: 1 });
        endDate = endOfWeek(targetDate, { weekStartsOn: 1 });
        break;
      case 'monthly':
        startDate = startOfMonth(targetDate);
        endDate = endOfMonth(targetDate);
        break;
      default:
        startDate = startOfDay(targetDate);
        endDate = endOfDay(targetDate);
        break;
    }

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

    if (exportFormat === 'csv') {
      return generateCSVExport(userEvents, view, startDate);
    } else if (exportFormat === 'pdf') {
      return generatePDFExport(userEvents, view, startDate, endDate, workspace.name);
    }

    return NextResponse.json({ error: "Invalid export format" }, { status: 400 });

  } catch (error) {
    console.error("Error exporting timesheet:", error);
    return NextResponse.json(
      { error: "Failed to export timesheet" },
      { status: 500 }
    );
  }
}

function generateCSVExport(userEvents: any[], view: string, startDate: Date) {
  const headers = [
    'Date',
    'Start Time',
    'End Time',
    'Duration (Hours)',
    'Activity Type',
    'Task Title',
    'Issue Key',
    'Priority',
    'Board',
    'Status',
    'Description',
    'Is Adjusted'
  ];

  const rows = [];
  const currentSessions: Record<string, { start: Date; eventType: EventType; task?: any; startEvent: any }> = {};

  for (const event of userEvents) {
    const activityType = getActivityType(event.eventType);
    const sessionKey = event.taskId ? `task-${event.taskId}` : `activity-${activityType}`;

    // Handle session start events
    if (event.eventType === EventType.TASK_START || event.eventType.endsWith('_START')) {
      currentSessions[sessionKey] = {
        start: event.startedAt,
        eventType: event.eventType,
        task: event.task,
        startEvent: event
      };
    }
    // Handle session end events
    else if (event.eventType === EventType.TASK_STOP || 
             event.eventType === EventType.TASK_PAUSE ||
             event.eventType.endsWith('_END')) {
      const currentSession = currentSessions[sessionKey];
      if (currentSession) {
        const duration = event.startedAt.getTime() - currentSession.start.getTime();
        const oneMinuteMs = 60 * 1000; // 1 minute in milliseconds
        
        // Skip sessions shorter than 1 minute (these are test sessions)
        if (duration >= oneMinuteMs) {
          const durationHours = (duration / (1000 * 60 * 60)).toFixed(2);
          
          rows.push([
            format(currentSession.start, 'yyyy-MM-dd'),
            format(currentSession.start, 'HH:mm:ss'),
            format(event.startedAt, 'HH:mm:ss'),
            durationHours,
            activityType,
            currentSession.task?.title || '',
            currentSession.task?.issueKey || '',
            currentSession.task?.priority || '',
            currentSession.task?.taskBoard?.name || '',
            event.eventType === EventType.TASK_PAUSE ? 'Paused' : 'Completed',
            currentSession.startEvent?.description || '',
            !!(event.metadata as any)?.editedAt ? 'Yes' : 'No'
          ]);
        }
        
        delete currentSessions[sessionKey];
      }
    }
  }

  // Handle ongoing sessions
  for (const [, session] of Object.entries(currentSessions)) {
    const duration = Date.now() - session.start.getTime();
    const durationHours = (duration / (1000 * 60 * 60)).toFixed(2);
    
    rows.push([
      format(session.start, 'yyyy-MM-dd'),
      format(session.start, 'HH:mm:ss'),
      'Ongoing',
      durationHours,
      getActivityType(session.eventType),
      session.task?.title || '',
      session.task?.issueKey || '',
      session.task?.priority || '',
      session.task?.taskBoard?.name || '',
      'Ongoing',
      '',
      'No'
    ]);
  }

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');

  return new NextResponse(csvContent, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="timesheet-${view}-${format(startDate, 'yyyy-MM-dd')}.csv"`
    }
  });
}

function generatePDFExport(userEvents: any[], view: string, startDate: Date, endDate: Date, workspaceName: string) {
  // Process events into sessions (like the main timesheet API does)
  const sessions = [];
  const currentSessions: Record<string, { start: Date; eventType: EventType; task?: any; startEvent: any }> = {};

  for (const event of userEvents) {
    const activityType = getActivityType(event.eventType);
    const sessionKey = event.taskId ? `task-${event.taskId}` : `activity-${activityType}`;

    // Handle session start events
    if (event.eventType === EventType.TASK_START || event.eventType.endsWith('_START')) {
      currentSessions[sessionKey] = {
        start: event.startedAt,
        eventType: event.eventType,
        task: event.task,
        startEvent: event
      };
    }
    // Handle session end events
    else if (event.eventType === EventType.TASK_STOP || 
             event.eventType === EventType.TASK_PAUSE ||
             event.eventType.endsWith('_END')) {
      const currentSession = currentSessions[sessionKey];
      if (currentSession) {
        const duration = event.startedAt.getTime() - currentSession.start.getTime();
        const oneMinuteMs = 60 * 1000; // 1 minute in milliseconds
        
        // Skip sessions shorter than 1 minute (these are test sessions)
        if (duration >= oneMinuteMs) {
          const durationFormatted = formatDurationDetailed(duration);
          
          sessions.push({
            date: format(currentSession.start, 'yyyy-MM-dd'),
            startTime: format(currentSession.start, 'HH:mm'),
            endTime: format(event.startedAt, 'HH:mm'),
            duration: durationFormatted,
            activityType,
            taskTitle: currentSession.task?.title || `${activityType} activity`,
            issueKey: currentSession.task?.issueKey || '',
            board: currentSession.task?.taskBoard?.name || '',
            status: event.eventType === EventType.TASK_PAUSE ? 'Paused' : 'Completed',
            isAdjusted: !!(event.metadata as any)?.editedAt,
            description: currentSession.startEvent?.description || ''
          });
        }
        
        delete currentSessions[sessionKey];
      }
    }
  }

  // Handle ongoing sessions
  for (const [, session] of Object.entries(currentSessions)) {
    const duration = Date.now() - session.start.getTime();
          const durationFormatted = formatDurationDetailed(duration);
    
    sessions.push({
      date: format(session.start, 'yyyy-MM-dd'),
      startTime: format(session.start, 'HH:mm'),
      endTime: 'Ongoing',
      duration: durationFormatted,
      activityType: getActivityType(session.eventType),
      taskTitle: session.task?.title || `${getActivityType(session.eventType)} activity`,
      issueKey: session.task?.issueKey || '',
      board: session.task?.taskBoard?.name || '',
      status: 'Ongoing',
      isAdjusted: false
    });
  }

  // Calculate totals
  const totalWorkTime = sessions
    .filter(s => s.activityType === 'work')
    .reduce((total, s) => total + parseDurationToMs(s.duration), 0);
  
  const totalBreakTime = sessions
    .filter(s => ['break', 'lunch'].includes(s.activityType))
    .reduce((total, s) => total + parseDurationToMs(s.duration), 0);

  const totalMeetingTime = sessions
    .filter(s => s.activityType === 'meeting')
    .reduce((total, s) => total + parseDurationToMs(s.duration), 0);

  const totalResearchTime = sessions
    .filter(s => s.activityType === 'research')
    .reduce((total, s) => total + parseDurationToMs(s.duration), 0);

  const totalReviewTime = sessions
    .filter(s => s.activityType === 'review')
    .reduce((total, s) => total + parseDurationToMs(s.duration), 0);

  // Generate HTML for PDF conversion
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Timesheet Report</title>
      <style>
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; 
          margin: 0; 
          padding: 20px; 
          color: #333;
          line-height: 1.4;
        }
        .header { 
          text-align: center; 
          margin-bottom: 30px; 
          border-bottom: 2px solid #e5e7eb;
          padding-bottom: 20px;
        }
        .header h1 { margin: 0; color: #1f2937; font-size: 28px; }
        .header h2 { margin: 5px 0; color: #6b7280; font-size: 18px; font-weight: normal; }
        .header p { margin: 10px 0 0 0; color: #9ca3af; font-size: 14px; }
        
        .summary { 
          display: grid; 
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); 
          gap: 15px; 
          margin-bottom: 30px; 
        }
        .summary-card { 
          background: #f9fafb; 
          border: 1px solid #e5e7eb; 
          border-radius: 8px; 
          padding: 15px; 
          text-align: center; 
        }
        .summary-card h3 { margin: 0 0 8px 0; font-size: 14px; color: #6b7280; text-transform: uppercase; }
        .summary-card p { margin: 0; font-size: 20px; font-weight: bold; color: #1f2937; }
        
        .sessions-section { margin-bottom: 30px; }
        .sessions-section h3 { 
          margin: 0 0 15px 0; 
          font-size: 18px; 
          color: #1f2937; 
          border-bottom: 1px solid #e5e7eb; 
          padding-bottom: 8px; 
        }
        
        table { 
          width: 100%; 
          border-collapse: collapse; 
          margin-bottom: 20px; 
          background: white;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        th { 
          background: #f3f4f6; 
          padding: 12px 8px; 
          text-align: left; 
          font-size: 12px; 
          font-weight: 600; 
          color: #374151;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        td { 
          padding: 10px 8px; 
          border-bottom: 1px solid #f3f4f6; 
          font-size: 13px;
        }
        tr:last-child td { border-bottom: none; }
        tr:hover { background: #fafafa; }
        
        .status-ongoing { color: #059669; font-weight: 600; }
        .status-paused { color: #d97706; font-weight: 600; }
        .status-completed { color: #2563eb; font-weight: 600; }
        .activity-work { color: #059669; }
        .activity-break { color: #2563eb; }
        .activity-lunch { color: #d97706; }
        .activity-meeting { color: #7c3aed; }
        .activity-travel { color: #4338ca; }
        .activity-review { color: #0d9488; }
        .activity-research { color: #0891b2; }
        
        .footer { 
          margin-top: 30px; 
          padding-top: 20px; 
          border-top: 1px solid #e5e7eb; 
          text-align: center; 
          color: #9ca3af; 
          font-size: 12px; 
        }
        
        @media print {
          body { margin: 0; }
          .page-break { page-break-before: always; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Timesheet Report</h1>
        <h2>${workspaceName}</h2>
        <p>${format(startDate, 'EEEE, MMMM d, yyyy')} ${view !== 'daily' ? `- ${format(endDate, 'EEEE, MMMM d, yyyy')}` : ''} (${view.charAt(0).toUpperCase() + view.slice(1)} View)</p>
      </div>
      
      <div class="summary">
        <div class="summary-card">
          <h3>Total Work Time</h3>
          <p class="activity-work">${formatDurationDetailed(totalWorkTime)}</p>
        </div>
        <div class="summary-card">
          <h3>Break Time</h3>
          <p class="activity-break">${formatDurationDetailed(totalBreakTime)}</p>
        </div>
        <div class="summary-card">
          <h3>Meeting Time</h3>
          <p class="activity-meeting">${formatDurationDetailed(totalMeetingTime)}</p>
        </div>
        <div class="summary-card">
          <h3>Research Time</h3>
          <p class="activity-research">${formatDurationDetailed(totalResearchTime)}</p>
        </div>
        <div class="summary-card">
          <h3>Review Time</h3>
          <p class="activity-review">${formatDurationDetailed(totalReviewTime)}</p>
        </div>
        <div class="summary-card">
          <h3>Total Sessions</h3>
          <p>${sessions.length}</p>
        </div>
      </div>

      <div class="sessions-section">
        <h3>Time Sessions</h3>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Start</th>
              <th>End</th>
              <th>Duration</th>
              <th>Activity</th>
              <th>Task / Description</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${sessions.map(session => `
              <tr>
                <td>${session.date}</td>
                <td>${session.startTime}</td>
                <td>${session.endTime}</td>
                <td>${session.duration}</td>
                <td><span class="activity-${session.activityType}">${session.activityType.charAt(0).toUpperCase() + session.activityType.slice(1)}</span></td>
                <td>
                  ${session.issueKey ? `<strong>${session.issueKey}</strong> ` : ''}${session.taskTitle}
                  ${session.description ? `<br><small style="color: #4b5563;">${session.description}</small>` : ''}
                  ${session.board ? `<br><small style="color: #6b7280;">${session.board}</small>` : ''}
                  ${session.isAdjusted ? `<br><small style="color: #f59e0b;">⚠ Adjusted</small>` : ''}
                </td>
                <td><span class="status-${session.status.toLowerCase()}">${session.status}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div class="footer">
        <p>Generated on ${format(new Date(), 'EEEE, MMMM d, yyyy \'at\' h:mm a')}</p>
        <p>This report contains ${sessions.length} time tracking session${sessions.length !== 1 ? 's' : ''}</p>
      </div>
    </body>
    </html>
  `;

  // Return HTML with proper PDF content type for browser to handle
  return new NextResponse(htmlContent, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': `inline; filename="timesheet-${view}-${format(startDate, 'yyyy-MM-dd')}.html"`
    }
  });
}



function parseDurationToMs(duration: string): number {
  const regex = /(?:(\d+)h\s*)?(?:(\d+)m\s*)?(?:(\d+)s\s*)?/;
  const match = duration.match(regex);
  if (!match) return 0;

  const [, hours = "0", minutes = "0", seconds = "0"] = match;
  return (
    parseInt(hours) * 60 * 60 * 1000 +
    parseInt(minutes) * 60 * 1000 +
    parseInt(seconds) * 1000
  );
}

function getActivityType(eventType: EventType): string {
  const typeMap: Record<EventType, string> = {
    [EventType.TASK_START]: 'work',
    [EventType.TASK_PAUSE]: 'work',
    [EventType.TASK_STOP]: 'work',
    [EventType.TASK_COMPLETE]: 'work',
    [EventType.LUNCH_START]: 'lunch',
    [EventType.LUNCH_END]: 'lunch',
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