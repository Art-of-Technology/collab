"use client";

import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";

export function usePushNotifications() {
  const [isSupported, setIsSupported] = useState(false);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    // Check if push notifications are supported
    if ("serviceWorker" in navigator && "PushManager" in window) {
      setIsSupported(true);
      checkSubscription();
    }
  }, []);

  const checkSubscription = async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setSubscription(subscription);
      setIsSubscribed(!!subscription);
    } catch (error) {
      console.error("Error checking push subscription:", error);
    }
  };

  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
      .replace(/\-/g, "+")
      .replace(/_/g, "/");

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  const subscribeToPush = useCallback(async () => {
    if (!isSupported) {
      toast({
        title: "Not Supported",
        description: "Push notifications are not supported in your browser.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      // Register service worker if not already registered
      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      // Request notification permission
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast({
          title: "Permission Denied",
          description: "Please enable notifications in your browser settings.",
          variant: "destructive",
        });
        return;
      }

      // Get VAPID public key from environment
      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) {
        throw new Error("VAPID public key not configured");
      }

      // Subscribe to push notifications
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      // Send subscription to server
      const response = await fetch("/api/notifications/push/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ subscription }),
      });

      if (!response.ok) {
        throw new Error("Failed to save subscription on server");
      }

      setSubscription(subscription);
      setIsSubscribed(true);
      
      toast({
        title: "Subscribed!",
        description: "You will now receive push notifications.",
      });
    } catch (error) {
      console.error("Error subscribing to push notifications:", error);
      toast({
        title: "Subscription Failed",
        description: "Failed to subscribe to push notifications. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, toast]);

  const unsubscribeFromPush = useCallback(async () => {
    if (!subscription) return;

    setIsLoading(true);

    try {
      // Unsubscribe from push manager
      await subscription.unsubscribe();

      // Remove subscription from server
      const response = await fetch("/api/notifications/push/subscribe", {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to remove subscription from server");
      }

      setSubscription(null);
      setIsSubscribed(false);
      
      toast({
        title: "Unsubscribed",
        description: "You will no longer receive push notifications.",
      });
    } catch (error) {
      console.error("Error unsubscribing from push notifications:", error);
      toast({
        title: "Unsubscribe Failed",
        description: "Failed to unsubscribe from push notifications. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [subscription, toast]);

  const toggleSubscription = useCallback(async () => {
    if (isSubscribed) {
      await unsubscribeFromPush();
    } else {
      await subscribeToPush();
    }
  }, [isSubscribed, subscribeToPush, unsubscribeFromPush]);

  return {
    isSupported,
    isSubscribed,
    isLoading,
    subscribeToPush,
    unsubscribeFromPush,
    toggleSubscription,
  };
}