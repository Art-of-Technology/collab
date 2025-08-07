// Enhanced Service Worker for Push Notifications
const NOTIFICATION_CACHE = 'notifications-v1';
const MAX_NOTIFICATIONS = 50;

// Store notifications in IndexedDB for offline access
self.addEventListener('push', function (event) {
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

  // Enhanced notification options
  const options = {
    body: data.body || 'You have a new notification',
    icon: data.icon || '/icon-192x192.png',
    badge: data.badge || '/icon-192x192.png',
    image: data.image,
    vibrate: data.silent ? [] : [200, 100, 200],
    data: {
      url: data.url || '/',
      notificationId: data.id,
      timestamp: Date.now(),
      ...data.data
    },
    actions: data.actions || [
      { action: 'view', title: 'View' },
      { action: 'dismiss', title: 'Dismiss' }
    ],
    requireInteraction: data.requireInteraction || false,
    tag: data.tag || data.id || 'default',
    renotify: data.renotify || false,
    silent: data.silent || false,
    timestamp: Date.now()
  };

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(data.title || 'Collab Notification', options),
      storeNotification(data), // Store for offline access
      updateNotificationBadge() // Update badge count
    ])
  );
});

// Enhanced notification click handling
self.addEventListener('notificationclick', function (event) {
  event.notification.close();

  const { action, data } = event;
  const url = data?.url || '/';

  if (action === 'dismiss') {
    // Mark as dismissed without opening
    return markNotificationAsDismissed(data?.notificationId);
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function (clientList) {
        // Check if there's already a tab open with our app
        for (let client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            // Send message to existing tab to handle navigation
            client.postMessage({
              type: 'NOTIFICATION_CLICKED',
              url: url,
              notificationId: data?.notificationId
            });
            return client.focus();
          }
        }
        // If no existing tab, open a new one
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
      .then(() => {
        // Mark notification as read
        if (data?.notificationId) {
          markNotificationAsRead(data.notificationId);
        }
      })
  );
});

