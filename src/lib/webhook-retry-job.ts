/**
 * Background job processor for webhook retries
 * This would typically be run as a separate process or cron job
 */

import { retryFailedWebhooks } from './webhook-delivery';

/**
 * Process webhook retries - should be called periodically
 */
export async function processWebhookRetries(): Promise<void> {
  console.log('🪝 Webhook: Starting retry job');
  
  try {
    await retryFailedWebhooks({
      maxAttempts: 10,
      initialDelayMs: 1000,
      maxDelayMs: 3600000, // 1 hour max
      timeoutMs: 10000 // 10 second timeout
    });
    
    console.log('🪝 Webhook: Retry job completed successfully');
  } catch (error: any) {
    console.error('🪝 Webhook: Retry job failed', {
      error: error.message,
      stack: error.stack
    });
  }
}

/**
 * Start webhook retry processor (run every 5 minutes)
 */
export function startWebhookRetryProcessor(): NodeJS.Timeout {
  console.log('🪝 Webhook: Starting retry processor');
  
  // Run immediately
  processWebhookRetries();
  
  // Then run every 5 minutes
  return setInterval(processWebhookRetries, 5 * 60 * 1000);
}

/**
 * Stop webhook retry processor
 */
export function stopWebhookRetryProcessor(intervalId: NodeJS.Timeout): void {
  console.log('🪝 Webhook: Stopping retry processor');
  clearInterval(intervalId);
}
