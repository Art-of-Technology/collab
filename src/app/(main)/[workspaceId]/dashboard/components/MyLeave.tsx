"use client";

import React, { useState } from "react";
import { format } from "date-fns";
import { PlaneTakeoff, Plus } from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";
import {
  LeaveRequestForm,
  type LeaveRequestSubmissionData,
} from "@/components/hr/forms/LeaveRequestForm";
import {
  LeaveBalance,
  type LeaveBalanceType,
} from "@/components/hr/LeaveBalance";

export interface LeaveRequest {
  id: string;
  type: "holiday" | "sick" | "other";
  startDate: Date;
  endDate: Date;
  duration: "FULL_DAY" | "HALF_DAY";
  notes?: string;
  status: "pending" | "approved" | "rejected";
  createdAt: Date;
}

interface MyLeaveProps {
  activeRequests?: LeaveRequest[];
  leaveBalances?: LeaveBalanceType[];
  isLoadingBalances?: boolean;
  onSubmitRequest?: (data: LeaveRequestSubmissionData) => Promise<void>;
  isFeatureEnabled?: boolean;
}

export function MyLeave({
  activeRequests = [],
  leaveBalances = [],
  isLoadingBalances = false,
  onSubmitRequest,
  isFeatureEnabled = false,
}: MyLeaveProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (data: LeaveRequestSubmissionData) => {
    setIsSubmitting(true);
    try {
      if (onSubmitRequest) {
        await onSubmitRequest(data);
        toast({
          title: "Leave request submitted",
          description: "Your leave request has been submitted for approval.",
        });
        setIsDialogOpen(false);
      } else {
        // Fallback for demo purposes
        toast({
          title: "Leave request submitted",
          description: "Your leave request has been submitted for approval.",
        });
        setIsDialogOpen(false);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to submit leave request. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setIsDialogOpen(false);
  };

  const getLeaveTypeLabel = (type: string) => {
    switch (type) {
      case "holiday":
        return "Holiday";
      case "sick":
        return "Sick Leave";
      case "other":
        return "Other";
      default:
        return type;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return (
          <Badge
            variant="secondary"
            className="bg-green-500/10 hover:bg-green-500/20 text-green-600 transition-colors"
          >
            Approved
          </Badge>
        );
      case "rejected":
        return (
          <Badge
            variant="secondary"
            className="bg-red-500/10 hover:bg-red-500/20 text-red-600 transition-colors"
          >
            Rejected
          </Badge>
        );
      case "pending":
      default:
        return (
          <Badge
            variant="secondary"
            className="bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-600 transition-colors"
          >
            Pending
          </Badge>
        );
    }
  };

  return (
    <Card
      className={`h-full relative ${!isFeatureEnabled ? "opacity-80" : ""}`}
    >
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
              disabled={!isFeatureEnabled}
            >
              <Plus className="h-4 w-4" />
              Request Leave
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Request Leave</DialogTitle>
            </DialogHeader>

            <LeaveRequestForm
              onSubmit={handleSubmit}
              onCancel={handleCancel}
              isSubmitting={isSubmitting}
            />
          </DialogContent>
        </Dialog>
      </CardHeader>

      <CardContent>
        {!isFeatureEnabled ? (
          <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
            <div className="flex items-center justify-between">
              <p className="text-sm text-blue-700">
                Leave management is coming soon
              </p>
              <div className="px-2 py-1 bg-blue-500/20 text-blue-700 text-xs rounded-full">
                Coming Soon
              </div>
            </div>
          </div>
        ) : (
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
              {activeRequests.length > 0 ? (
                <div className="space-y-3">
                  {activeRequests.map((request) => (
                    <div
                      key={request.id}
                      className="flex items-center justify-between p-3 rounded-lg border bg-muted/50"
                    >
                      <div className="flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">
                            {getLeaveTypeLabel(request.type)}
                          </span>
                          {getStatusBadge(request.status)}
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">
                          {request.startDate.getTime() ===
                          request.endDate.getTime() ? (
                            // Single day request
                            <>
                              {format(request.startDate, "MMM dd, yyyy")}
                              {request.duration === "HALF_DAY" && " (Half Day)"}
                            </>
                          ) : (
                            // Multi-day request
                            <>
                              {format(request.startDate, "MMM dd")} -{" "}
                              {format(request.endDate, "MMM dd, yyyy")}
                              {request.startDate.getTime() === request.endDate.getTime() && request.duration === "HALF_DAY" && " (Half Day)"}
                            </>
                          )}
                        </div>
                        {request.notes && (
                          <div className="text-sm text-muted-foreground mt-1 truncate">
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
        )}

        {/* Coming Soon State for Non-Feature Enabled */}
        {!isFeatureEnabled && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <PlaneTakeoff className="h-12 w-12 mb-3 text-muted-foreground/50" />
            <p className="text-muted-foreground">Leave Management</p>
            <p className="text-sm text-muted-foreground mt-1">
              This feature will be available soon
            </p>
            <div className="mt-3 px-3 py-1 bg-blue-500/10 text-blue-600 text-xs rounded-full">
              Coming Soon
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
