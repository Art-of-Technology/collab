"use client";

import React from 'react';
import { OneSignalDebug } from '@/components/OneSignalDebug';
import { TestNotificationSender } from '@/components/TestNotificationSender';

export default function OneSignalTestPage() {
  return (
    <div className="container mx-auto py-8">
      <h1 className="text-2xl font-bold mb-4">OneSignal Test Page</h1>
      <p className="mb-6">
        Use this page to debug your OneSignal subscription and test notifications.
      </p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h2 className="text-xl font-semibold mb-4">Debug Subscription</h2>
          <OneSignalDebug />
        </div>
        
        <div>
          <h2 className="text-xl font-semibold mb-4">Test Notifications</h2>
          <TestNotificationSender />
        </div>
      </div>
      
      <div className="mt-8 p-4 border rounded">
        <h2 className="text-xl font-semibold mb-2">Debugging Tips:</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>Make sure notifications are enabled in your browser settings for this site</li>
          <li>Check that the External ID matches the user's database ID exactly</li>
          <li>Browser focus can affect notification delivery - try leaving the tab open in the background</li>
          <li>Check the OneSignal dashboard to verify the notification was actually sent</li>
          <li>Clear your browser cache and cookies if problems persist</li>
          <li>Use the test notification sender to directly verify OneSignal delivery to a specific user</li>
          <li>Check server logs for detailed information about notification delivery</li>
        </ul>
      </div>
    </div>
  );
} 