/**
 * AI Agent Scheduler
 *
 * Background task scheduler for AI agents. Enables scheduled tasks like
 * daily standups, sprint health checks, and periodic analyses.
 */

import { getAIOrchestrator } from '../core/orchestrator';
import { getAgentRegistry, type AIAgentDefinition } from './agent-registry';
import type { AIModelId } from '../core/types';

// ============================================================================
// Types
// ============================================================================

export type ScheduleFrequency =
  | 'hourly'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'cron';

export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

export interface ScheduledTask {
  id: string;
  name: string;
  description: string;
  agentId: string;
  taskType: string;
  schedule: {
    frequency: ScheduleFrequency;
    cronExpression?: string; // For cron frequency
    time?: string; // HH:MM format for daily/weekly
    dayOfWeek?: number; // 0-6 for weekly (0 = Sunday)
    dayOfMonth?: number; // 1-31 for monthly
    timezone?: string;
  };
  input: Record<string, unknown>;
  workspaceId: string;
  projectId?: string;
  enabled: boolean;
  priority: TaskPriority;
  retryConfig?: {
    maxRetries: number;
    retryDelayMs: number;
  };
  notifyOnComplete?: boolean;
  notifyOnError?: boolean;
  lastRunAt?: Date;
  nextRunAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskExecution {
  id: string;
  taskId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt?: Date;
  completedAt?: Date;
  result?: unknown;
  error?: string;
  retryCount: number;
  metadata?: Record<string, unknown>;
}

export interface SchedulerConfig {
  pollIntervalMs: number;
  maxConcurrentTasks: number;
  defaultRetryConfig: {
    maxRetries: number;
    retryDelayMs: number;
  };
  taskTimeoutMs: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  pollIntervalMs: 60000, // Check every minute
  maxConcurrentTasks: 5,
  defaultRetryConfig: {
    maxRetries: 3,
    retryDelayMs: 5000,
  },
  taskTimeoutMs: 300000, // 5 minutes
};

// ============================================================================
// Task Types
// ============================================================================

export const TASK_TYPES = {
  DAILY_STANDUP: 'daily_standup',
  SPRINT_HEALTH_CHECK: 'sprint_health_check',
  BACKLOG_GROOMING: 'backlog_grooming',
  STALE_ISSUE_CHECK: 'stale_issue_check',
  WEEKLY_SUMMARY: 'weekly_summary',
  RELEASE_NOTES: 'release_notes',
  DEPENDENCY_ANALYSIS: 'dependency_analysis',
  WORKLOAD_BALANCE: 'workload_balance',
  CUSTOM: 'custom',
} as const;

export type TaskType = (typeof TASK_TYPES)[keyof typeof TASK_TYPES];

// ============================================================================
// Task Handlers
// ============================================================================

type TaskHandler = (
  task: ScheduledTask,
  context: TaskExecutionContext
) => Promise<TaskHandlerResult>;

interface TaskExecutionContext {
  orchestrator: ReturnType<typeof getAIOrchestrator>;
  agent: AIAgentDefinition;
  abortSignal?: AbortSignal;
}

interface TaskHandlerResult {
  success: boolean;
  data?: unknown;
  summary?: string;
  notifications?: Array<{
    type: 'slack' | 'email' | 'in_app';
    recipient: string;
    message: string;
  }>;
}

const taskHandlers: Map<TaskType, TaskHandler> = new Map();

// Register default handlers
taskHandlers.set(TASK_TYPES.DAILY_STANDUP, async (task, context) => {
  const { workspaceId, projectId, input } = task;

  const prompt = `Generate a daily standup summary for the project team.

Context:
- Workspace ID: ${workspaceId}
${projectId ? `- Project ID: ${projectId}` : ''}
${input.customInstructions ? `- Instructions: ${input.customInstructions}` : ''}

Please analyze recent activity and provide:
1. What was completed yesterday
2. What's planned for today
3. Any blockers or concerns
4. Key metrics (velocity, open bugs, etc.)

Format the response as a clear, actionable standup report.`;

  const response = await context.orchestrator.complete({
    messages: [{ role: 'user', content: prompt }],
    systemPrompt: context.agent.systemPrompt,
    model: (input.model as AIModelId) || 'gpt-4o',
    maxTokens: 2000,
  });

  return {
    success: true,
    data: { report: response.content },
    summary: 'Daily standup summary generated',
    notifications: input.notifyChannel
      ? [
          {
            type: 'slack' as const,
            recipient: input.notifyChannel as string,
            message: response.content,
          },
        ]
      : undefined,
  };
});

taskHandlers.set(TASK_TYPES.SPRINT_HEALTH_CHECK, async (task, context) => {
  const { workspaceId, projectId, input } = task;

  const prompt = `Analyze the current sprint health for the project.

Context:
- Workspace ID: ${workspaceId}
${projectId ? `- Project ID: ${projectId}` : ''}
${input.sprintId ? `- Sprint ID: ${input.sprintId}` : ''}

Please evaluate:
1. Sprint progress (% complete vs time elapsed)
2. Velocity trends
3. Risk factors (scope creep, blockers, dependencies)
4. Team workload distribution
5. Burndown/burnup analysis

Provide actionable recommendations if the sprint is at risk.`;

  const response = await context.orchestrator.complete({
    messages: [{ role: 'user', content: prompt }],
    systemPrompt: context.agent.systemPrompt,
    model: (input.model as AIModelId) || 'gpt-4o',
    maxTokens: 2000,
  });

  return {
    success: true,
    data: { healthReport: response.content },
    summary: 'Sprint health check completed',
  };
});

taskHandlers.set(TASK_TYPES.STALE_ISSUE_CHECK, async (task, context) => {
  const { workspaceId, projectId, input } = task;
  const staleDays = (input.staleDays as number) || 14;

  const prompt = `Identify and analyze stale issues in the project.

Context:
- Workspace ID: ${workspaceId}
${projectId ? `- Project ID: ${projectId}` : ''}
- Issues inactive for more than ${staleDays} days are considered stale

Please:
1. List stale issues with their age and last activity
2. Categorize them (blocked, abandoned, low priority, needs clarification)
3. Suggest actions for each category
4. Identify any patterns in issue staleness`;

  const response = await context.orchestrator.complete({
    messages: [{ role: 'user', content: prompt }],
    systemPrompt: context.agent.systemPrompt,
    model: (input.model as AIModelId) || 'claude-haiku-3.5',
    maxTokens: 1500,
  });

  return {
    success: true,
    data: { staleReport: response.content },
    summary: `Stale issue check completed (>${staleDays} days)`,
  };
});

taskHandlers.set(TASK_TYPES.WEEKLY_SUMMARY, async (task, context) => {
  const { workspaceId, projectId, input } = task;

  const prompt = `Generate a comprehensive weekly summary for the project.

Context:
- Workspace ID: ${workspaceId}
${projectId ? `- Project ID: ${projectId}` : ''}

Please include:
1. Key accomplishments this week
2. Issues closed vs opened
3. Sprint progress update
4. Team contributions
5. Highlights and notable items
6. Looking ahead to next week

Format as a professional weekly report suitable for stakeholders.`;

  const response = await context.orchestrator.complete({
    messages: [{ role: 'user', content: prompt }],
    systemPrompt: context.agent.systemPrompt,
    model: (input.model as AIModelId) || 'gpt-4o',
    maxTokens: 2500,
  });

  return {
    success: true,
    data: { weeklySummary: response.content },
    summary: 'Weekly summary generated',
    notifications: input.notifyEmail
      ? [
          {
            type: 'email' as const,
            recipient: input.notifyEmail as string,
            message: response.content,
          },
        ]
      : undefined,
  };
});

taskHandlers.set(TASK_TYPES.BACKLOG_GROOMING, async (task, context) => {
  const { workspaceId, projectId, input } = task;

  const prompt = `Analyze and provide recommendations for backlog grooming.

Context:
- Workspace ID: ${workspaceId}
${projectId ? `- Project ID: ${projectId}` : ''}

Please:
1. Identify issues that need estimation
2. Find duplicate or similar issues
3. Suggest issues that could be closed (stale, invalid, duplicate)
4. Recommend priority adjustments
5. Identify issues ready for development
6. Highlight issues needing more details`;

  const response = await context.orchestrator.complete({
    messages: [{ role: 'user', content: prompt }],
    systemPrompt: context.agent.systemPrompt,
    model: (input.model as AIModelId) || 'gpt-4o',
    maxTokens: 2000,
  });

  return {
    success: true,
    data: { groomingReport: response.content },
    summary: 'Backlog grooming analysis completed',
  };
});

taskHandlers.set(TASK_TYPES.WORKLOAD_BALANCE, async (task, context) => {
  const { workspaceId, projectId, input } = task;

  const prompt = `Analyze team workload distribution and balance.

Context:
- Workspace ID: ${workspaceId}
${projectId ? `- Project ID: ${projectId}` : ''}

Please evaluate:
1. Current assignment distribution across team members
2. Story points or issue count per person
3. Identify overloaded team members
4. Identify team members with capacity
5. Suggest reassignments to balance workload
6. Consider expertise matching in recommendations`;

  const response = await context.orchestrator.complete({
    messages: [{ role: 'user', content: prompt }],
    systemPrompt: context.agent.systemPrompt,
    model: (input.model as AIModelId) || 'claude-haiku-3.5',
    maxTokens: 1500,
  });

  return {
    success: true,
    data: { workloadReport: response.content },
    summary: 'Workload balance analysis completed',
  };
});

taskHandlers.set(TASK_TYPES.CUSTOM, async (task, context) => {
  const { input } = task;

  if (!input.prompt) {
    throw new Error('Custom tasks require a prompt');
  }

  const response = await context.orchestrator.complete({
    messages: [{ role: 'user', content: input.prompt as string }],
    systemPrompt: context.agent.systemPrompt,
    model: (input.model as AIModelId) || 'claude-haiku-3.5',
    maxTokens: (input.maxTokens as number) || 1000,
  });

  return {
    success: true,
    data: { result: response.content },
    summary: 'Custom task completed',
  };
});

// ============================================================================
// Scheduler Class
// ============================================================================

export class AIAgentScheduler {
  private config: SchedulerConfig;
  private tasks: Map<string, ScheduledTask> = new Map();
  private executions: Map<string, TaskExecution> = new Map();
  private runningTasks: Set<string> = new Set();
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;

