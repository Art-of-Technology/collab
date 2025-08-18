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

  const options = {
    body: data.body || 'You have a new notification',
    icon: data.icon || '/icon-192x192.png',
    badge: data.badge || '/icon-192x192.png',
    image: data.image,
    vibrate: [200, 100, 200],
    data: {
      url: data.url || '/',
      ...data.data
    },
    actions: data.actions || [],
    requireInteraction: data.requireInteraction || false,
    tag: data.tag || 'default',
    renotify: data.renotify || false
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Collab Notification', options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function(clientList) {
        // Check if there's already a tab open with our app
        for (let i = 0; i < clientList.length; i++) {
          const client = clientList[i];
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.navigate(urlToOpen);
            return client.focus();
          }
        }
        // If no existing tab, open a new one
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});

// Handle notification action clicks
self.addEventListener('notificationclick', function(event) {
  if (!event.action) {
    // Main notification body was clicked
    return;
  }

  // Handle specific actions
  switch (event.action) {
    case 'view':
      // Open the relevant page
      event.waitUntil(
        clients.openWindow(event.notification.data.url)
      );
      break;
    case 'dismiss':
      // Just close the notification
      event.notification.close();
      break;
    default:
      console.log('Unknown action clicked:', event.action);
      break;
  }
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