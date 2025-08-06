import webpush from 'web-push';
import { prisma } from '@/lib/prisma';
import { EncryptionService } from '@/lib/encryption';

/**
 * Validates VAPID configuration
 * @returns true if VAPID keys are valid
 */
const validateVapidKeys = (): boolean => {
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

  if (!vapidPublicKey || !vapidPrivateKey) {
    console.error('VAPID keys are not configured');
    return false;
  }

  // Basic validation - check key format
  const publicKeyRegex = /^[A-Za-z0-9_-]{87}$/;
  const privateKeyRegex = /^[A-Za-z0-9_-]{43}$/;

  if (!publicKeyRegex.test(vapidPublicKey) || !privateKeyRegex.test(vapidPrivateKey)) {
    console.error('VAPID keys have invalid format');
    return false;
  }

  return true;
};

/**
 * Initialize web-push with VAPID details
 * @returns true if initialization was successful
 */
const initializeWebPush = (): boolean => {
  try {
    if (!validateVapidKeys()) {
      console.error('Failed to validate VAPID keys');
      return false;
    }

    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY!;
    const vapidEmail = process.env.VAPID_EMAIL;
    if (!vapidEmail) {
      throw new Error('VAPID_EMAIL environment variable is not set. Please configure a valid contact email.');
    }

    webpush.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey);
    console.log('Web push initialized successfully');
    return true;
  } catch (error) {
    console.error('Failed to initialize web push:', error);
    return false;
  }
};

// Initialize on module load
const isWebPushInitialized = initializeWebPush();

export interface PushNotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  image?: string;
  url?: string;
  tag?: string;
  requireInteraction?: boolean;
  actions?: Array<{
    action: string;
    title: string;
    icon?: string;
  }>;
  data?: Record<string, any>;
}

/**
 * Sends a push notification to a specific user
 * @param userId - The user ID to send notification to
 * @param payload - The notification payload
 * @returns true if notification was sent successfully
 */
export async function sendPushNotification(
  userId: string,
  payload: PushNotificationPayload
): Promise<boolean> {
  try {
    if (!isWebPushInitialized) {
      console.error('Web push is not initialized');
      return false;
    }

    // Get user's notification preferences
    const preferences = await prisma.notificationPreferences.findUnique({
      where: { userId },
      select: {
        pushNotificationsEnabled: true,
        pushSubscription: true,
      },
    });

    if (!preferences?.pushNotificationsEnabled || !preferences.pushSubscription) {
      return false;
    }

    // Decrypt the subscription data
    let subscription: any;
    try {
      // Check if subscription is encrypted (string) or plain object
      if (typeof preferences.pushSubscription === 'string') {
        subscription = EncryptionService.decrypt(preferences.pushSubscription);
      } else {
        // For backward compatibility with unencrypted data
        subscription = preferences.pushSubscription;
      }
    } catch (decryptError) {
      console.error('Failed to decrypt push subscription:', decryptError);
      return false;
    }

    // Validate subscription structure
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      console.error('Invalid subscription structure');
      return false;
    }
    
    // Send the push notification
    await webpush.sendNotification(
      subscription,
      JSON.stringify(payload)
    );

    return true;
  } catch (error) {
    if (error instanceof Error) {
      // Handle subscription expired or invalid
      if (error.message.includes('410') || error.message.includes('invalid')) {
        // Remove invalid subscription
        await prisma.notificationPreferences.update({
          where: { userId },
          data: {
            pushSubscription: null,
            pushNotificationsEnabled: false,
          },
        });
      }
    }
    console.error('Error sending push notification:', error);
    return false;
  }
}

/**
 * Sends push notifications to multiple users
 * @param userIds - Array of user IDs to send notifications to
 * @param payload - The notification payload
 */
export async function sendPushNotificationToMultipleUsers(
  userIds: string[],
  payload: PushNotificationPayload
): Promise<void> {
  const promises = userIds.map(userId => sendPushNotification(userId, payload));
  await Promise.allSettled(promises);
}

/**
 * Generate VAPID keys (run this once to get your keys)
 * @returns VAPID key pair
 */
export function generateVAPIDKeys() {
  const vapidKeys = webpush.generateVAPIDKeys();
  console.log('VAPID Public Key:', vapidKeys.publicKey);
  console.log('VAPID Private Key:', vapidKeys.privateKey);
  console.log('\nAdd these to your .env.local file:');
  console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY="${vapidKeys.publicKey}"`);
  console.log(`VAPID_PRIVATE_KEY="${vapidKeys.privateKey}"`);
  console.log(`VAPID_EMAIL="mailto:your-email@example.com"`);
  console.log(`ENCRYPTION_KEY="${EncryptionService.generateKey()}"`);
  return vapidKeys;
}

/**
 * Health check for push notification service
 * @returns Service health status
 */
export function getPushServiceHealth() {
  return {
    initialized: isWebPushInitialized,
    vapidConfigured: validateVapidKeys(),
    encryptionConfigured: EncryptionService.validateConfiguration(),
  };
}