"use client";

import React from "react";
import { useWorkspaceLeaveRequests, useApproveLeaveRequest, useRejectLeaveRequest } from "@/hooks/queries/useLeave";
import { useWorkspacePermissions } from "@/hooks/use-workspace-permissions";
import { LeaveRequestsDashboardWidget } from "./LeaveRequestsDashboardWidget";

interface LeaveRequestsDashboardContainerProps {
  workspaceId: string;
}

export function LeaveRequestsDashboardContainer({ workspaceId }: LeaveRequestsDashboardContainerProps) {
  const { 
    canManageLeave,
    isLoading: permissionsLoading 
  } = useWorkspacePermissions();
  
  const {
    data: requests,
    isLoading: requestsLoading
  } = useWorkspaceLeaveRequests(workspaceId);

  const approveMutation = useApproveLeaveRequest(workspaceId);
  const rejectMutation = useRejectLeaveRequest(workspaceId);

  const handleApprove = async (requestId: string): Promise<void> => {
    if (!canManageLeave) return;
    await approveMutation.mutateAsync({ requestId });
  };

  const handleReject = async (requestId: string): Promise<void> => {
    if (!canManageLeave) return;
    await rejectMutation.mutateAsync({ requestId });
  };

  // Don't render anything if user doesn't have leave management permissions
  if (permissionsLoading || !canManageLeave) {
    return null; // Or a loading skeleton if preferred
  }

  return (
    <LeaveRequestsDashboardWidget
      workspaceId={workspaceId}
      requests={requests}
      isLoading={requestsLoading}
      onApprove={handleApprove}
      onReject={handleReject}
    />
  );
}