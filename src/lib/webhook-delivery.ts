import { PrismaClient } from '@prisma/client';
import { 
  WebhookEvent, 
  WebhookDeliveryOptions,
  generateWebhookSignature,
  calculateNextAttempt,
  shouldRetryWebhook,
  isSuccessStatus,
  isPermanentFailure,
  createWebhookPayload,
  createSignatureHeader
} from './webhooks';
import { decrypt } from './apps/crypto';

const prisma = new PrismaClient();

export interface WebhookDeliveryResult {
  success: boolean;
  status?: number;
  response?: string;
  error?: string;
  shouldRetry?: boolean;
}

/**
 * Deliver webhook to a single URL
 */
export async function deliverWebhook(
  webhookId: string,
  event: WebhookEvent,
  options: WebhookDeliveryOptions = {}
): Promise<WebhookDeliveryResult> {
  const { timeoutMs = 10000 } = options;

  try {
    // Get webhook details
    const webhook = await prisma.appWebhook.findUnique({
      where: { id: webhookId },
      include: { app: true, installation: true }
    });

    if (!webhook || !webhook.isActive) {
      return { success: false, error: 'Webhook not found or inactive', shouldRetry: false };
    }

    // Check if webhook subscribes to this event type
    if (!webhook.eventTypes.includes(event.type)) {
      return { success: false, error: 'Webhook not subscribed to event type', shouldRetry: false };
    }

    // Decrypt webhook secret
    const secret = await decrypt(Buffer.from(webhook.secretEnc));
    
    // Create payload and signature
    const payload = createWebhookPayload(event);
    const timestamp = Date.now();
    const signature = generateWebhookSignature(payload, secret, timestamp);
    const signatureHeader = createSignatureHeader(signature, timestamp);

    // Prepare headers
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': `Collab-Webhooks/1.0`,
      'X-Collab-Signature': signatureHeader,
      'X-Collab-Event-Type': event.type,
      'X-Collab-Event-ID': event.id,
      'X-Collab-Timestamp': timestamp.toString(),
      'X-Collab-App-ID': webhook.appId,
      'X-Collab-Installation-ID': webhook.installationId,
    };

    console.log(`🪝 Webhook: Delivering ${event.type} to ${webhook.url}`, {
      eventId: event.id,
      webhookId,
      timestamp
    });

    // Make HTTP request
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body: payload,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const responseText = await response.text().catch(() => '');
      const success = isSuccessStatus(response.status);
      const shouldRetry = !success && !isPermanentFailure(response.status);

      console.log(`🪝 Webhook: ${success ? 'Success' : 'Failed'} ${response.status}`, {
        eventId: event.id,
        webhookId,
        status: response.status,
        shouldRetry
      });

      return {
        success,
        status: response.status,
        response: responseText.slice(0, 1000), // Limit response size
        shouldRetry
      };

    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      
      const isTimeout = fetchError.name === 'AbortError';
      const error = isTimeout ? 'Request timeout' : fetchError.message;
      
      console.warn(`🪝 Webhook: Delivery error`, {
        eventId: event.id,
        webhookId,
        error,
        isTimeout
      });

      return {
        success: false,
        error,
        shouldRetry: true // Network errors are usually retryable
      };
    }

  } catch (error: any) {
    console.error(`🪝 Webhook: Unexpected error`, {
      eventId: event.id,
      webhookId,
      error: error.message
    });

    return {
      success: false,
      error: error.message,
      shouldRetry: true
    };
  }
}

/**
 * Record webhook delivery attempt
 */
export async function recordWebhookDelivery(
  webhookId: string,
  eventId: string,
  eventType: string,
  payload: any,
  result: WebhookDeliveryResult,
  signature: string,
  options: WebhookDeliveryOptions = {}
): Promise<void> {
  try {
    // Find existing delivery record or create new one
    const existingDelivery = await prisma.appWebhookDelivery.findUnique({
      where: {
        webhookId_eventId: {
          webhookId,
          eventId
        }
      }
    });

    const attempts = (existingDelivery?.attempts || 0) + 1;
    const now = new Date();
    
    const updateData: any = {
      attempts,
      lastAttemptAt: now,
      httpStatus: result.status,
      responseBody: result.response,
    };

    if (result.success) {
      updateData.deliveredAt = now;
      updateData.nextAttemptAt = null;
    } else if (result.shouldRetry && shouldRetryWebhook({ ...existingDelivery, attempts } as any, options)) {
      updateData.nextAttemptAt = calculateNextAttempt(attempts, options);
    } else {
      // Permanent failure
      updateData.failedAt = now;
      updateData.nextAttemptAt = null;
    }

    if (existingDelivery) {
      // Update existing delivery
      await prisma.appWebhookDelivery.update({
        where: { id: existingDelivery.id },
        data: updateData
      });
    } else {
      // Create new delivery record
      await prisma.appWebhookDelivery.create({
        data: {
          webhookId,
          eventId,
          eventType,
          payload,
          signature,
          ...updateData
        }
      });
    }

    console.log(`🪝 Webhook: Recorded delivery attempt ${attempts}`, {
      eventId,
      webhookId,
      success: result.success,
      nextAttempt: updateData.nextAttemptAt
    });

  } catch (error: any) {
    console.error(`🪝 Webhook: Failed to record delivery`, {
      eventId,
      webhookId,
      error: error.message
    });
  }
}

