"use client";

import React, { useState } from "react";
import Link from "next/link";
import { 
  Calendar, 
  Clock, 
  CheckCircle, 
  XCircle, 
  ArrowRight,
  AlertCircle,
  Loader2
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { format, differenceInDays, isToday, isFuture } from "date-fns";
import { LeaveRequestWithUser, LeaveStatus, LeaveDuration } from "@/types/leave";

interface LeaveRequestsDashboardWidgetProps {
  workspaceId: string;
  requests?: LeaveRequestWithUser[];
  isLoading?: boolean;
  onApprove?: (requestId: string) => Promise<void>;
  onReject?: (requestId: string) => Promise<void>;
}

export function LeaveRequestsDashboardWidget({
  workspaceId,
  requests = [],
  isLoading = false,
  onApprove,
  onReject,
}: LeaveRequestsDashboardWidgetProps) {
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<LeaveRequestWithUser | null>(null);
  const [actionType, setActionType] = useState<"approve" | "reject" | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filter to show only pending requests and limit to recent ones for dashboard
  const pendingRequests = requests
    .filter(req => req.status === "PENDING")
    .slice(0, 5); // Show max 5 requests in dashboard widget

  const formatDateRange = (startDate: Date, endDate: Date) => {
    const start = format(startDate, "MMM d");
    const end = format(endDate, "MMM d");
    return start === end ? start : `${start} - ${end}`;
  };

  const getDaysCount = (startDate: Date, endDate: Date, duration: LeaveDuration) => {
    const daysDiff = differenceInDays(endDate, startDate) + 1;
    return duration === "HALF_DAY" ? daysDiff * 0.5 : daysDiff;
  };

  const getRequestPriority = (request: LeaveRequestWithUser) => {
    const startDate = new Date(request.startDate);
    const today = new Date();
    const daysUntilStart = differenceInDays(startDate, today);
    
    if (daysUntilStart < 0) return "overdue";
    if (daysUntilStart <= 3) return "urgent";
    if (daysUntilStart <= 7) return "high";
    return "normal";
  };

  const handleQuickAction = async (type: "approve" | "reject", request: LeaveRequestWithUser) => {
    setSelectedRequest(request);
    setActionType(type);
    setActionDialogOpen(true);
  };

  const confirmAction = async () => {
    if (!selectedRequest || !actionType) return;

    setIsSubmitting(true);
    try {
      if (actionType === "approve" && onApprove) {
        await onApprove(selectedRequest.id);
        toast({
          title: "Request Approved",
          description: `Leave request for ${selectedRequest.user.name} has been approved.`,
        });
      } else if (actionType === "reject" && onReject) {
        await onReject(selectedRequest.id);
        toast({
          title: "Request Rejected",
          description: `Leave request for ${selectedRequest.user.name} has been rejected.`,
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update leave request. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
      setActionDialogOpen(false);
      setSelectedRequest(null);
      setActionType(null);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <Clock className="h-4 w-4 sm:h-5 sm:w-5" />
            <span className="hidden sm:inline">Pending Leave Requests</span>
            <span className="sm:hidden">Leave Requests</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Loading leave requests...</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const totalPendingRequests = requests.filter(req => req.status === "PENDING").length;
  const urgentRequests = pendingRequests.filter(req => getRequestPriority(req) === "urgent").length;

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-0">
            <div className="flex flex-col gap-2 sm:gap-0">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <Clock className="h-4 w-4 sm:h-5 sm:w-5" />
                <span className="hidden sm:inline">Leave Request Management</span>
                <span className="sm:hidden">Leave Requests</span>
              </CardTitle>
              <div className="flex flex-wrap gap-1 sm:hidden">
                {totalPendingRequests > 0 && (
                  <Badge variant="outline" className="text-xs">
                    {totalPendingRequests} pending
                  </Badge>
                )}
                {urgentRequests > 0 && (
                  <Badge variant="destructive" className="text-xs">
                    {urgentRequests} urgent
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link href={`/${workspaceId}/leave-management`}>
                <Button variant="ghost" size="sm" className="text-xs sm:text-sm">
                  <span className="hidden sm:inline">Manage All</span>
                  <span className="sm:hidden">View All</span>
                  <ArrowRight className="h-3 w-3 sm:h-4 sm:w-4 ml-1" />
                </Button>
              </Link>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {totalPendingRequests === 0 ? (
            <div className="text-center py-6 sm:py-8 text-muted-foreground">
              <CheckCircle className="h-8 w-8 sm:h-12 sm:w-12 mx-auto mb-3 text-green-500/60" />
              <p className="text-sm font-medium">All caught up!</p>
              <p className="text-xs text-muted-foreground">No pending leave requests</p>
            </div>
          ) : (
            <>
              {/* Summary section */}
              <div className="grid grid-cols-3 gap-4 mb-4 p-3 bg-muted/50 rounded-lg">
                <div className="text-center">
                  <p className="text-2xl font-bold text-yellow-600">{totalPendingRequests}</p>
                  <p className="text-xs text-muted-foreground">Pending</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-red-600">{urgentRequests}</p>
                  <p className="text-xs text-muted-foreground">Urgent</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-blue-600">{requests.filter(req => req.status === "APPROVED").length}</p>
                  <p className="text-xs text-muted-foreground">Recent Approved</p>
                </div>
              </div>
              
              {/* Recent requests list */}
              <div className="space-y-3">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between mb-3">
                  <h4 className="font-medium text-sm text-foreground">Recent Requests</h4>
                  {totalPendingRequests > 5 && (
                    <span className="text-xs text-muted-foreground">Showing 5 of {totalPendingRequests}</span>
                  )}
                </div>
                
                {pendingRequests.map((request) => {
                const priority = getRequestPriority(request);
                const daysCount = getDaysCount(
                  new Date(request.startDate), 
                  new Date(request.endDate), 
                  request.duration
                );
                
                return (
                  <div 
                    key={request.id} 
                    className={`flex flex-col sm:flex-row sm:items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors ${
                      priority === "urgent" ? "border-red-500/20 bg-red-500/10" : "border-border"
                    }`}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <Avatar className="h-8 w-8 flex-shrink-0">
                        <AvatarImage src={request.user.avatar || request.user.image || ""} />
                        <AvatarFallback className="text-xs">
                          {request.user.name?.charAt(0)?.toUpperCase() || 
                           request.user.email?.charAt(0)?.toUpperCase() || "?"}
                        </AvatarFallback>
                      </Avatar>
                      
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm truncate">
                            {request.user.name || "Unknown"}
                          </p>
                          {priority === "urgent" && (
                            <AlertCircle className="h-3 w-3 text-red-500 flex-shrink-0" />
                          )}
                        </div>
                        
                        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            <span>{formatDateRange(new Date(request.startDate), new Date(request.endDate))}</span>
                          </div>
                          <span className="hidden sm:inline">•</span>
                          <span>{daysCount} {daysCount === 1 ? "day" : "days"}</span>
                          <span className="hidden sm:inline">•</span>
                          <span className="truncate">{request.policy?.name}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 sm:ml-3">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleQuickAction("approve", request)}
                        className="h-8 px-3 text-green-600 border-green-500/20 hover:bg-green-500/10 hover:text-green-700 flex-1 sm:flex-none"
                        title="Quick approve"
                      >
                        <CheckCircle className="h-3 w-3 mr-1 sm:mr-0" />
                        <span className="sm:hidden">Approve</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleQuickAction("reject", request)}
                        className="h-8 px-3 text-red-600 border-red-500/20 hover:bg-red-500/10 hover:text-red-700 flex-1 sm:flex-none"
                        title="Quick reject"
                      >
                        <XCircle className="h-3 w-3 mr-1 sm:mr-0" />
                        <span className="sm:hidden">Reject</span>
                      </Button>
                    </div>
                  </div>
                );
              })}
              
              {totalPendingRequests > 5 && (
                <div className="text-center pt-2 border-t">
                  <Link href={`/${workspaceId}/leave-management`}>
                    <Button variant="ghost" size="sm" className="text-blue-600 hover:text-blue-700 text-xs sm:text-sm w-full sm:w-auto">
                      <span className="hidden sm:inline">View {totalPendingRequests - 5} more requests</span>
                      <span className="sm:hidden">View {totalPendingRequests - 5} more</span>
                      <ArrowRight className="h-3 w-3 sm:h-4 sm:w-4 ml-1" />
                    </Button>
                  </Link>
                </div>
              )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Quick Action Confirmation Dialog */}
      <AlertDialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {actionType === "approve" ? "Approve" : "Reject"} Leave Request
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to {actionType} this leave request for{" "}
              <strong>{selectedRequest?.user.name}</strong>?
              <br />
              <span className="text-sm mt-2 block">
                <strong>Dates:</strong> {selectedRequest && formatDateRange(
                  new Date(selectedRequest.startDate), 
                  new Date(selectedRequest.endDate)
                )}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmAction}
              disabled={isSubmitting}
              className={actionType === "approve" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}
            >
              {isSubmitting ? "Processing..." : actionType === "approve" ? "Approve" : "Reject"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}