  constructor(config: Partial<SchedulerConfig> = {}) {
    this.config = { ...DEFAULT_SCHEDULER_CONFIG, ...config };
  }

  /**
   * Register a task handler for a task type
   */
  registerHandler(taskType: TaskType, handler: TaskHandler): void {
    taskHandlers.set(taskType, handler);
  }

  /**
   * Schedule a new task
   */
  scheduleTask(task: Omit<ScheduledTask, 'createdAt' | 'updatedAt' | 'nextRunAt'>): ScheduledTask {
    const now = new Date();
    const fullTask: ScheduledTask = {
      ...task,
      createdAt: now,
      updatedAt: now,
      nextRunAt: this.calculateNextRun(task.schedule),
    };

    this.tasks.set(task.id, fullTask);
    return fullTask;
  }

  /**
   * Update an existing task
   */
  updateTask(taskId: string, updates: Partial<ScheduledTask>): ScheduledTask | null {
    const task = this.tasks.get(taskId);
    if (!task) return null;

    const updatedTask: ScheduledTask = {
      ...task,
      ...updates,
      updatedAt: new Date(),
    };

    if (updates.schedule) {
      updatedTask.nextRunAt = this.calculateNextRun(updates.schedule);
    }

    this.tasks.set(taskId, updatedTask);
    return updatedTask;
  }

