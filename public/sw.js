// Service Worker for Push Notifications
self.addEventListener('push', function(event) {
  if (!event.data) {
    console.log('Push notification received but no data');
    return;
  }

  let data;
  try {
    data = event.data.json();
  } catch (e) {
    console.error('Error parsing push notification data:', e);
    return;
  }

  // Default notification options
  const defaultOptions = {
    icon: '/logo-icon.svg',
    badge: '/favicon-96x96.png',
    vibrate: [100, 50, 100],
    timestamp: Date.now(),
    silent: false,
    renotify: true,
    requireInteraction: false,
    actions: [
      {
        action: 'view',
        title: 'View',
        icon: '/favicon-32x32.png'
      },
      {
        action: 'dismiss',
        title: 'Dismiss',
        icon: '/favicon-16x16.png'
      }
    ]
  };

  // Merge with provided options
  const options = {
    ...defaultOptions,
    body: data.body || 'You have a new notification',
    tag: data.tag || getNotificationTag(data),
    data: {
      url: data.url || '/',
      type: data.type || 'default',
      ...data.data
    },
    // Override only if explicitly provided
    icon: data.icon || defaultOptions.icon,
    badge: data.badge || defaultOptions.badge,
    image: data.image,
    actions: data.actions || defaultOptions.actions,
    requireInteraction: data.requireInteraction ?? defaultOptions.requireInteraction,
    renotify: data.renotify ?? defaultOptions.renotify
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Collab Notification', options)
  );
});

/**
 * Generate a unique tag for notifications to handle grouping
 */
function getNotificationTag(data) {
  if (data.tag) return data.tag;
  
  // Generate tag based on notification type and related entity
  const type = data.type || 'default';
  const entityId = data.data?.issueId || data.data?.taskId || data.data?.postId || 'general';
  return `${type}:${entityId}`;
}

// Handle notification clicks
self.addEventListener('notificationclick', function(event) {
  const notification = event.notification;
  const action = event.action;
  const data = notification.data || {};

  // Always close the notification
  notification.close();

  // Handle different actions
  let urlToOpen = data.url || '/';
  
  if (action === 'dismiss') {
    // Just close the notification
    return;
  }

  // Focus existing window or open new one
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function(clientList) {
        // Try to focus an existing window
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.navigate(urlToOpen)
              .then(navigatedClient => navigatedClient.focus());
          }
        }
        // If no existing window, open a new one
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});

// Handle service worker activation
self.addEventListener('activate', event => {
  console.log('Service Worker activated');
  event.waitUntil(clients.claim());
});

// Handle service worker installation
self.addEventListener('install', event => {
  console.log('Service Worker installed');
  event.waitUntil(self.skipWaiting());
});