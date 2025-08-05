import webpush from 'web-push';
import { prisma } from '@/lib/prisma';

// Initialize web-push with VAPID details
// You'll need to generate VAPID keys and add them to your environment variables
const initializeWebPush = () => {
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  const vapidEmail = process.env.VAPID_EMAIL || 'mailto:admin@example.com';

  if (vapidPublicKey && vapidPrivateKey) {
    webpush.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey);
  }
};

// Initialize on module load
initializeWebPush();

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

export async function sendPushNotification(
  userId: string,
  payload: PushNotificationPayload
): Promise<boolean> {
  try {
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

    const subscription = preferences.pushSubscription as any;
    
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
            pushSubscription: undefined,
            pushNotificationsEnabled: false,
          },
        });
      }
    }
    console.error('Error sending push notification:', error);
    return false;
  }
}

export async function sendPushNotificationToMultipleUsers(
  userIds: string[],
  payload: PushNotificationPayload
): Promise<void> {
  const promises = userIds.map(userId => sendPushNotification(userId, payload));
  await Promise.allSettled(promises);
}

// Generate VAPID keys (run this once to get your keys)
export function generateVAPIDKeys() {
  const vapidKeys = webpush.generateVAPIDKeys();
  console.log('VAPID Public Key:', vapidKeys.publicKey);
  console.log('VAPID Private Key:', vapidKeys.privateKey);
  console.log('\nAdd these to your .env.local file:');
  console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY="${vapidKeys.publicKey}"`);
  console.log(`VAPID_PRIVATE_KEY="${vapidKeys.privateKey}"`);
  console.log(`VAPID_EMAIL="mailto:your-email@example.com"`);
  return vapidKeys;
}