// Handle notification action clicks
self.addEventListener('notificationclick', function (event) {
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

// Background sync for offline notification handling
self.addEventListener('sync', function (event) {
  if (event.tag === 'notification-sync') {
    event.waitUntil(syncNotifications());
  }
});

// Handle service worker activation
self.addEventListener('activate', event => {
  console.log('Service Worker activated');
  event.waitUntil(
    Promise.all([
      clients.claim(),
      clearOldNotificationCache()
    ])
  );
});

// Handle service worker installation
self.addEventListener('install', event => {
  console.log('Service Worker installed');
  event.waitUntil(
    Promise.all([
      self.skipWaiting(),
      initializeNotificationDB()
    ])
  );
});

// Notification storage and management functions
async function storeNotification(notification) {
  try {
    const db = await openNotificationDB();
    const transaction = db.transaction(['notifications'], 'readwrite');
    const store = transaction.objectStore('notifications');

    await store.add({
      ...notification,
      timestamp: Date.now(),
      read: false,
      dismissed: false
    });

    // Cleanup old notifications
    const allNotifications = await store.getAll();
    if (allNotifications.length > MAX_NOTIFICATIONS) {
      const oldest = allNotifications.sort((a, b) => a.timestamp - b.timestamp)[0];
      await store.delete(oldest.id);
    }
  } catch (error) {
    console.error('Failed to store notification:', error);
  }
}

async function updateNotificationBadge() {
  try {
    const db = await openNotificationDB();
    const transaction = db.transaction(['notifications'], 'readonly');
    const store = transaction.objectStore('notifications');
    const unreadCount = await store.count(IDBKeyRange.only(false)); // Count unread

    if ('setAppBadge' in navigator) {
      navigator.setAppBadge(unreadCount);
    }
  } catch (error) {
    console.error('Failed to update badge:', error);
  }
}

async function markNotificationAsRead(notificationId) {
  try {
    const db = await openNotificationDB();
    const transaction = db.transaction(['notifications'], 'readwrite');
    const store = transaction.objectStore('notifications');

    const notification = await store.get(notificationId);
    if (notification) {
      notification.read = true;
      await store.put(notification);
    }

    // Update badge count
    await updateNotificationBadge();

    // Sync with server when online
    if (navigator.onLine) {
      await syncNotificationWithServer(notificationId, { read: true });
    }
  } catch (error) {
    console.error('Failed to mark notification as read:', error);
  }
}

async function markNotificationAsDismissed(notificationId) {
  try {
    const db = await openNotificationDB();
    const transaction = db.transaction(['notifications'], 'readwrite');
    const store = transaction.objectStore('notifications');

    const notification = await store.get(notificationId);
    if (notification) {
      notification.dismissed = true;
      await store.put(notification);
    }

    // Update badge count
    await updateNotificationBadge();
  } catch (error) {
    console.error('Failed to mark notification as dismissed:', error);
  }
}



async function syncNotifications() {
  try {
    const db = await openNotificationDB();
    const transaction = db.transaction(['notifications'], 'readonly');
    const store = transaction.objectStore('notifications');
    const notifications = await store.getAll();

    // Sync unread notifications with server
    const unreadNotifications = notifications.filter(n => !n.read && !n.synced);

    for (const notification of unreadNotifications) {
      await syncNotificationWithServer(notification.id, { read: true });
      notification.synced = true;
    }

    // Update local storage
    const writeTransaction = db.transaction(['notifications'], 'readwrite');
    const writeStore = writeTransaction.objectStore('notifications');

    for (const notification of unreadNotifications) {
      await writeStore.put(notification);
    }
  } catch (error) {
    console.error('Failed to sync notifications:', error);
  }
}

async function syncNotificationWithServer(notificationId, updates) {
  try {
    const response = await fetch('/api/notifications/mark-read', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        notificationId,
        ...updates
      })
    });

    if (!response.ok) {
      throw new Error('Failed to sync with server');
    }
  } catch (error) {
    console.error('Failed to sync notification with server:', error);
    // Queue for retry when online
    await queueForRetry(notificationId, updates);
  }
}

async function queueForRetry(notificationId, updates) {
  try {
    const db = await openNotificationDB();
    const transaction = db.transaction(['syncQueue'], 'readwrite');
    const store = transaction.objectStore('syncQueue');

    await store.add({
      notificationId,
      updates,
      timestamp: Date.now(),
      retryCount: 0
    });
  } catch (error) {
    console.error('Failed to queue for retry:', error);
  }
}

function openNotificationDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('NotificationDB', 2);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Create notifications store
      if (!db.objectStoreNames.contains('notifications')) {
        const store = db.createObjectStore('notifications', { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp');
        store.createIndex('read', 'read');
        store.createIndex('dismissed', 'dismissed');
      }

      // Create sync queue store
      if (!db.objectStoreNames.contains('syncQueue')) {
        const queueStore = db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
        queueStore.createIndex('timestamp', 'timestamp');
      }
    };
  });
}

async function initializeNotificationDB() {
  try {
    await openNotificationDB();
    console.log('Notification database initialized');
  } catch (error) {
    console.error('Failed to initialize notification database:', error);
  }
}

async function clearOldNotificationCache() {
  try {
    const cache = await caches.open(NOTIFICATION_CACHE);
    const keys = await cache.keys();

    // Remove old cache entries
    for (const key of keys) {
      const response = await cache.match(key);
      if (response) {
        const date = response.headers.get('date');
        if (date && Date.now() - new Date(date).getTime() > 7 * 24 * 60 * 60 * 1000) {
          await cache.delete(key);
        }
      }
    }
  } catch (error) {
    console.error('Failed to clear old notification cache:', error);
  }
}

// Handle online/offline events
self.addEventListener('online', () => {
  console.log('Service Worker: Online');
  // Sync pending notifications when back online
  syncNotifications();
});

self.addEventListener('offline', () => {
  console.log('Service Worker: Offline');
});