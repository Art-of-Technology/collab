import crypto from 'crypto';
import { AppWebhook, AppWebhookDelivery } from '@prisma/client';

export interface WebhookEvent {
  id: string;
  type: string;
  timestamp: number;
  data: any;
  workspace: {
    id: string;
    slug: string;
    name: string;
  };
  app: {
    id: string;
    slug: string;
    name: string;
  };
}

export interface WebhookDeliveryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  timeoutMs?: number;
}

/**
 * Generate HMAC-SHA256 signature for webhook payload
 */
export function generateWebhookSignature(
  payload: string,
  secret: string,
  timestamp: number
): string {
  const signaturePayload = `${timestamp}.${payload}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(signaturePayload, 'utf8')
    .digest('hex');
  
  return `sha256=${signature}`;
}

/**
 * Verify webhook signature
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
  timestamp: number,
  toleranceMs: number = 300000 // 5 minutes
): boolean {
  // Check timestamp tolerance
  const now = Date.now();
  if (Math.abs(now - timestamp) > toleranceMs) {
    console.warn('Webhook signature verification failed: timestamp out of tolerance', {
      timestamp,
      now,
      diff: Math.abs(now - timestamp),
      toleranceMs
    });
    return false;
  }

  // Generate expected signature
  const expectedSignature = generateWebhookSignature(payload, secret, timestamp);
  
  // Use constant-time comparison to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'utf8'),
    Buffer.from(expectedSignature, 'utf8')
  );
}

/**
 * Generate a secure webhook secret
 */
export function generateWebhookSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Calculate next retry attempt time using exponential backoff
 */
export function calculateNextAttempt(
  attempts: number,
  options: WebhookDeliveryOptions = {}
): Date {
  const {
    initialDelayMs = 1000,   // 1 second
    maxDelayMs = 3600000,    // 1 hour
  } = options;

  // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s, 60s, 60s, ...
  const delayMs = Math.min(
    initialDelayMs * Math.pow(2, attempts),
    maxDelayMs
  );

  // Add jitter (±25%) to prevent thundering herd
  const jitter = delayMs * 0.25 * (Math.random() - 0.5);
  const finalDelay = Math.max(0, delayMs + jitter);

  return new Date(Date.now() + finalDelay);
}

/**
 * Check if webhook delivery should be retried
 */
export function shouldRetryWebhook(
  delivery: AppWebhookDelivery,
  options: WebhookDeliveryOptions = {}
): boolean {
  const { maxAttempts = 10 } = options;
  
  // Don't retry if already delivered
  if (delivery.deliveredAt) return false;
  
  // Don't retry if permanently failed
  if (delivery.failedAt) return false;
  
  // Don't retry if max attempts reached
  if (delivery.attempts >= maxAttempts) return false;
  
  // Don't retry if next attempt time hasn't arrived
  if (delivery.nextAttemptAt && delivery.nextAttemptAt > new Date()) return false;
  
  return true;
}

/**
 * Determine if HTTP status indicates success
 */
export function isSuccessStatus(status: number): boolean {
  return status >= 200 && status < 300;
}

/**
 * Determine if HTTP status indicates permanent failure (don't retry)
 */
export function isPermanentFailure(status: number): boolean {
  // 4xx errors (except 408, 429) are usually permanent
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

/**
 * Create webhook payload for an event
 */
export function createWebhookPayload(event: WebhookEvent): string {
  return JSON.stringify(event, null, 0);
}

/**
 * Parse webhook signature header
 */
export function parseSignatureHeader(signature: string): { timestamp: number; signature: string } | null {
  // Format: "t=1234567890,sha256=abcdef..."
  const parts = signature.split(',');
  let timestamp: number | null = null;
  let sig: string | null = null;

  for (const part of parts) {
    const [key, value] = part.split('=');
    if (key === 't') {
      timestamp = parseInt(value, 10);
    } else if (key === 'sha256') {
      sig = `sha256=${value}`;
    }
  }

  if (timestamp && sig) {
    return { timestamp, signature: sig };
  }

  return null;
}

/**
 * Create signature header for webhook delivery
 */
export function createSignatureHeader(signature: string, timestamp: number): string {
  const sigPart = signature.replace('sha256=', '');
  return `t=${timestamp},sha256=${sigPart}`;
}

/**
 * Validate webhook URL
 */
export function isValidWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    
    // Must be HTTPS in production
    if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
      return false;
    }
    
    // Allow HTTP in development
    if (process.env.NODE_ENV === 'development' && !['http:', 'https:'].includes(parsed.protocol)) {
      return false;
    }
    
    // No localhost/private IPs in production
    if (process.env.NODE_ENV === 'production') {
      const hostname = parsed.hostname;
      if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname.startsWith('10.') ||
        hostname.startsWith('192.168.') ||
        (hostname.startsWith('172.') && 
         parseInt(hostname.split('.')[1]) >= 16 && 
         parseInt(hostname.split('.')[1]) <= 31)
      ) {
        return false;
      }
    }
    
    return true;
  } catch {
    return false;
  }
}

/**
 * Webhook event types that apps can subscribe to
 */
export const WEBHOOK_EVENT_TYPES = [
  'issue.created',
  'issue.updated', 
  'issue.deleted',
  'post.created',
  'post.updated',
  'workspace.member_added',
  'workspace.member_removed',
  'app.installed',
  'app.uninstalled'
] as const;

export type WebhookEventType = typeof WEBHOOK_EVENT_TYPES[number];

/**
 * Validate webhook event types
 */
export function validateEventTypes(eventTypes: string[]): boolean {
  return eventTypes.every(type => WEBHOOK_EVENT_TYPES.includes(type as WebhookEventType));
}
