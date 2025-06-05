import { prisma } from "@/lib/prisma";
import { EventType, UserStatusType } from "@prisma/client";

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
      // 1. End any ongoing user events
      await this.endOngoingUserEvents(userId, tx);

      // 2. Create new user event
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

      // 3. Update or create user status
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

      // 4. If this is a task activity, also create a TaskActivity entry for backwards compatibility
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
      }

      return userEvent;
    });
  }

  /**
   * End current activity and set user to available
   */
  static async endCurrentActivity(userId: string, description?: string) {
    return await prisma.$transaction(async (tx) => {
      // End ongoing user events
      await this.endOngoingUserEvents(userId, tx);

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
    return await prisma.userStatus.findUnique({
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
   * Get total time spent on tasks
   */
  static async getTaskTimeSpent(taskId: string): Promise<ActivitySummary> {
    const events = await prisma.userEvent.findMany({
      where: {
        taskId,
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
        totalMs += event.startedAt.getTime() - currentStart.getTime();
        currentStart = null;
      }
    }

    // If there's an ongoing session, add time until now
    if (currentStart) {
      totalMs += Date.now() - currentStart.getTime();
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
      [EventType.TASK_PAUSE]: { status: UserStatusType.AVAILABLE, isAvailable: true },
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
    return [
      EventType.TASK_START,
      EventType.TASK_PAUSE,
      EventType.TASK_STOP,
      EventType.TASK_COMPLETE,
    ].includes(eventType);
  }

  private static mapEventTypeToTaskAction(eventType: EventType): string {
    const mapping: Record<EventType, string> = {
      [EventType.TASK_START]: "TASK_PLAY_STARTED",
      [EventType.TASK_PAUSE]: "TASK_PLAY_PAUSED",
      [EventType.TASK_STOP]: "TASK_PLAY_STOPPED",
      [EventType.TASK_COMPLETE]: "TASK_COMPLETED",
    };
    return mapping[eventType] || eventType.toString();
  }

  private static formatDuration(ms: number): ActivitySummary {
    if (ms < 0) ms = 0;
    
    const totalSeconds = Math.floor(ms / 1000);
    const days = Math.floor(totalSeconds / (3600 * 24));
    const hours = Math.floor((totalSeconds % (3600 * 24)) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    let formattedTime: string;
    if (days > 0) {
      formattedTime = `${days}d ${hours}h ${minutes}m ${seconds}s`;
    } else {
      formattedTime = `${hours}h ${minutes}m ${seconds}s`;
    }

    return {
      totalTimeMs: ms,
      formattedTime,
      days,
      hours,
      minutes,
      seconds,
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
    return [
      EventType.TASK_START,
      EventType.LUNCH_START,
      EventType.BREAK_START,
      EventType.MEETING_START,
      EventType.TRAVEL_START,
      EventType.REVIEW_START,
      EventType.RESEARCH_START,
    ].includes(eventType);
  }

  private static isEndEvent(eventType: EventType, currentType: string): boolean {
    if (currentType.startsWith("task:") && [EventType.TASK_PAUSE, EventType.TASK_STOP, EventType.TASK_COMPLETE].includes(eventType)) {
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
} 