/**
 * Process webhook deliveries for an event
 */
export async function processWebhookEvent(
  event: WebhookEvent,
  options: WebhookDeliveryOptions = {}
): Promise<void> {
  try {
    console.log(`🪝 Webhook: Processing event ${event.type}`, {
      eventId: event.id,
      workspaceId: event.workspace.id,
      appId: event.app?.id
    });

    // Find all active webhooks that subscribe to this event type
    const webhooks = await prisma.appWebhook.findMany({
      where: {
        isActive: true,
        eventTypes: {
          has: event.type
        },
        // Only send to webhooks for installations in this workspace
        installation: {
          workspaceId: event.workspace.id,
          status: 'ACTIVE'
        }
      },
      include: {
        app: true,
        installation: true
      }
    });

    if (webhooks.length === 0) {
      console.log(`🪝 Webhook: No active webhooks for event ${event.type}`, {
        eventId: event.id,
        workspaceId: event.workspace.id
      });
      return;
    }

    console.log(`🪝 Webhook: Found ${webhooks.length} webhooks for event`, {
      eventId: event.id,
      eventType: event.type,
      webhookIds: webhooks.map(w => w.id)
    });

    // Process each webhook delivery
    const deliveryPromises = webhooks.map(async (webhook) => {
      try {
        const result = await deliverWebhook(webhook.id, event, options);
        const payload = createWebhookPayload(event);
        const secret = await decrypt(Buffer.from(webhook.secretEnc));
        const signature = generateWebhookSignature(payload, secret, Date.now());
        
        await recordWebhookDelivery(
          webhook.id,
          event.id,
          event.type,
          event,
          result,
          signature,
          options
        );
      } catch (error: any) {
        console.error(`🪝 Webhook: Failed to process webhook ${webhook.id}`, {
          eventId: event.id,
          webhookId: webhook.id,
          error: error.message
        });
      }
    });

    await Promise.allSettled(deliveryPromises);

    console.log(`🪝 Webhook: Completed processing event ${event.type}`, {
      eventId: event.id,
      webhookCount: webhooks.length
    });

  } catch (error: any) {
    console.error(`🪝 Webhook: Failed to process event`, {
      eventId: event.id,
      eventType: event.type,
      error: error.message
    });
  }
}

/**
 * Retry failed webhook deliveries
 */
export async function retryFailedWebhooks(
  options: WebhookDeliveryOptions = {}
): Promise<void> {
  try {
    // Find deliveries that need retry
    const failedDeliveries = await prisma.appWebhookDelivery.findMany({
      where: {
        deliveredAt: null,
        failedAt: null,
        nextAttemptAt: {
          lte: new Date()
        }
      },
      include: {
        webhook: {
          include: {
            app: true,
            installation: true
          }
        }
      },
      orderBy: {
        nextAttemptAt: 'asc'
      },
      take: 100 // Process in batches
    });

    if (failedDeliveries.length === 0) {
      return;
    }

    console.log(`🪝 Webhook: Retrying ${failedDeliveries.length} failed deliveries`);

    for (const delivery of failedDeliveries) {
      if (!shouldRetryWebhook(delivery, options)) {
        continue;
      }

      const event: WebhookEvent = delivery.payload as unknown as WebhookEvent;
      const result = await deliverWebhook(delivery.webhook.id, event, options);
      
      await recordWebhookDelivery(
        delivery.webhook.id,
        delivery.eventId,
        delivery.eventType,
        delivery.payload,
        result,
        delivery.signature,
        options
      );
    }

  } catch (error: any) {
    console.error(`🪝 Webhook: Failed to retry webhooks`, {
      error: error.message
    });
  }
}
