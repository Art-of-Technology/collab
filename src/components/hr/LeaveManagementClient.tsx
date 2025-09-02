"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  useApproveLeaveRequest,
  useRejectLeaveRequest,
  usePaginatedWorkspaceLeaveRequests,
  useWorkspaceLeaveRequestsSummary,
} from "@/hooks/queries/useLeave";
import { LeaveRequestsManager } from "@/components/hr/LeaveRequestsManager";
import { Button } from "@/components/ui/button";
import { Calendar, Settings } from "lucide-react";
import PageHeader from "../layout/PageHeader";

interface LeaveManagementClientProps {
  workspaceId: string;
}

export default function LeaveManagementClient({ workspaceId }: LeaveManagementClientProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const pageSize = 10;

  // Use the paginated hook and summary hook
  const { data: paginatedData, isLoading } = usePaginatedWorkspaceLeaveRequests(workspaceId, {
    page: currentPage,
    pageSize,
    status: statusFilter === "all" ? undefined : (statusFilter.toUpperCase() as "PENDING" | "APPROVED" | "REJECTED"),
  });

  const { data: summaryData, isLoading: isLoadingSummary } = useWorkspaceLeaveRequestsSummary(workspaceId);

  const approveMutation = useApproveLeaveRequest(workspaceId);
  const rejectMutation = useRejectLeaveRequest(workspaceId);

  const handleApprove = async (requestId: string, notes?: string): Promise<void> => {
    await approveMutation.mutateAsync({ requestId, notes });
  };

  const handleReject = async (requestId: string, notes?: string): Promise<void> => {
    await rejectMutation.mutateAsync({ requestId, notes });
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleStatusFilterChange = (status: "all" | "pending" | "approved" | "rejected") => {
    setStatusFilter(status);
    setCurrentPage(1); // Reset to first page when changing filters
  };

  return (
    <div className="mx-auto">
      <PageHeader 
        title="Leave Management" 
        subtitle="Review and manage leave requests from your team members." 
        icon={Calendar} 
        actions={
          <Link href={`/${workspaceId}/leave-management/policies`}>
            <Button variant="outline" className="h-6 px-1 md:px-3 text-xs flex items-center justify-center border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10">
              <Settings className="h-4 w-4 md:mr-2" />
              <span data-text className="hidden md:inline ml-1">
                Manage Policies
              </span>
            </Button>
          </Link>} 
        />

      <div className="max-w-7xl mx-auto p-4 sm:p-6">
        <LeaveRequestsManager
          data={paginatedData}
          summaryData={summaryData}
          isLoading={isLoading || isLoadingSummary}
          onApprove={handleApprove}
          onReject={handleReject}
          onPageChange={handlePageChange}
          onStatusFilterChange={handleStatusFilterChange}
          currentStatusFilter={statusFilter}
        />
      </div>
    </div>
  );
}