  /**
   * Cancel a scheduled task
   */
  cancelTask(taskId: string): boolean {
    return this.tasks.delete(taskId);
  }

  /**
   * Get task by ID
   */
  getTask(taskId: string): ScheduledTask | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * List all tasks
   */
  listTasks(filter?: { workspaceId?: string; enabled?: boolean }): ScheduledTask[] {
    let tasks = Array.from(this.tasks.values());

    if (filter?.workspaceId) {
      tasks = tasks.filter((t) => t.workspaceId === filter.workspaceId);
    }

    if (filter?.enabled !== undefined) {
      tasks = tasks.filter((t) => t.enabled === filter.enabled);
    }

    return tasks;
  }

  /**
   * Execute a task immediately (bypassing schedule)
   */
  async executeNow(taskId: string): Promise<TaskExecution> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    return this.executeTask(task);
  }

  /**
   * Start the scheduler
   */
  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.pollInterval = setInterval(() => {
      this.checkAndExecuteDueTasks();
    }, this.config.pollIntervalMs);

    // Run immediately on start
    this.checkAndExecuteDueTasks();
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    this.isRunning = false;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  /**
   * Get scheduler status
   */
  getStatus(): {
    isRunning: boolean;
    totalTasks: number;
    enabledTasks: number;
    runningTasks: number;
  } {
    return {
      isRunning: this.isRunning,
      totalTasks: this.tasks.size,
      enabledTasks: Array.from(this.tasks.values()).filter((t) => t.enabled).length,
      runningTasks: this.runningTasks.size,
    };
  }

