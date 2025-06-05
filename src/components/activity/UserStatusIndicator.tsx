"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { 
  Play, 
  Pause, 
  Coffee, 
  Users, 
  Car, 
  Eye, 
  Search, 
  Moon, 
  CheckCircle,
  Clock,
  Activity
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface UserStatus {
  id: string;
  currentStatus: string;
  currentTaskId?: string;
  statusStartedAt: string;
  statusText?: string;
  isAvailable: boolean;
  autoEndAt?: string;
  currentTask?: {
    id: string;
    title: string;
    issueKey?: string;
    priority: string;
  };
}

interface UserStatusIndicatorProps {
  className?: string;
  showText?: boolean;
  size?: "sm" | "md" | "lg";
}

const STATUS_CONFIGS = {
  WORKING: {
    label: "Working",
    icon: Play,
    color: "bg-green-500",
    textColor: "text-green-700",
    bgColor: "bg-green-50",
  },
  LUNCH: {
    label: "Lunch",
    icon: Coffee,
    color: "bg-orange-500",
    textColor: "text-orange-700",
    bgColor: "bg-orange-50",
  },
  BREAK: {
    label: "Break",
    icon: Pause,
    color: "bg-blue-500",
    textColor: "text-blue-700",
    bgColor: "bg-blue-50",
  },
  MEETING: {
    label: "Meeting",
    icon: Users,
    color: "bg-purple-500",
    textColor: "text-purple-700",
    bgColor: "bg-purple-50",
  },
  TRAVEL: {
    label: "Travel",
    icon: Car,
    color: "bg-indigo-500",
    textColor: "text-indigo-700",
    bgColor: "bg-indigo-50",
  },
  REVIEW: {
    label: "Review",
    icon: Eye,
    color: "bg-teal-500",
    textColor: "text-teal-700",
    bgColor: "bg-teal-50",
  },
  RESEARCH: {
    label: "Research",
    icon: Search,
    color: "bg-cyan-500",
    textColor: "text-cyan-700",
    bgColor: "bg-cyan-50",
  },
  OFFLINE: {
    label: "Offline",
    icon: Moon,
    color: "bg-gray-500",
    textColor: "text-gray-700",
    bgColor: "bg-gray-50",
  },
  AVAILABLE: {
    label: "Available",
    icon: CheckCircle,
    color: "bg-green-400",
    textColor: "text-green-700",
    bgColor: "bg-green-50",
  },
};

const QUICK_ACTIVITIES = [
  { type: "LUNCH_START", label: "Going to Lunch", duration: 60 },
  { type: "BREAK_START", label: "Taking a Break", duration: 15 },
  { type: "MEETING_START", label: "In a Meeting", duration: 30 },
  { type: "RESEARCH_START", label: "Researching", duration: null },
  { type: "TRAVEL_START", label: "Traveling", duration: null },
  { type: "OFFLINE", label: "Going Offline", duration: null },
];

