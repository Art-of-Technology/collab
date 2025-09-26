import { WebhookEvent, WebhookEventType } from './webhooks';
import { processWebhookEvent } from './webhook-delivery';

export interface EventData {
  [key: string]: any;
}

export interface EventContext {
  userId?: string;
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  source?: string; // e.g., 'api', 'ui', 'background-job'
}

export interface EmitEventOptions {
  async?: boolean;
  retryOptions?: {
    maxAttempts?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    timeoutMs?: number;
  };
}

/**
 * Event Bus for emitting events that trigger webhooks
 */
export class EventBus {
  private static instance: EventBus;
  private listeners: Map<string, Array<(event: WebhookEvent) => Promise<void>>> = new Map();

  private constructor() {}

  static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  /**
   * Emit an event that will be delivered to all matching webhooks
   */
  async emit(
    eventType: WebhookEventType,
    data: EventData,
    context: EventContext,
    options: EmitEventOptions = {}
  ): Promise<void> {
    const event: WebhookEvent = {
      id: this.generateEventId(),
      type: eventType,
      timestamp: Date.now(),
      data,
      workspace: {
        id: context.workspaceId,
        slug: context.workspaceSlug,
        name: context.workspaceName
      },
      app: {
        id: 'system',
        slug: 'system',
        name: 'Collab System'
      }
    };

    console.log(`📡 EventBus: Emitting event ${eventType}`, {
      eventId: event.id,
      workspaceId: context.workspaceId,
      dataKeys: Object.keys(data),
      async: options.async
    });

    try {
      // Call internal listeners first
      await this.notifyListeners(eventType, event);

      // Process webhooks
      if (options.async) {
        // Don't await - fire and forget
        this.processWebhookEvent(event, options.retryOptions).catch(error => {
          console.error(`📡 EventBus: Async webhook processing failed for ${eventType}`, {
            eventId: event.id,
            error: error.message
          });
        });
      } else {
        // Wait for webhook processing
        await this.processWebhookEvent(event, options.retryOptions);
      }

    } catch (error: any) {
      console.error(`📡 EventBus: Failed to emit event ${eventType}`, {
        eventId: event.id,
        workspaceId: context.workspaceId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Add an internal listener for events (for internal system reactions)
   */
  on(eventType: WebhookEventType, listener: (event: WebhookEvent) => Promise<void>): void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, []);
    }
    this.listeners.get(eventType)!.push(listener);
  }

  /**
   * Remove an internal listener
   */
  off(eventType: WebhookEventType, listener: (event: WebhookEvent) => Promise<void>): void {
    const eventListeners = this.listeners.get(eventType);
    if (eventListeners) {
      const index = eventListeners.indexOf(listener);
      if (index > -1) {
        eventListeners.splice(index, 1);
      }
    }
  }

  /**
   * Emit multiple events in batch
   */
  async emitBatch(
    events: Array<{
      eventType: WebhookEventType;
      data: EventData;
      context: EventContext;
    }>,
    options: EmitEventOptions = {}
  ): Promise<void> {
    console.log(`📡 EventBus: Emitting batch of ${events.length} events`);

    const promises = events.map(({ eventType, data, context }) =>
      this.emit(eventType, data, context, { ...options, async: true })
    );

    if (options.async) {
      // Fire and forget all events
      Promise.allSettled(promises).catch(error => {
        console.error('📡 EventBus: Batch emission failed', { error: error.message });
      });
    } else {
      // Wait for all events
      await Promise.allSettled(promises);
    }
  }

  private async notifyListeners(eventType: WebhookEventType, event: WebhookEvent): Promise<void> {
    const eventListeners = this.listeners.get(eventType) || [];
    
    if (eventListeners.length > 0) {
      console.log(`📡 EventBus: Notifying ${eventListeners.length} internal listeners for ${eventType}`);
      
      const promises = eventListeners.map(listener =>
        listener(event).catch(error => {
          console.error(`📡 EventBus: Internal listener failed for ${eventType}`, {
            eventId: event.id,
            error: error.message
          });
        })
      );

      await Promise.allSettled(promises);
    }
  }

  private async processWebhookEvent(
    event: WebhookEvent,
    retryOptions?: EmitEventOptions['retryOptions']
  ): Promise<void> {
    await processWebhookEvent(event, retryOptions);
  }

  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 12)}`;
  }
}

// Singleton instance
export const eventBus = EventBus.getInstance();

// Convenience functions for common events
export async function emitIssueCreated(
  issue: any,
  context: EventContext,
  options?: EmitEventOptions
): Promise<void> {
  await eventBus.emit('issue.created', { issue }, context, options);
}

export async function emitIssueUpdated(
  issue: any,
  changes: any,
  context: EventContext,
  options?: EmitEventOptions
): Promise<void> {
  await eventBus.emit('issue.updated', { issue, changes }, context, options);
}

export async function emitIssueDeleted(
  issue: any,
  context: EventContext,
  options?: EmitEventOptions
): Promise<void> {
  await eventBus.emit('issue.deleted', { issue }, context, options);
}

export async function emitPostCreated(
  post: any,
  context: EventContext,
  options?: EmitEventOptions
): Promise<void> {
  await eventBus.emit('post.created', { post }, context, options);
}

export async function emitPostUpdated(
  post: any,
  changes: any,
  context: EventContext,
  options?: EmitEventOptions
): Promise<void> {
  await eventBus.emit('post.updated', { post, changes }, context, options);
}

export async function emitWorkspaceMemberAdded(
  member: any,
  context: EventContext,
  options?: EmitEventOptions
): Promise<void> {
  await eventBus.emit('workspace.member_added', { member }, context, options);
}

export async function emitWorkspaceMemberRemoved(
  member: any,
  context: EventContext,
  options?: EmitEventOptions
): Promise<void> {
  await eventBus.emit('workspace.member_removed', { member }, context, options);
}

export async function emitAppInstalled(
  installation: any,
  context: EventContext,
  options?: EmitEventOptions
): Promise<void> {
  await eventBus.emit('app.installed', { installation }, context, options);
}

export async function emitAppUninstalled(
  installation: any,
  context: EventContext,
  options?: EmitEventOptions
): Promise<void> {
  await eventBus.emit('app.uninstalled', { installation }, context, options);
}
