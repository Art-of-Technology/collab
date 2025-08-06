"use client";

import React from "react";
import { useApproveLeaveRequest, useRejectLeaveRequest } from "@/hooks/queries/useLeave";
import { LeaveRequestsManager } from "@/components/hr/LeaveRequestsManager";
import { LeaveRequestWithUser } from "@/types/leave";

interface LeaveManagementClientProps {
  workspaceId: string;
  initialRequests: LeaveRequestWithUser[];
}

export default function LeaveManagementClient({
  workspaceId,
  initialRequests,
}: LeaveManagementClientProps) {
  const approveMutation = useApproveLeaveRequest(workspaceId);
  const rejectMutation = useRejectLeaveRequest(workspaceId);

  const handleApprove = async (requestId: string, notes?: string): Promise<void> => {
    await approveMutation.mutateAsync({ requestId, notes });
  };

  const handleReject = async (requestId: string, notes?: string): Promise<void> => {
    await rejectMutation.mutateAsync({ requestId, notes });
  };

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Leave Management</h1>
        <p className="text-gray-600 mt-2">
          Review and manage leave requests from your team members.
        </p>
      </div>

      <LeaveRequestsManager
        requests={initialRequests}
        isLoading={false}
        onApprove={handleApprove}
        onReject={handleReject}
      />
    </div>
  );
}