"use client";

import React, { useState } from 'react';
import { useOneSignal } from '@/context/OneSignalContext';
import { Button } from '@/components/ui/button';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { setUserIdForOneSignal } from '@/utils/oneSignal';
import { useSession } from 'next-auth/react';

export function OneSignalDebug() {
  const { 
    isInitialized, 
    isSubscribed, 
    isPushSupported, 
    requestNotificationPermission,
    debugSubscription,
    logoutOneSignal
  } = useOneSignal();
  const { data: session } = useSession();
  
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  
  const checkStatus = async () => {
    setLoading(true);
    try {
      const status = await debugSubscription();
      setDebugInfo(status);
      console.log("OneSignal Debug Info:", status);
    } catch (error) {
      console.error("Error fetching debug info:", error);
    } finally {
      setLoading(false);
    }
  };
  
  const logout = async () => {
    setLoading(true);
    try {
      await logoutOneSignal();
      setDebugInfo(null);
      alert("Logged out of OneSignal. Refresh the page to complete the process.");
    } catch (error) {
      console.error("Error logging out:", error);
    } finally {
      setLoading(false);
    }
  };
  
  const forceReset = async () => {
    setLoading(true);
    try {
      if (!session?.user?.id) {
        alert("You must be logged in to reset your OneSignal ID");
        return;
      }
      
      // First logout
      await logoutOneSignal();
      
      // Wait a moment
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Then login with the correct ID
      setUserIdForOneSignal(session.user.id);
      
      alert("OneSignal ID reset complete. Refresh the page to see changes.");
      await checkStatus();
    } catch (error) {
      console.error("Error resetting:", error);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <Card className="w-full max-w-md mx-auto my-4">
      <CardHeader>
        <CardTitle>OneSignal Debug</CardTitle>
        <CardDescription>Check your notification subscription status</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span>Initialized:</span>
            <span>{isInitialized ? '✅' : '❌'}</span>
          </div>
          <div className="flex justify-between">
            <span>Push Supported:</span>
            <span>{isPushSupported ? '✅' : '❌'}</span>
          </div>
          <div className="flex justify-between">
            <span>Subscribed:</span>
            <span>{isSubscribed ? '✅' : '❌'}</span>
          </div>
          
          {session?.user && (
            <div className="flex justify-between mt-2 pt-2 border-t">
              <span>Your User ID:</span>
              <span className="font-mono text-xs">{session.user.id}</span>
            </div>
          )}
          
          {debugInfo && (
            <div className="mt-4 p-3 bg-gray-100 dark:bg-gray-800 rounded text-sm overflow-auto">
              <pre>{JSON.stringify(debugInfo, null, 2)}</pre>
            </div>
          )}
        </div>
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={checkStatus}
          disabled={loading || !isInitialized}
        >
          {loading ? 'Checking...' : 'Check Status'}
        </Button>
        <Button
          onClick={() => requestNotificationPermission()}
          disabled={loading || !isInitialized || !isPushSupported || isSubscribed}
        >
          {isSubscribed ? 'Already Subscribed' : 'Subscribe'}
        </Button>
        <Button
          variant="destructive"
          onClick={logout}
          disabled={loading || !isInitialized}
        >
          Logout
        </Button>
        <Button
          variant="secondary"
          onClick={forceReset}
          disabled={loading || !isInitialized || !session?.user?.id}
        >
          Force Reset ID
        </Button>
      </CardFooter>
    </Card>
  );
} 