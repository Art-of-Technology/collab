"use client";

import React from 'react';
import { Bell, BellOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useOneSignal } from '@/context/OneSignalContext';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface NotificationSubscribeButtonProps {
  variant?: "default" | "outline" | "ghost" | "secondary"; 
  size?: "sm" | "default" | "lg" | "icon";
  className?: string;
}

export function NotificationSubscribeButton({ 
  variant = "outline", 
  size = "icon",
  className = ""
}: NotificationSubscribeButtonProps) {
  const { isSubscribed, isPushSupported, requestNotificationPermission } = useOneSignal();

  const handleSubscribe = async () => {
    await requestNotificationPermission();
  };

  if (!isPushSupported) {
    return null; // Don't show the button if push is not supported
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={variant}
            size={size}
            onClick={handleSubscribe}
            className={className}
            disabled={isSubscribed}
          >
            {isSubscribed ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {isSubscribed 
            ? "You are subscribed to notifications" 
            : "Enable browser notifications"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
} 