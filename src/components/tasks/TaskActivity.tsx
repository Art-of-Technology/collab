"use client";

import { useState, useCallback, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow, format } from "date-fns";
import { Loader2, History } from "lucide-react";
import { CustomAvatar } from "@/components/ui/custom-avatar";
import { useToast } from "@/hooks/use-toast";
import type { TaskActivity as TaskActivityType } from "@/types/task";

interface TaskActivityProps {
  taskId: string;
}

export function TaskActivity({ 
  taskId
}: TaskActivityProps) {
  const [taskActivities, setTaskActivities] = useState<TaskActivityType[]>([]);
  const [isLoadingActivities, setIsLoadingActivities] = useState(false);
  const { toast } = useToast();

  const fetchTaskActivities = useCallback(async () => {
    if (!taskId) return;
    setIsLoadingActivities(true);
    try {
      const response = await fetch(`/api/tasks/${taskId}/activities`);
      if (!response.ok) {
        throw new Error("Failed to fetch task activities");
      }
      const data: TaskActivityType[] = await response.json();
      setTaskActivities(data);
    } catch (err) {
      console.error("Error fetching task activities:", err);
      toast({
        title: "Error",
        description: "Could not load task activities.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingActivities(false);
    }
  }, [taskId, toast]);

  useEffect(() => {
    if (taskId) {
      fetchTaskActivities();
    }
  }, [taskId, fetchTaskActivities]);

  const renderActivityItem = (activity: TaskActivityType) => {
    let actionText = activity.action.replace("TASK_", "").replace(/_/g, " ").toLowerCase();
    if (actionText.startsWith("play ")) actionText = actionText.substring(5);
    else if (actionText === "commented on") actionText = "commented on"; // Keep specific phrases
    else actionText = actionText.replace("play", "timer"); // Generalize "play" to "timer"

    const activityTime = formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true });

    // Parse activity details for time adjustments
    let activityDetails = null;
    try {
      if (activity.details) {
        activityDetails = JSON.parse(activity.details);
      }
    } catch {
      // Ignore JSON parse errors
    }

    // Handle time adjustment display
    if (activity.action === "TIME_ADJUSTED" && activityDetails) {
      actionText = `adjusted time from ${activityDetails.originalFormatted} to ${activityDetails.newFormatted}`;
      if (activityDetails.reason) {
        actionText += ` (${activityDetails.reason})`;
      }
    }

    // Handle session edit display
    if (activity.action === "SESSION_EDITED" && activityDetails) {
      actionText = "edited a work session for";
    }

    return (
      <div key={activity.id} className="group flex items-start space-x-3 py-3 border-b border-border/30 last:border-b-0 hover:bg-muted/20 px-2 rounded">
        <CustomAvatar user={activity.user} size="sm" />
        <div className="text-sm flex-1">
          <p>
            <span className="font-semibold">{activity.user.name || "Unknown User"}</span>
            <span className="text-muted-foreground"> {actionText} this task</span>
          </p>
          <p className="text-xs text-muted-foreground/80">{activityTime}</p>
          
          {/* Show detailed changes for session edits */}
          {activity.action === "SESSION_EDITED" && activityDetails?.oldValue && activityDetails?.newValue && (
            <div className="mt-2 p-3 bg-muted/50 rounded-md text-xs border border-border/30">
              <div className="font-medium mb-2 text-foreground">Session Changes:</div>
              {(() => {
                try {
                  const oldData = JSON.parse(activityDetails.oldValue);
                  const newData = JSON.parse(activityDetails.newValue);
                  const changes = activityDetails.changes;
                  
                  return (
                    <div className="space-y-2">
                      {changes?.startTimeChanged && (
                        <div>
                          <div className="text-muted-foreground font-medium">Start Time:</div>
                          <div className="text-muted-foreground line-through">
                            {format(new Date(oldData.startTime), "MMM d, yyyy HH:mm")}
                          </div>
                          <div className="text-foreground">
                            {format(new Date(newData.startTime), "MMM d, yyyy HH:mm")}
                          </div>
                        </div>
                      )}
                      
                      {changes?.endTimeChanged && (
                        <div>
                          <div className="text-muted-foreground font-medium">End Time:</div>
                          <div className="text-muted-foreground line-through">
                            {format(new Date(oldData.endTime), "MMM d, yyyy HH:mm")}
                          </div>
                          <div className="text-foreground">
                            {format(new Date(newData.endTime), "MMM d, yyyy HH:mm")}
                          </div>
                        </div>
                      )}
                      
                      <div>
                        <div className="text-muted-foreground font-medium">Duration:</div>
                        <div className="text-muted-foreground line-through">
                          {oldData.duration}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-foreground">{newData.duration}</span>
                          {changes?.durationChange && (
                            <Badge 
                              variant={changes.durationChange.isIncrease ? "default" : "secondary"}
                              className="text-xs"
                            >
                              {changes.durationChange.formatted}
                            </Badge>
                          )}
                        </div>
                      </div>
                      
                      {activityDetails.reason && (
                        <div className="pt-1 border-t border-border/30">
                          <div className="text-muted-foreground font-medium">Reason:</div>
                          <div className="text-foreground italic">
                            &quot;{activityDetails.reason}&quot;
                          </div>
                        </div>
                      )}
                    </div>
                  );
                } catch {
                  return (
                    <div className="text-muted-foreground">
                      Unable to display change details
                    </div>
                  );
                }
              })()}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <Card className="overflow-hidden border-border/50 transition-all hover:shadow-md">
      <CardHeader className="py-3 bg-muted/30 border-b flex flex-row items-center gap-2">
        <History className="h-4 w-4 text-muted-foreground" />
        <CardTitle className="text-md">Activity</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {isLoadingActivities ? (
          <div className="p-6 text-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin inline mr-2" />
            Loading activities...
          </div>
        ) : taskActivities.length > 0 ? (
          <div className="divide-y divide-border/30 px-2">
            {taskActivities.map(renderActivityItem)}
          </div>
        ) : (
          <div className="p-6 text-center text-muted-foreground italic">
            No activities recorded for this task yet.
          </div>
        )}
      </CardContent>
    </Card>
  );
} 