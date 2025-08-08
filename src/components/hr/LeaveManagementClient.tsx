"use client";

import React from "react";
import Link from "next/link";
import { useApproveLeaveRequest, useRejectLeaveRequest } from "@/hooks/queries/useLeave";
import { LeaveRequestsManager } from "@/components/hr/LeaveRequestsManager";
import { LeaveRequestWithUser } from "@/types/leave";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, FileText } from "lucide-react";

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
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Leave Management</h1>
          <p className="text-gray-600 mt-2">
            Review and manage leave requests from your team members.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Link href={`/${workspaceId}/leave-management/policies`}>
            <Button variant="outline">
              <Settings className="h-4 w-4 mr-2" />
              Manage Policies
            </Button>
          </Link>
        </div>
      </div>

      <Tabs defaultValue="requests" className="space-y-4">
        <TabsList>
          <TabsTrigger value="requests">
            <FileText className="h-4 w-4 mr-2" />
            Leave Requests
          </TabsTrigger>
          <TabsTrigger value="policies" asChild>
            <Link href={`/${workspaceId}/leave-management/policies`}>
              <span className="flex items-center">
                <Settings className="h-4 w-4 mr-2" />
                Policies
              </span>
            </Link>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="requests">
          <LeaveRequestsManager
            requests={initialRequests}
            isLoading={false}
            onApprove={handleApprove}
            onReject={handleReject}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}