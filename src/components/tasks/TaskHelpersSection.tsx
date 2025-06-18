/* eslint-disable */
"use client";

import React, { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Users, Check, X, Clock, UserPlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

interface TaskHelper {
  id: string;
  userId: string;
  role: "ASSIGNEE" | "HELPER";
  status: "PENDING" | "APPROVED" | "REJECTED";
  assignedAt: string;
  approvedAt?: string;
  totalTimeWorked: number;
  user: {
    id: string;
    name: string | null;
    image: string | null;
  };
}

interface TaskHelpersSectionProps {
  taskId: string;
  assigneeId?: string | null;
  reporterId: string;
  currentUserId?: string;
  onRefresh?: () => void;
}

export function TaskHelpersSection({ taskId, assigneeId, reporterId, currentUserId, onRefresh }: TaskHelpersSectionProps) {
  const { data: session } = useSession();
  const { toast } = useToast();
  const [helpers, setHelpers] = useState<TaskHelper[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [requestingHelp, setRequestingHelp] = useState(false);

  const userId = currentUserId || session?.user?.id;
  const canApproveHelpers = userId === assigneeId || userId === reporterId;
  const isAlreadyAssigned = userId === assigneeId;
  const hasExistingRequest = helpers.some((h) => h.userId === userId);

  // Fetch helpers for this task
  const fetchHelpers = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/tasks/${taskId}/helpers`);
      if (response.ok) {
        const data = await response.json();
        setHelpers(data.helpers || []);
      }
    } catch (error) {
      console.error("Error fetching helpers:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHelpers();
  }, [taskId]);

  // Request help on this task
  const requestHelp = async () => {
    setRequestingHelp(true);
    try {
      const response = await fetch(`/api/tasks/${taskId}/request-help`, {
        method: "POST",
      });

      if (response.ok) {
        toast({
          title: "Help Requested",
          description: "Your help request has been sent to the task assignee and reporter.",
        });
        fetchHelpers(); // Refresh the list
        onRefresh?.();
      } else {
        const error = await response.json();
        throw new Error(error.message || "Failed to request help");
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to request help",
        variant: "destructive",
      });
    } finally {
      setRequestingHelp(false);
    }
  };

  // Approve or reject a help request
  const handleHelpRequest = async (helperId: string, action: "approve" | "reject") => {
    setActionLoading(helperId);
    try {
      const response = await fetch(`/api/tasks/${taskId}/approve-help`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ helperId, action }),
      });

      if (response.ok) {
        toast({
          title: `Help Request ${action === "approve" ? "Approved" : "Rejected"}`,
          description: `The help request has been ${action}d.`,
        });
        fetchHelpers(); // Refresh the list
        onRefresh?.();
      } else {
        const error = await response.json();
        throw new Error(error.message || `Failed to ${action} help request`);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : `Failed to ${action} help request`,
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  // Format time worked
  const formatTimeWorked = (milliseconds: number) => {
    if (milliseconds === 0) return "No time logged";

    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  // Filter helpers to show only those with help requests or approved helpers
  const pendingHelpers = helpers.filter((h) => h.role === "HELPER" && h.status === "PENDING");
  const approvedHelpers = helpers.filter((h) => h.role === "HELPER" && h.status === "APPROVED");
  const hasHelpRequests = pendingHelpers.length > 0 || approvedHelpers.length > 0;

  return (
    <Card className="overflow-hidden border-border/50 transition-all hover:shadow-md">
      <CardHeader className="py-3 bg-muted/30 border-b">
        <CardTitle className="text-md flex items-center gap-2">
          <Users className="h-4 w-4" />
          Helpers
          {pendingHelpers.length > 0 && (
            <Badge variant="secondary" className="ml-auto">
              {pendingHelpers.length} pending
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Loading helpers...</span>
          </div>
        )}

        {/* Content when not loading */}
        {!loading && (
          <>
            {/* Pending Help Requests (only visible to assignee/reporter) */}
            {canApproveHelpers && pendingHelpers.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground">Pending Requests</h4>
                {pendingHelpers.map((helper) => (
                  <div key={helper.id} className="flex items-center justify-between p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={helper.user.image || undefined} alt={helper.user.name || ""} />
                        <AvatarFallback>{helper.user.name?.substring(0, 2) || "?"}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">{helper.user.name}</p>
                        <p className="text-xs text-muted-foreground">Requested {new Date(helper.assignedAt).toLocaleDateString()}</p>
                      </div>
                      <Badge variant="outline" className="ml-2">
                        <Clock className="h-3 w-3 mr-1" />
                        Pending
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleHelpRequest(helper.userId, "reject")}
                        disabled={actionLoading === helper.userId}
                        className="h-8 w-8 p-0"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleHelpRequest(helper.userId, "approve")}
                        disabled={actionLoading === helper.userId}
                        className="h-8 w-8 p-0"
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Approved Helpers */}
            {approvedHelpers.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground">Active Helpers</h4>
                {approvedHelpers.map((helper) => (
                  <div key={helper.id} className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-950/20 rounded-lg border">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={helper.user.image || undefined} alt={helper.user.name || ""} />
                        <AvatarFallback>{helper.user.name?.substring(0, 2) || "?"}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">{helper.user.name}</p>
                        <p className="text-xs text-muted-foreground">{formatTimeWorked(helper.totalTimeWorked)}</p>
                      </div>
                      <Badge variant="default" className="ml-2 bg-green-600">
                        <Check className="h-3 w-3 mr-1" />
                        Active
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Request Help Button */}
            {!isAlreadyAssigned && !hasExistingRequest && (
              <div className="pt-2 border-t">
                <Button variant="outline" onClick={requestHelp} disabled={requestingHelp} className="w-full">
                  <UserPlus className="h-4 w-4 mr-2" />
                  {requestingHelp ? "Requesting..." : "Request to Help"}
                </Button>
              </div>
            )}

            {/* Status Messages */}
            {hasExistingRequest && !isAlreadyAssigned && (
              <div className="pt-2 border-t">
                <p className="text-sm text-muted-foreground text-center">You have already requested to help with this task.</p>
              </div>
            )}

            {/* No Helpers Message */}
            {!hasHelpRequests && !canApproveHelpers && !hasExistingRequest && !isAlreadyAssigned && (
              <div className="text-center py-8">
                <Users className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-sm text-muted-foreground font-medium mb-1">No helpers assigned</p>
                <p className="text-xs text-muted-foreground">This task doesn't have any helpers working on it yet.</p>
              </div>
            )}

            {/* No Helpers but can request */}
            {!hasHelpRequests && !isAlreadyAssigned && !hasExistingRequest && (
              <div className="text-center py-6">
                <Users className="h-10 w-10 mx-auto text-muted-foreground/50 mb-2" />
                <p className="text-sm text-muted-foreground mb-3">No helpers are currently working on this task.</p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