  /**
   * Get execution history for a task
   */
  getExecutionHistory(taskId: string): TaskExecution[] {
    return Array.from(this.executions.values())
      .filter((e) => e.taskId === taskId)
      .sort((a, b) => {
        const timeA = a.startedAt?.getTime() || 0;
        const timeB = b.startedAt?.getTime() || 0;
        return timeB - timeA;
      });
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async checkAndExecuteDueTasks(): Promise<void> {
    const now = new Date();
    const dueTasks = Array.from(this.tasks.values()).filter(
      (task) =>
        task.enabled &&
        task.nextRunAt &&
        task.nextRunAt <= now &&
        !this.runningTasks.has(task.id)
    );

    // Respect concurrency limit
    const availableSlots = this.config.maxConcurrentTasks - this.runningTasks.size;
    const tasksToRun = dueTasks
      .sort((a, b) => {
        // Priority order: critical > high > medium > low
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      })
      .slice(0, availableSlots);

    for (const task of tasksToRun) {
      this.executeTask(task).catch((error) => {
        console.error(`Failed to execute task ${task.id}:`, error);
      });
    }
  }

  private async executeTask(task: ScheduledTask): Promise<TaskExecution> {
    const executionId = `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const execution: TaskExecution = {
      id: executionId,
      taskId: task.id,
      status: 'pending',
      retryCount: 0,
    };

    this.executions.set(executionId, execution);
    this.runningTasks.add(task.id);

    try {
      execution.status = 'running';
      execution.startedAt = new Date();

      const handler = taskHandlers.get(task.taskType as TaskType);
      if (!handler) {
        throw new Error(`No handler registered for task type: ${task.taskType}`);
      }

      const registry = getAgentRegistry();
      const agent = registry.getAgent(task.agentId);
      if (!agent) {
        throw new Error(`Agent ${task.agentId} not found`);
      }

      const orchestrator = getAIOrchestrator();
      const context: TaskExecutionContext = {
        orchestrator,
        agent,
      };

      const result = await this.executeWithRetry(
        () => handler(task, context),
        task.retryConfig || this.config.defaultRetryConfig,
        execution
      );

      execution.status = 'completed';
      execution.result = result;
      execution.completedAt = new Date();

      // Update task last/next run
      task.lastRunAt = execution.startedAt;
      task.nextRunAt = this.calculateNextRun(task.schedule);
      task.updatedAt = new Date();
      this.tasks.set(task.id, task);

      return execution;
    } catch (error) {
      execution.status = 'failed';
      execution.error = error instanceof Error ? error.message : 'Unknown error';
      execution.completedAt = new Date();

      // Still update next run time even on failure
      task.lastRunAt = execution.startedAt;
      task.nextRunAt = this.calculateNextRun(task.schedule);
      task.updatedAt = new Date();
      this.tasks.set(task.id, task);

      return execution;
    } finally {
      this.runningTasks.delete(task.id);
      this.executions.set(executionId, execution);
    }
  }

  private async executeWithRetry<T>(
    fn: () => Promise<T>,
    retryConfig: { maxRetries: number; retryDelayMs: number },
    execution: TaskExecution
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
      try {
        execution.retryCount = attempt;
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');

        if (attempt < retryConfig.maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, retryConfig.retryDelayMs));
        }
      }
    }

    throw lastError;
  }

  private calculateNextRun(schedule: ScheduledTask['schedule']): Date {
    const now = new Date();
    const nextRun = new Date(now);

    switch (schedule.frequency) {
      case 'hourly':
        nextRun.setHours(nextRun.getHours() + 1);
        nextRun.setMinutes(0);
        nextRun.setSeconds(0);
        break;

      case 'daily':
        if (schedule.time) {
          const [hours, minutes] = schedule.time.split(':').map(Number);
          nextRun.setHours(hours, minutes, 0, 0);
          if (nextRun <= now) {
            nextRun.setDate(nextRun.getDate() + 1);
          }
        } else {
          nextRun.setDate(nextRun.getDate() + 1);
          nextRun.setHours(9, 0, 0, 0); // Default to 9 AM
        }
        break;

      case 'weekly':
        const targetDay = schedule.dayOfWeek ?? 1; // Default to Monday
        const daysUntilTarget = (targetDay - now.getDay() + 7) % 7 || 7;
        nextRun.setDate(nextRun.getDate() + daysUntilTarget);
        if (schedule.time) {
          const [hours, minutes] = schedule.time.split(':').map(Number);
          nextRun.setHours(hours, minutes, 0, 0);
        } else {
          nextRun.setHours(9, 0, 0, 0);
        }
        break;

      case 'monthly':
        const targetDate = schedule.dayOfMonth ?? 1;
        nextRun.setMonth(nextRun.getMonth() + 1);
        nextRun.setDate(Math.min(targetDate, this.getDaysInMonth(nextRun)));
        if (schedule.time) {
          const [hours, minutes] = schedule.time.split(':').map(Number);
          nextRun.setHours(hours, minutes, 0, 0);
        } else {
          nextRun.setHours(9, 0, 0, 0);
        }
        break;

      case 'cron':
        // For cron expressions, use a simple approximation
        // In production, use a proper cron parser library
        nextRun.setMinutes(nextRun.getMinutes() + 1);
        break;
    }

    return nextRun;
  }

  private getDaysInMonth(date: Date): number {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let schedulerInstance: AIAgentScheduler | null = null;

export function getScheduler(config?: Partial<SchedulerConfig>): AIAgentScheduler {
  if (!schedulerInstance) {
    schedulerInstance = new AIAgentScheduler(config);
  }
  return schedulerInstance;
}

export function resetScheduler(): void {
  if (schedulerInstance) {
    schedulerInstance.stop();
    schedulerInstance = null;
  }
}
