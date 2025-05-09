"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { 
  initializeOneSignal, 
  checkAndSubscribeUser, 
  setUserIdForOneSignal, 
  tagUserForNotifications,
  debugOneSignalStatus,
  logoutFromOneSignal
} from '@/utils/oneSignal';
import OneSignal from 'react-onesignal';
import { useToast } from '@/hooks/use-toast';

interface OneSignalContextType {
  isInitialized: boolean;
  isSubscribed: boolean;
  isPushSupported: boolean;
  requestNotificationPermission: () => Promise<boolean>;
  debugSubscription: () => Promise<any>;
  logoutOneSignal: () => Promise<boolean>;
}

const OneSignalContext = createContext<OneSignalContextType>({
  isInitialized: false,
  isSubscribed: false,
  isPushSupported: false,
  requestNotificationPermission: async () => false,
  debugSubscription: async () => ({}),
  logoutOneSignal: async () => false,
});

export const useOneSignal = () => useContext(OneSignalContext);

export const OneSignalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isPushSupported, setIsPushSupported] = useState(false);
  const { data: session } = useSession();
  const { toast } = useToast();
  
  // Check if we're in the browser environment
  const isBrowser = typeof window !== 'undefined';
  
  useEffect(() => {
    const init = async () => {
      if (!isBrowser) return;
      
      try {
        // Initialize OneSignal
        const initialized = await initializeOneSignal();
        setIsInitialized(initialized || false);
        
        if (initialized) {
          // Check if push is supported in this browser
          try {
            // Use only standard API
            const supported = !!window.PushManager || ('Notification' in window);
            setIsPushSupported(supported);
            
            // Check current subscription status
            if (window.Notification) {
              setIsSubscribed(Notification.permission === 'granted');
            }
          } catch (err) {
            console.error('Error checking notification permissions:', err);
          }
        }
      } catch (error) {
        console.error('Error initializing OneSignal in context:', error);
      }
    };
    
    init();
  }, [isBrowser]);
  
  // Set user ID when user logs in
  useEffect(() => {
    if (isBrowser && isInitialized && session?.user?.id) {
      try {
        console.log('Setting OneSignal external ID:', session.user.id);
        
        // Set user identifier for OneSignal
        setUserIdForOneSignal(session.user.id);
        
        // Set user tags one by one
        try {
          // Don't pass too many tags at once to avoid API issues
          tagUserForNotifications({
            userId: session.user.id
          });
          
          if (session.user.email) {
            tagUserForNotifications({
              email: session.user.email
            });
          }
          
          if (session.user.name) {
            tagUserForNotifications({
              name: session.user.name
            });
          }
        } catch (error) {
          console.error('Error setting user tags:', error);
        }
      } catch (error) {
        console.error('Error setting OneSignal user ID:', error);
      }
    }
  }, [isInitialized, session, isBrowser]);
  
  const requestNotificationPermission = async () => {
    if (!isBrowser || !isInitialized || !isPushSupported) {
      toast({
        title: 'Error',
        description: 'Push notifications are not supported in this browser',
      });
      return false;
    }
    
    try {
      // Use only the native browser API or OneSignal's modern methods
      if (window.Notification) {
        const permission = await Notification.requestPermission();
        const granted = permission === 'granted';
        setIsSubscribed(granted);
        
        if (granted) {
          toast({
            title: 'Success',
            description: 'You have successfully subscribed to notifications',
          });
        }
        
        return granted;
      }
      
      // Fall back to OneSignal's method
      const result = await checkAndSubscribeUser();
      setIsSubscribed(!!result);
      
      if (result) {
        toast({
          title: 'Success',
          description: 'You have successfully subscribed to notifications',
        });
      }
      
      return !!result;
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      toast({
        title: 'Error',
        description: 'Failed to request notification permission',
        variant: 'destructive',
      });
      return false;
    }
  };
  
  const debugSubscription = async () => {
    return await debugOneSignalStatus();
  };
  
  const logoutOneSignal = async () => {
    return logoutFromOneSignal();
  };
  
  return (
    <OneSignalContext.Provider value={{
      isInitialized,
      isSubscribed,
      isPushSupported,
      requestNotificationPermission,
      debugSubscription,
      logoutOneSignal,
    }}>
      {children}
    </OneSignalContext.Provider>
  );
}; 