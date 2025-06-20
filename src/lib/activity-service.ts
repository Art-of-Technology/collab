import { prisma } from "@/lib/prisma";
import { EventType, UserStatusType } from "@prisma/client";
import { formatDurationDetailed, getDurationComponents } from "@/utils/duration";

interface StartActivityOptions {
  userId: string;
  eventType: EventType;
  taskId?: string;
  description?: string;
  metadata?: Record<string, any>;
  autoEndAt?: Date;
}

interface ActivitySummary {
  totalTimeMs: number;
  formattedTime: string;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export class ActivityService {
  /**
   * Start a new activity for the user
   * This will automatically end any ongoing activities
   */
  static async startActivity(options: StartActivityOptions) {
    const { userId, eventType, taskId, description, metadata, autoEndAt } = options;

    return await prisma.$transaction(async (tx) => {
      // 1. Check if user is currently working on a task and auto-stop it when switching activities
      const currentStatus = await tx.userStatus.findUnique({
        where: { userId },
        select: { currentTaskId: true, currentStatus: true }
      });

      // If user is currently working on a task, stop it when:
      // - Starting a different task (taskId !== currentTaskId)
      // - Starting any non-task activity (lunch, meeting, break, etc.)
      if (currentStatus?.currentTaskId && currentStatus.currentStatus === 'WORKING') {
        const shouldStopCurrentTask = 
          // Starting a different task
          (eventType === EventType.TASK_START && taskId !== currentStatus.currentTaskId) ||
          // Starting any non-task activity
          (eventType !== EventType.TASK_START && eventType !== EventType.TASK_PAUSE && eventType !== EventType.TASK_STOP);

        if (shouldStopCurrentTask) {
          const activityName = eventType === EventType.TASK_START ? 'another task' : eventType.toLowerCase().replace('_start', '');
          
          // Create TASK_STOP UserEvent first (this is what session processing looks for)
          await tx.userEvent.create({
            data: {
              userId,
              taskId: currentStatus.currentTaskId,
              eventType: EventType.TASK_STOP,
              description: `Automatically stopped when switching to ${activityName}`,
              metadata: { 
                autoStopped: true, 
                newActivity: eventType,
                newTaskId: taskId || null 
              },
              startedAt: new Date(),
            },
          });
          
          // Create TASK_STOP record for the current task (for activity log)
          await tx.taskActivity.create({
            data: {
              taskId: currentStatus.currentTaskId,
              userId,
              action: 'TASK_PLAY_STOPPED',
              details: JSON.stringify({
                eventType: 'TASK_STOP',
                description: `Automatically stopped when switching to ${activityName}`,
                metadata: { 
                  autoStopped: true, 
                  newActivity: eventType,
                  newTaskId: taskId || null 
                },
              }),
            },
          });

          // Update helper time tracking for the previous task
          await this.updateHelperTimeTracking(currentStatus.currentTaskId, userId, 'stop', tx);
        }
      }

      // 2. End any ongoing non-task activities by sending appropriate END events
      const ongoingEvents = await tx.userEvent.findMany({
        where: {
          userId,
          eventType: {
            in: [
              EventType.LUNCH_START,
              EventType.BREAK_START,
              EventType.MEETING_START,
              EventType.TRAVEL_START,
              EventType.REVIEW_START,
              EventType.RESEARCH_START,
            ]
          }
        },
        orderBy: { startedAt: 'desc' },
        take: 10, // Get recent events to find what needs to be ended
      });

      // Check if there are any ongoing non-task activities that need to be ended
      for (const ongoingEvent of ongoingEvents) {
        // Check if this activity has already been ended
        const hasEndEvent = await tx.userEvent.findFirst({
          where: {
            userId,
            eventType: this.getEndEventType(ongoingEvent.eventType),
            startedAt: {
              gt: ongoingEvent.startedAt,
            },
          },
        });

        // If no end event exists and this activity should be ended by the new activity
        if (!hasEndEvent && this.shouldEndActivity(ongoingEvent.eventType, eventType)) {
          const endEventType = this.getEndEventType(ongoingEvent.eventType);
          const activityName = this.getActivityDisplayName(ongoingEvent.eventType);
          const newActivityName = this.getActivityDisplayName(eventType);
          
          await tx.userEvent.create({
            data: {
              userId,
              eventType: endEventType,
              description: `Automatically ended ${activityName} when switching to ${newActivityName}`,
              metadata: { 
                autoEnded: true, 
                previousActivity: ongoingEvent.eventType,
                newActivity: eventType,
                newTaskId: taskId || null 
              },
              startedAt: new Date(),
            },
          });
        }
      }

      // 3. Create new user event
      const userEvent = await tx.userEvent.create({
        data: {
          userId,
          eventType,
          taskId,
          description,
          metadata,
          startedAt: new Date(),
        },
      });

      // 4. Update or create user status
      const statusData = this.mapEventTypeToStatus(eventType, taskId);
      
      await tx.userStatus.upsert({
        where: { userId },
        update: {
          currentStatus: statusData.status,
          currentTaskId: statusData.taskId,
          statusStartedAt: new Date(),
          statusText: description,
          isAvailable: statusData.isAvailable,
          autoEndAt,
        },
        create: {
          userId,
          currentStatus: statusData.status,
          currentTaskId: statusData.taskId,
          statusStartedAt: new Date(),
          statusText: description,
          isAvailable: statusData.isAvailable,
          autoEndAt,
        },
      });

      // 5. If this is a task activity, also create a TaskActivity entry for backwards compatibility
      if (taskId && this.isTaskRelatedEvent(eventType)) {
        await tx.taskActivity.create({
          data: {
            taskId,
            userId,
            action: this.mapEventTypeToTaskAction(eventType),
            details: JSON.stringify({
              eventType,
              description,
              metadata,
            }),
          },
        });

        // 6. Update helper time tracking if this is a helper working on the task
        if (eventType === EventType.TASK_START) {
          await this.updateHelperTimeTracking(taskId, userId, 'start', tx);
        } else if (eventType === EventType.TASK_STOP || eventType === EventType.TASK_PAUSE) {
          await this.updateHelperTimeTracking(taskId, userId, 'stop', tx);
        }
      }

      return userEvent;
    });
  }

  /**
   * End current activity and set user to available
   */
  static async endCurrentActivity(userId: string, description?: string) {
    return await prisma.$transaction(async (tx) => {
      // Check if user is currently working on a task
      const currentStatus = await tx.userStatus.findUnique({
        where: { userId },
        select: { currentTaskId: true, currentStatus: true }
      });

      // If user is currently working on a task, create a TASK_STOP record
      if (currentStatus?.currentTaskId && currentStatus.currentStatus === 'WORKING') {
        // Create TASK_STOP UserEvent first (this is what session processing looks for)
        await tx.userEvent.create({
          data: {
            userId,
            taskId: currentStatus.currentTaskId,
            eventType: EventType.TASK_STOP,
            description: description || 'Stopped work and set to available',
            metadata: { source: 'end-activity' },
            startedAt: new Date(),
          },
        });
        
        // Create TaskActivity record (for activity log)
        await tx.taskActivity.create({
          data: {
            taskId: currentStatus.currentTaskId,
            userId,
            action: 'TASK_PLAY_STOPPED',
            details: JSON.stringify({
              eventType: 'TASK_STOP',
              description: description || 'Stopped work and set to available',
              metadata: { source: 'end-activity' },
            }),
          },
        });

        // Update helper time tracking for the current task
        await this.updateHelperTimeTracking(currentStatus.currentTaskId, userId, 'stop', tx);
      }

      // End any ongoing non-task activities by sending appropriate END events
      const ongoingEvents = await tx.userEvent.findMany({
        where: {
          userId,
          eventType: {
            in: [
              EventType.LUNCH_START,
              EventType.BREAK_START,
              EventType.MEETING_START,
              EventType.TRAVEL_START,
              EventType.REVIEW_START,
              EventType.RESEARCH_START,
            ]
          }
        },
        orderBy: { startedAt: 'desc' },
        take: 10, // Get recent events to find what needs to be ended
      });

      // Check if there are any ongoing non-task activities that need to be ended
      for (const ongoingEvent of ongoingEvents) {
        // Check if this activity has already been ended
        const hasEndEvent = await tx.userEvent.findFirst({
          where: {
            userId,
            eventType: this.getEndEventType(ongoingEvent.eventType),
            startedAt: {
              gt: ongoingEvent.startedAt,
            },
          },
        });

        // If no end event exists, send the appropriate END event
        if (!hasEndEvent) {
          const endEventType = this.getEndEventType(ongoingEvent.eventType);
          const activityName = this.getActivityDisplayName(ongoingEvent.eventType);
          
          await tx.userEvent.create({
            data: {
              userId,
              eventType: endEventType,
              description: `Ended ${activityName} session`,
              metadata: { 
                source: 'end-activity',
                previousActivity: ongoingEvent.eventType
              },
              startedAt: new Date(),
            },
          });
        }
      }

      // Update user status to available
      await tx.userStatus.upsert({
        where: { userId },
        update: {
          currentStatus: UserStatusType.AVAILABLE,
          currentTaskId: null,
          statusStartedAt: new Date(),
          statusText: description || "Available",
          isAvailable: true,
          autoEndAt: null,
        },
        create: {
          userId,
          currentStatus: UserStatusType.AVAILABLE,
          statusStartedAt: new Date(),
          statusText: description || "Available",
          isAvailable: true,
        },
      });

      // Create an AVAILABLE event
      return await tx.userEvent.create({
        data: {
          userId,
          eventType: EventType.AVAILABLE,
          description: description || "Set to available",
          startedAt: new Date(),
        },
      });
    });
  }

  /**
   * Get user's current status
   */
  static async getCurrentStatus(userId: string) {
    const status = await prisma.userStatus.findUnique({
      where: { userId },
      include: {
        currentTask: {
          select: {
            id: true,
            title: true,
            issueKey: true,
            priority: true,
          },
        },
      },
    });

    if (!status) return null;

    // If user is working on a task, determine the current play state
    let currentTaskPlayState: "stopped" | "playing" | "paused" = "stopped";
    
    if (status.currentTaskId && status.currentStatus === 'WORKING') {
      // Get the latest task activity for this user and task
      const latestTaskActivity = await prisma.taskActivity.findFirst({
        where: {
          taskId: status.currentTaskId,
          userId,
          action: { in: ['TASK_PLAY_STARTED', 'TASK_PLAY_PAUSED', 'TASK_PLAY_STOPPED'] },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (latestTaskActivity) {
        switch (latestTaskActivity.action) {
          case 'TASK_PLAY_STARTED':
            currentTaskPlayState = "playing";
            break;
          case 'TASK_PLAY_PAUSED':
            currentTaskPlayState = "paused";
            break;
          case 'TASK_PLAY_STOPPED':
            currentTaskPlayState = "stopped";
            break;
        }
      }
    }

    return {
      ...status,
      currentTaskPlayState,
    };
  }

  /**
   * Get user's activity history
   */
  static async getActivityHistory(
    userId: string,
    options: {
      limit?: number;
      startDate?: Date;
      endDate?: Date;
      eventTypes?: EventType[];
    } = {}
  ) {
    const { limit = 50, startDate, endDate, eventTypes } = options;

    return await prisma.userEvent.findMany({
      where: {
        userId,
        ...(startDate && { startedAt: { gte: startDate } }),
        ...(endDate && { startedAt: { lte: endDate } }),
        ...(eventTypes && { eventType: { in: eventTypes } }),
      },
      include: {
        task: {
          select: {
            id: true,
            title: true,
            issueKey: true,
            priority: true,
          },
        },
      },
      orderBy: { startedAt: "desc" },
      take: limit,
    });
  }

  /**
   * Get total time spent on tasks by a specific user
   */
  static async getTaskTimeSpent(taskId: string, userId?: string): Promise<ActivitySummary> {
    const events = await prisma.userEvent.findMany({
      where: {
        taskId,
        ...(userId && { userId }), // Filter by user if provided
        eventType: { in: [EventType.TASK_START, EventType.TASK_PAUSE, EventType.TASK_STOP] },
      },
      orderBy: { startedAt: "asc" },
    });
    let totalMs = 0;
    let currentStart: Date | null = null;

    for (const event of events) {
      if (event.eventType === EventType.TASK_START) {
        currentStart = event.startedAt;
      } else if (
        (event.eventType === EventType.TASK_PAUSE || event.eventType === EventType.TASK_STOP) &&
        currentStart
      ) {
        const duration = event.startedAt.getTime() - currentStart.getTime();
        totalMs += duration;
        currentStart = null;
      }
    }
    return this.formatDuration(totalMs);
  }

  /**
   * Get user's daily time breakdown
   */
  static async getDailyTimeBreakdown(
    userId: string,
    date: Date = new Date()
  ): Promise<Record<string, ActivitySummary>> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const events = await prisma.userEvent.findMany({
      where: {
        userId,
        startedAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      include: {
        task: {
          select: {
            id: true,
            title: true,
            issueKey: true,
          },
        },
      },
      orderBy: { startedAt: "asc" },
    });

    const breakdown: Record<string, number> = {};
    let currentActivity: { type: string; start: Date } | null = null;

    for (const event of events) {
      const activityType = this.getActivityCategory(event.eventType);
      const activityKey = event.taskId 
        ? `task:${event.task?.issueKey || event.task?.title || event.taskId}`
        : activityType;

      // End previous activity if it exists
      if (currentActivity && this.isEndEvent(event.eventType, currentActivity.type)) {
        const duration = event.startedAt.getTime() - currentActivity.start.getTime();
        breakdown[currentActivity.type] = (breakdown[currentActivity.type] || 0) + duration;
        currentActivity = null;
      }

      // Start new activity if it's a start event
      if (this.isStartEvent(event.eventType)) {
        currentActivity = {
          type: activityKey,
          start: event.startedAt,
        };
      }
    }

    // Handle ongoing activity
    if (currentActivity) {
      const duration = Date.now() - currentActivity.start.getTime();
      breakdown[currentActivity.type] = (breakdown[currentActivity.type] || 0) + duration;
    }

    // Format results
    const formattedBreakdown: Record<string, ActivitySummary> = {};
    for (const [key, ms] of Object.entries(breakdown)) {
      formattedBreakdown[key] = this.formatDuration(ms);
    }

    return formattedBreakdown;
  }

  /**
   * Get team activity overview
   */
  static async getTeamActivity(workspaceId: string) {
    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId },
      include: {
        user: {
          include: {
            userStatus: {
              include: {
                currentTask: {
                  select: {
                    id: true,
                    title: true,
                    issueKey: true,
                    priority: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    return members.map(member => ({
      user: {
        id: member.user.id,
        name: member.user.name,
        image: member.user.image,
        useCustomAvatar: member.user.useCustomAvatar,
      },
      status: member.user.userStatus,
    }));
  }

  // Helper methods
  private static async endOngoingUserEvents(userId: string, tx: any) {
    const ongoingEvents = await tx.userEvent.findMany({
      where: {
        userId,
        endedAt: null,
      },
    });

    const now = new Date();
    
    for (const event of ongoingEvents) {
      const duration = now.getTime() - event.startedAt.getTime();
      await tx.userEvent.update({
        where: { id: event.id },
        data: {
          endedAt: now,
          duration,
        },
      });
    }
  }

  private static mapEventTypeToStatus(eventType: EventType, taskId?: string) {
    const mapping: Record<EventType, { status: UserStatusType; isAvailable: boolean }> = {
      [EventType.TASK_START]: { status: UserStatusType.WORKING, isAvailable: false },
      [EventType.TASK_PAUSE]: { status: UserStatusType.WORKING, isAvailable: false },
      [EventType.TASK_STOP]: { status: UserStatusType.AVAILABLE, isAvailable: true },
      [EventType.TASK_COMPLETE]: { status: UserStatusType.AVAILABLE, isAvailable: true },
      [EventType.LUNCH_START]: { status: UserStatusType.LUNCH, isAvailable: false },
      [EventType.LUNCH_END]: { status: UserStatusType.AVAILABLE, isAvailable: true },
      [EventType.BREAK_START]: { status: UserStatusType.BREAK, isAvailable: false },
      [EventType.BREAK_END]: { status: UserStatusType.AVAILABLE, isAvailable: true },
      [EventType.MEETING_START]: { status: UserStatusType.MEETING, isAvailable: false },
      [EventType.MEETING_END]: { status: UserStatusType.AVAILABLE, isAvailable: true },
      [EventType.TRAVEL_START]: { status: UserStatusType.TRAVEL, isAvailable: false },
      [EventType.TRAVEL_END]: { status: UserStatusType.AVAILABLE, isAvailable: true },
      [EventType.REVIEW_START]: { status: UserStatusType.REVIEW, isAvailable: false },
      [EventType.REVIEW_END]: { status: UserStatusType.AVAILABLE, isAvailable: true },
      [EventType.RESEARCH_START]: { status: UserStatusType.RESEARCH, isAvailable: false },
      [EventType.RESEARCH_END]: { status: UserStatusType.AVAILABLE, isAvailable: true },
      [EventType.OFFLINE]: { status: UserStatusType.OFFLINE, isAvailable: false },
      [EventType.AVAILABLE]: { status: UserStatusType.AVAILABLE, isAvailable: true },
    };

    const result = mapping[eventType];
    return {
      ...result,
      taskId: result.status === UserStatusType.WORKING ? taskId : null,
    };
  }

  private static isTaskRelatedEvent(eventType: EventType): boolean {
    const taskEvents: EventType[] = [
      EventType.TASK_START,
      EventType.TASK_PAUSE,
      EventType.TASK_STOP,
      EventType.TASK_COMPLETE,
    ];
    return taskEvents.includes(eventType);
  }

  private static mapEventTypeToTaskAction(eventType: EventType): string {
    const mapping: Partial<Record<EventType, string>> = {
      [EventType.TASK_START]: "TASK_PLAY_STARTED",
      [EventType.TASK_PAUSE]: "TASK_PLAY_PAUSED",
      [EventType.TASK_STOP]: "TASK_PLAY_STOPPED",
      [EventType.TASK_COMPLETE]: "TASK_COMPLETED",
    };
    return mapping[eventType] || eventType.toString();
  }

  private static formatDuration(ms: number): ActivitySummary {
    const components = getDurationComponents(ms);
    const formattedTime = formatDurationDetailed(ms);

    return {
      totalTimeMs: ms,
      formattedTime,
      days: components.hours >= 24 ? Math.floor(components.hours / 24) : 0,
      hours: components.hours % 24,
      minutes: components.minutes,
      seconds: components.seconds,
    };
  }

  private static getActivityCategory(eventType: EventType): string {
    if (eventType.toString().startsWith("TASK_")) return "work";
    if (eventType.toString().startsWith("LUNCH_")) return "lunch";
    if (eventType.toString().startsWith("BREAK_")) return "break";
    if (eventType.toString().startsWith("MEETING_")) return "meeting";
    if (eventType.toString().startsWith("TRAVEL_")) return "travel";
    if (eventType.toString().startsWith("REVIEW_")) return "review";
    if (eventType.toString().startsWith("RESEARCH_")) return "research";
    return "other";
  }

  private static isStartEvent(eventType: EventType): boolean {
    const startEvents: EventType[] = [
      EventType.TASK_START,
      EventType.LUNCH_START,
      EventType.BREAK_START,
      EventType.MEETING_START,
      EventType.TRAVEL_START,
      EventType.REVIEW_START,
      EventType.RESEARCH_START,
    ];
    return startEvents.includes(eventType);
  }

  private static isEndEvent(eventType: EventType, currentType: string): boolean {
    const taskEndEvents: EventType[] = [EventType.TASK_PAUSE, EventType.TASK_STOP, EventType.TASK_COMPLETE];
    if (currentType.startsWith("task:") && taskEndEvents.includes(eventType)) {
      return true;
    }
    
    const endEvents = {
      lunch: EventType.LUNCH_END,
      break: EventType.BREAK_END,
      meeting: EventType.MEETING_END,
      travel: EventType.TRAVEL_END,
      review: EventType.REVIEW_END,
      research: EventType.RESEARCH_END,
    };

    return Object.entries(endEvents).some(([category, endEvent]) => 
      currentType === category && eventType === endEvent
    );
  }

  /**
   * Update helper time tracking for TaskAssignee records
   */
  private static async updateHelperTimeTracking(
    taskId: string,
    userId: string,
    action: 'start' | 'stop',
    tx: any
  ) {
    // Check if this user is a helper (not the main assignee)
    const task = await tx.task.findUnique({
      where: { id: taskId },
      select: { assigneeId: true }
    });

    // If this is the main assignee, don't track in TaskAssignee table
    if (task?.assigneeId === userId) {
      return;
    }

    // Find or create TaskAssignee record for this helper
    const taskAssignee = await tx.taskAssignee.findUnique({
      where: {
        taskId_userId: {
          taskId,
          userId
        }
      }
    });

    if (!taskAssignee) {
      return; // No helper record exists
    }

    if (action === 'start') {
      // Update lastWorkedAt when starting work
      await tx.taskAssignee.update({
        where: { id: taskAssignee.id },
        data: {
          lastWorkedAt: new Date()
        }
      });
    } else if (action === 'stop' && taskAssignee.lastWorkedAt) {
      // Calculate time worked and add to total
      const workDuration = Date.now() - taskAssignee.lastWorkedAt.getTime();
      await tx.taskAssignee.update({
        where: { id: taskAssignee.id },
        data: {
          totalTimeWorked: taskAssignee.totalTimeWorked + workDuration,
          lastWorkedAt: new Date() // Keep track of last work time
        }
      });
    }
  }

  private static getEndEventType(eventType: EventType): EventType {
    const endEvents: Partial<Record<EventType, EventType>> = {
      [EventType.LUNCH_START]: EventType.LUNCH_END,
      [EventType.BREAK_START]: EventType.BREAK_END,
      [EventType.MEETING_START]: EventType.MEETING_END,
      [EventType.TRAVEL_START]: EventType.TRAVEL_END,
      [EventType.REVIEW_START]: EventType.REVIEW_END,
      [EventType.RESEARCH_START]: EventType.RESEARCH_END,
    };
    return endEvents[eventType] || EventType.AVAILABLE;
  }

  private static shouldEndActivity(ongoingType: EventType, newType: EventType): boolean {
    // All activities should be ended when starting any other activity
    // This ensures only one activity is running at a time
    return ongoingType !== newType;
  }

  private static getActivityDisplayName(eventType: EventType): string {
    const mapping: Partial<Record<EventType, string>> = {
      [EventType.TASK_START]: "task",
      [EventType.TASK_PAUSE]: "task",
      [EventType.TASK_STOP]: "task",
      [EventType.TASK_COMPLETE]: "task",
      [EventType.LUNCH_START]: "lunch",
      [EventType.LUNCH_END]: "lunch",
      [EventType.BREAK_START]: "break",
      [EventType.BREAK_END]: "break",
      [EventType.MEETING_START]: "meeting",
      [EventType.MEETING_END]: "meeting",
      [EventType.TRAVEL_START]: "travel",
      [EventType.TRAVEL_END]: "travel",
      [EventType.REVIEW_START]: "review",
      [EventType.REVIEW_END]: "review",
      [EventType.RESEARCH_START]: "research",
      [EventType.RESEARCH_END]: "research",
      [EventType.OFFLINE]: "offline",
      [EventType.AVAILABLE]: "available",
    };
    return mapping[eventType] || eventType.toString();
  }
} 