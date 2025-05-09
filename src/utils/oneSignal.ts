import OneSignal from 'react-onesignal';

export const ONESIGNAL_APP_ID = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID || '';

/**
 * Initialize the OneSignal SDK
 */
export const initializeOneSignal = async () => {
  if (!ONESIGNAL_APP_ID) {
    console.error('OneSignal App ID is not defined');
    return false;
  }

  try {
    // Initialize OneSignal with your app ID
    await OneSignal.init({
      appId: ONESIGNAL_APP_ID,
      allowLocalhostAsSecureOrigin: true, // For local development
      notifyButton: {
        enable: true,
        size: 'medium',
        position: 'bottom-right',
        prenotify: true,
        showCredit: false,
        text: {
          'dialog.blocked.message': 'Please unblock notifications to receive updates',
          'dialog.blocked.title': 'Unblock Notifications',
          'dialog.main.button.subscribe': 'Subscribe',
          'dialog.main.button.unsubscribe': 'Unsubscribe',
          'dialog.main.title': 'Manage Notifications',
          'message.action.resubscribed': 'You are now subscribed to notifications',
          'message.action.subscribed': 'Thanks for subscribing!',
          'message.action.subscribing': 'Subscribing you to notifications...',
          'message.action.unsubscribed': 'You will no longer receive notifications',
          'message.prenotify': 'Click to subscribe to notifications',
          'tip.state.blocked': 'Notifications are blocked',
          'tip.state.subscribed': 'You are subscribed to notifications',
          'tip.state.unsubscribed': 'Subscribe to notifications'
        }
      }
    });
    
    console.log('OneSignal initialized successfully');
    return true;
  } catch (error) {
    console.error('Error initializing OneSignal:', error);
    return false;
  }
};

/**
 * Check if push notifications are supported and request permission
 */
export const checkAndSubscribeUser = async () => {
  try {
    if (!OneSignal.Notifications) {
      console.log('OneSignal.Notifications is not available');
      return false;
    }

    // Check if push is supported in this browser
    const isPushSupported = OneSignal.Notifications.isPushSupported();
    
    if (!isPushSupported) {
      console.log('Push notifications are not supported in this browser');
      return false;
    }
    
    // Show the subscription prompt
    try {
      await OneSignal.Slidedown.promptPush();
      return true;
    } catch (err) {
      console.error('Error showing prompt:', err);
      return false;
    }
  } catch (error) {
    console.error('Error checking subscription status:', error);
    return false;
  }
};

/**
 * Set the external user ID for OneSignal
 */
export const setUserIdForOneSignal = (userId: string) => {
  if (!userId) return;
  
  try {
    // In v3, use login() instead of setExternalUserId()
    OneSignal.login(userId);
    console.log('OneSignal user logged in successfully with ID:', userId);
  } catch (error) {
    console.error('Error setting OneSignal external user ID:', error);
  }
};

/**
 * Add tags to the current user for segmentation
 */
export const tagUserForNotifications = (tags: Record<string, string | number | boolean>) => {
  if (!OneSignal.User) {
    console.error('OneSignal.User is not available');
    return;
  }
  
  try {
    // In v3, tags are set via the User namespace
    Object.entries(tags).forEach(([key, value]) => {
      // Convert value to string as required by OneSignal
      OneSignal.User.addTag(key, String(value));
    });
    console.log('OneSignal tags set successfully');
  } catch (error) {
    console.error('Error setting OneSignal tags:', error);
  }
};

/**
 * Debug OneSignal subscription status for the current user
 */
export const debugOneSignalStatus = async () => {
  try {
    if (!OneSignal) {
      console.error("OneSignal SDK not available");
      return { error: "OneSignal SDK not available" };
    }

    // Get current device ID (player ID)
    let deviceId = null;
    try {
      if (OneSignal.User?.onesignalId) {
        deviceId = OneSignal.User.onesignalId;
      }
    } catch (e) {
      console.error("Error getting device ID:", e);
    }

    // Get subscription status
    let isSubscribed = false;
    try {
      if (OneSignal.Notifications?.permission) {
        isSubscribed = OneSignal.Notifications.permission;
      } else if (window.Notification) {
        isSubscribed = Notification.permission === 'granted';
      }
    } catch (e) {
      console.error("Error getting subscription status:", e);
    }

    // Get user ID
    let userId = null;
    try {
      if (OneSignal.User?.externalId) {
        userId = OneSignal.User.externalId;
      }
    } catch (e) {
      console.error("Error getting external user ID:", e);
    }

    // Log all details
    const status = {
      deviceId,
      isSubscribed,
      userId,
      browserSupport: {
        pushManagerSupported: !!window.PushManager,
        notificationSupported: 'Notification' in window,
        permission: Notification.permission
      }
    };

    console.log('OneSignal Debug Status:', status);
    return status;
  } catch (error) {
    console.error("Error in OneSignal debug:", error);
    return { error };
  }
};

/**
 * Logout from OneSignal
 */
export const logoutFromOneSignal = () => {
  try {
    // Clear the external user ID
    OneSignal.logout();
    console.log('OneSignal user logged out successfully');
    return true;
  } catch (error) {
    console.error('Error logging out from OneSignal:', error);
    return false;
  }
}; 