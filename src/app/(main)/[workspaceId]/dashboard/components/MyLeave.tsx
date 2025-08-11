"use client";

import React, { useState } from "react";
import { format } from "date-fns";
import { PlaneTakeoff, Plus, Edit, X, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { LeaveRequestForm } from "@/components/hr/forms/LeaveRequestForm";
import { LeaveBalance } from "@/components/hr/LeaveBalance";
import { 
  useLeaveBalances, 
  useUserLeaveRequests, 
  useCreateLeaveRequest,
  useCancelLeaveRequest 
} from "@/hooks/queries/useLeave";
import type { LeaveRequest, LeaveRequestSubmissionData } from "@/types/leave";
import { LeaveRequestsDashboardContainer } from "@/components/hr/LeaveRequestsDashboardContainer";

interface MyLeaveProps {
  workspaceId: string;
}

export function MyLeave({
  workspaceId,
}: MyLeaveProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRequest, setEditingRequest] = useState<LeaveRequest | null>(null);
  const [cancellingRequest, setCancellingRequest] = useState<LeaveRequest | null>(null);
  const { toast } = useToast();

  // Fetch data using hooks
  const { 
    data: leaveBalances = [], 
    isLoading: isLoadingBalances 
  } = useLeaveBalances(workspaceId);
  
  const { 
    data: leaveRequests = [], 
    isLoading: isLoadingRequests 
  } = useUserLeaveRequests(workspaceId);
  
  const createLeaveRequestMutation = useCreateLeaveRequest(workspaceId);
  const cancelLeaveRequestMutation = useCancelLeaveRequest(workspaceId);

  const handleSubmit = async (data: LeaveRequestSubmissionData) => {
    try {
      await createLeaveRequestMutation.mutateAsync(data);
      toast({
        title: "Leave request submitted",
        description: "Your leave request has been submitted for approval.",
      });
      setIsDialogOpen(false);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to submit leave request. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleCancel = () => {
    setIsDialogOpen(false);
    setEditingRequest(null);
  };

  const handleEditRequest = (request: LeaveRequest) => {
    setEditingRequest(request);
    setIsDialogOpen(true);
  };

  const handleCancelRequest = async () => {
    if (!cancellingRequest) return;

    try {
      await cancelLeaveRequestMutation.mutateAsync({ requestId: cancellingRequest.id });
      toast({
        title: "Leave request cancelled",
        description: "Your leave request has been cancelled successfully.",
      });
      setCancellingRequest(null);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to cancel leave request. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleSuccess = () => {
    setIsDialogOpen(false);
    setEditingRequest(null);
    if (editingRequest) {
      toast({
        title: "Leave request updated",
        description: "Your leave request has been updated successfully.",
      });
    }
  };

  // Helper function to check if a request can be edited/cancelled
  const canEditOrCancel = (request: LeaveRequest) => {
    if (request.status !== "PENDING") return false;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startDate = new Date(request.startDate);
    startDate.setHours(0, 0, 0, 0);
    
    return startDate >= today;
  };

  const getStatusBadge = (status?: LeaveRequest["status"]) => {
    if (!status) return null;

    const statusColors = {
      'APPROVED': 'bg-green-500/10 text-green-600',
      'REJECTED': 'bg-red-500/10 text-red-600',
      'PENDING': 'bg-yellow-500/10 text-yellow-600',
      'CANCELED': 'bg-gray-500/10 text-gray-600',
    };

    const color = statusColors[status] || 'bg-gray-500/10 text-gray-600';

    return (
      <Badge variant="secondary" className={`${color} capitalize`}>
        {status}
      </Badge>
    );
  };

  return (
    <div>
      <Card className="h-full relative">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div className="flex items-center space-x-2">
            <PlaneTakeoff className="h-5 w-5 text-blue-600" />
            <CardTitle className="text-lg font-semibold">My Leave</CardTitle>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button 
                size="sm" 
                className="flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                Request Leave
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>
                  {editingRequest ? "Edit Leave Request" : "Request Leave"}
                </DialogTitle>
              </DialogHeader>

              <LeaveRequestForm
                workspaceId={workspaceId}
                onSubmit={editingRequest ? undefined : handleSubmit}
                onCancel={handleCancel}
                onSuccess={handleSuccess}
                editingRequest={editingRequest || undefined}
                isEditing={!!editingRequest}
              />
            </DialogContent>
          </Dialog>
        </CardHeader>

        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-6">
              {/* Left Column - Leave Balance */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground">
                  Available Balance
                </h3>
                  <LeaveBalance
                    balances={leaveBalances}
                    isLoading={isLoadingBalances}
                  />
              </div>

              {/* Right Column - Leave Requests */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground">
                  Recent Requests
                </h3>
                {isLoadingRequests ? (
                  <div className="text-sm text-muted-foreground">Loading requests...</div>
                ) : leaveRequests.length > 0 ? (
                  <div className="space-y-3">
                    {leaveRequests.map((request) => (
                      <div
                        key={request.id}
                        className="p-3 rounded-lg border bg-muted/50"
                      >
                        {/* Header with policy name, status, and actions */}
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              {request.policy?.name || "Unknown Policy"}
                            </span>
                            {getStatusBadge(request.status)}
                          </div>
                          
                          {/* Dropdown menu for actions */}
                          {canEditOrCancel(request) && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button 
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 text-muted-foreground bg-gray-500/10 hover:bg-gray-500/20"
                                  aria-label="Request Actions"
                                >
                                  <ChevronDown className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem 
                                  onClick={() => handleEditRequest(request)}
                                  className="text-muted-foreground"
                                  aria-label="Edit Request"
                                >
                                  <Edit className="h-4 w-4" />
                                  Edit Request
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => setCancellingRequest(request)}
                                  className="text-red-600"
                                  aria-label="Cancel Request"
                                >
                                  <X className="h-4 w-4" />
                                  Cancel Request
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                        
                        {/* Request details */}
                        <div className="space-y-1">
                          <div className="text-sm text-muted-foreground">
                            {request.startDate.getTime() ===
                            request.endDate.getTime() ? (
                              // Single day request
                              <>
                                {format(new Date(request.startDate), "MMM dd, yyyy")}
                                {request.duration === "HALF_DAY" && " (Half Day)"}
                              </>
                            ) : (
                              // Multi-day request
                              <>
                                {format(new Date(request.startDate), "MMM dd")} -{" "}
                                {format(new Date(request.endDate), "MMM dd, yyyy")}
                              </>
                            )}
                          </div>
                          {request.notes && (
                            <div className="text-sm text-muted-foreground truncate">
                              {request.notes}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <PlaneTakeoff className="h-12 w-12 mb-3 text-muted-foreground" />
                    <p className="text-muted-foreground">
                      No active leave requests
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Click "Request Leave" to submit a new request
                    </p>
                  </div>
                )}
              </div>
            </div>
        </CardContent>
      </Card>
      
      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={!!cancellingRequest} onOpenChange={() => setCancellingRequest(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Leave Request</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel this leave request?
              {cancellingRequest && (
                <>
                  <br />
                  <br />
                  <strong>Leave Type:</strong> {cancellingRequest.policy?.name}
                  <br />
                  <strong>Dates:</strong> {format(new Date(cancellingRequest.startDate), "MMM dd, yyyy")}
                  {cancellingRequest.startDate.getTime() !== cancellingRequest.endDate.getTime() && 
                    ` - ${format(new Date(cancellingRequest.endDate), "MMM dd, yyyy")}`}
                  <br />
                  <br />
                  This action cannot be undone. Any pre-deducted leave balance will be restored.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelLeaveRequestMutation.isPending}>
              Keep Request
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelRequest}
              disabled={cancelLeaveRequestMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {cancelLeaveRequestMutation.isPending ? "Cancelling..." : "Cancel Request"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