export function UserStatusIndicator({ 
  className, 
  showText = true, 
  size = "md" 
}: UserStatusIndicatorProps) {
  const [status, setStatus] = useState<UserStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();

  // Size configurations
  const sizeConfig = {
    sm: { indicator: "h-2 w-2", text: "text-xs", badge: "text-xs px-1.5 py-0.5" },
    md: { indicator: "h-3 w-3", text: "text-sm", badge: "text-sm px-2 py-1" },
    lg: { indicator: "h-4 w-4", text: "text-base", badge: "text-base px-3 py-1.5" },
  };

  const fetchStatus = async () => {
    try {
      const response = await fetch("/api/activities/status");
      if (response.ok) {
        const data = await response.json();
        setStatus(data.status);
      }
    } catch (error) {
      console.error("Error fetching status:", error);
    }
  };

  const startActivity = async (eventType: string, duration?: number) => {
    setIsLoading(true);
    try {
      const autoEndAt = duration 
        ? new Date(Date.now() + duration * 60 * 1000).toISOString()
        : undefined;

      const response = await fetch("/api/activities/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType,
          description: QUICK_ACTIVITIES.find(a => a.type === eventType)?.label,
          autoEndAt,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        toast({
          title: "Status Updated",
          description: data.message,
        });
        await fetchStatus();
        setIsOpen(false);
      } else {
        throw new Error("Failed to update status");
      }
    } catch (error) {
      console.error("Error starting activity:", error);
      toast({
        title: "Error",
        description: "Failed to update status",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const endActivity = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/activities/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: "Set to available",
        }),
      });

      if (response.ok) {
        toast({
          title: "Status Updated",
          description: "You are now available",
        });
        await fetchStatus();
        setIsOpen(false);
      } else {
        throw new Error("Failed to end activity");
      }
    } catch (error) {
      console.error("Error ending activity:", error);
      toast({
        title: "Error",
        description: "Failed to update status",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getTimeSince = (startTime: string) => {
    const start = new Date(startTime);
    const now = new Date();
    const diff = now.getTime() - start.getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    
    if (minutes < 60) {
      return `${minutes}m`;
    } else {
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      return `${hours}h ${remainingMinutes}m`;
    }
  };

  useEffect(() => {
    fetchStatus();
    // Refresh status every 30 seconds
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  if (!status) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <div className={cn("rounded-full bg-gray-300 animate-pulse", sizeConfig[size].indicator)} />
        {showText && <span className={cn("text-gray-500", sizeConfig[size].text)}>Loading...</span>}
      </div>
    );
  }

  const config = STATUS_CONFIGS[status.currentStatus as keyof typeof STATUS_CONFIGS] || STATUS_CONFIGS.AVAILABLE;
  const Icon = config.icon;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" className={cn("h-auto p-1 hover:bg-transparent", className)}>
          <div className="flex items-center gap-2">
            <div className="relative">
              <div className={cn("rounded-full", config.color, sizeConfig[size].indicator)} />
              <div className={cn("absolute -bottom-0.5 -right-0.5 rounded-full bg-white", 
                size === "sm" ? "h-1.5 w-1.5" : size === "md" ? "h-2 w-2" : "h-2.5 w-2.5"
              )}>
                <Icon className={cn("h-full w-full", config.textColor)} />
              </div>
            </div>
            {showText && (
              <div className="flex flex-col items-start">
                <span className={cn("font-medium", config.textColor, sizeConfig[size].text)}>
                  {config.label}
                </span>
                {status.currentTask && (
                  <span className={cn("text-muted-foreground truncate max-w-32", sizeConfig[size].text)}>
                    {status.currentTask.issueKey || status.currentTask.title}
                  </span>
                )}
              </div>
            )}
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className={cn("rounded-full p-2", config.bgColor)}>
              <Icon className={cn("h-4 w-4", config.textColor)} />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold">{config.label}</h3>
              <p className="text-sm text-muted-foreground">
                For {getTimeSince(status.statusStartedAt)}
              </p>
            </div>
            <Badge variant="outline" className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {getTimeSince(status.statusStartedAt)}
            </Badge>
          </div>

          {status.currentTask && (
            <div className="p-3 bg-muted/30 rounded-md">
              <div className="flex items-center gap-2 mb-1">
                <Activity className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Current Task</span>
              </div>
              <p className="text-sm">{status.currentTask.title}</p>
              {status.currentTask.issueKey && (
                <Badge variant="outline" className="mt-1 text-xs">
                  {status.currentTask.issueKey}
                </Badge>
              )}
            </div>
          )}

          {status.statusText && (
            <div className="p-2 bg-muted/20 rounded text-sm text-muted-foreground">
              &quot;{status.statusText}&quot;
            </div>
          )}

          <div className="space-y-2">
            <h4 className="text-sm font-medium">Quick Actions</h4>
            <div className="grid grid-cols-2 gap-2">
              {QUICK_ACTIVITIES.map((activity) => (
                <Button
                  key={activity.type}
                  variant="outline"
                  size="sm"
                  onClick={() => startActivity(activity.type, activity.duration || undefined)}
                  disabled={isLoading}
                  className="justify-start text-xs"
                >
                  {activity.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={endActivity}
              disabled={isLoading || status.currentStatus === "AVAILABLE"}
              className="flex-1"
            >
              Set Available
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsOpen(false)}
              className="flex-1"
            >
              Close
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
} 