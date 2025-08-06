"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import {
  getLeavePolicies,
  createLeaveRequest,
  getUserLeaveRequests,
  approveLeaveRequest,
  rejectLeaveRequest,
} from "@/actions/leave";
import { LeaveBalanceType } from "@/types/leave";

const isUnauthorizedError = (error: Error) => {
  return (
    error.message.includes("Unauthorized") || error.message.includes("401")
  );
};

// Function to fetch leave balances
async function getUserLeaveBalances(
  workspaceId: string,
  year?: number
): Promise<LeaveBalanceType[]> {
  const currentYear = year || new Date().getFullYear();

  const response = await fetch(
    `/api/leave/balances?workspaceId=${workspaceId}&year=${currentYear}`,
    {
      credentials: "include", // Include cookies for authentication
      headers: {
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to fetch leave balances: ${response.status} - ${errorText}`
    );
  }

  const data = await response.json();
  return data;
}

async function editLeaveRequestClient(
  requestId: string,
  data: {
    policyId?: string;
    startDate?: Date;
    endDate?: Date;
    duration?: "FULL_DAY" | "HALF_DAY";
    notes?: string;
  }
) {
  const response = await fetch(`/api/leave/requests/${requestId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({
      ...data,
      startDate: data.startDate?.toISOString(),
      endDate: data.endDate?.toISOString(),
    }),
  });

  if (!response.ok) {
    const errorData = await response
      .json()
      .catch(() => ({ error: "Unknown error" }));
    throw new Error(
      errorData.error || `Failed to edit leave request: ${response.status}`
    );
  }

  return response.json();
}

async function cancelLeaveRequestClient(requestId: string) {
  const response = await fetch(`/api/leave/requests/${requestId}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
  });

  if (!response.ok) {
    const errorData = await response
      .json()
      .catch(() => ({ error: "Unknown error" }));
    throw new Error(
      errorData.error || `Failed to cancel leave request: ${response.status}`
    );
  }

  return response.json();
}
// Define query keys
export const leaveKeys = {
  all: ["leave"] as const,
  policies: (workspaceId: string) =>
    [...leaveKeys.all, "policies", workspaceId] as const,
  requests: (workspaceId: string) =>
    [...leaveKeys.all, "requests", workspaceId] as const,
  userRequests: (workspaceId: string, userId?: string) =>
    [...leaveKeys.requests(workspaceId), "user", userId] as const,
  workspaceRequests: (workspaceId: string) =>
    [...leaveKeys.requests(workspaceId), "workspace"] as const,
  balances: (workspaceId: string) =>
    [...leaveKeys.all, "balances", workspaceId] as const,
  userBalances: (workspaceId: string, year?: number) =>
    [...leaveKeys.balances(workspaceId), "user", year] as const,
};

// Get leave policies hook
export const useLeavePolicies = (workspaceId: string) => {
  return useQuery({
    queryKey: leaveKeys.policies(workspaceId),
    queryFn: () => getLeavePolicies(workspaceId),
    enabled: !!workspaceId,
    staleTime: 5 * 60 * 1000, // 5 minutes - policies don't change often
  });
};

// Get user leave requests hook
export const useUserLeaveRequests = (workspaceId: string) => {
  const { data: session } = useSession();

  return useQuery({
    queryKey: leaveKeys.userRequests(workspaceId),
    queryFn: () => getUserLeaveRequests(workspaceId),
    enabled: !!session?.user?.id && !!workspaceId, // Only run query if user is authenticated and workspace is provided
    retry: (failureCount, error) => {
      // Don't retry on authorization errors
      if (isUnauthorizedError(error)) {
        return false;
      }
      return failureCount < 3;
    },
  });
};

// Get user leave balances hook
export const useLeaveBalances = (workspaceId: string, year?: number) => {
  const { data: session } = useSession();

  return useQuery({
    queryKey: leaveKeys.userBalances(workspaceId, year),
    queryFn: () => getUserLeaveBalances(workspaceId, year),
    enabled: !!session?.user?.id && !!workspaceId, // Only run query if user is authenticated and workspace is provided
    staleTime: 2 * 60 * 1000, // 2 minutes - balances change less frequently
    retry: (failureCount, error) => {
      // Don't retry on authorization errors
      if (isUnauthorizedError(error)) {
        return false;
      }
      return failureCount < 3;
    },
  });
};

// Get workspace leave requests hook (for managers)
export const useWorkspaceLeaveRequests = (workspaceId: string) => {
  const { data: session } = useSession();

  return useQuery({
    queryKey: leaveKeys.workspaceRequests(workspaceId),
    queryFn: async () => {
      if (!workspaceId) {
        throw new Error("Workspace ID is required");
      }

      const response = await fetch(
        `/api/leave/requests/workspace?workspaceId=${encodeURIComponent(
          workspaceId
        )}`,
        {
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: "Unknown error" }));
        throw new Error(
          errorData.error ||
            `HTTP ${response.status}: Failed to fetch leave requests`
        );
      }

      return response.json();
    },
    enabled: !!session?.user?.id && !!workspaceId,
    retry: (failureCount, error) => {
      // Don't retry on authorization errors
      if (
        error.message.includes("Unauthorized") ||
        error.message.includes("Insufficient permissions") ||
        error.message.includes("401") ||
        error.message.includes("403") ||
        error.message.includes("Workspace not found")
      ) {
        return false;
      }
      return failureCount < 3;
    },
  });
};

// Create leave request mutation
export const useCreateLeaveRequest = (workspaceId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createLeaveRequest,
    onSuccess: () => {
      // Invalidate user leave requests to refresh the list
      queryClient.invalidateQueries({
        queryKey: leaveKeys.userRequests(workspaceId),
      });
      queryClient.invalidateQueries({
        queryKey: leaveKeys.requests(workspaceId),
      });
      queryClient.invalidateQueries({
        queryKey: leaveKeys.workspaceRequests(workspaceId),
      });
      // Also invalidate balances since they might be affected
      queryClient.invalidateQueries({
        queryKey: leaveKeys.balances(workspaceId),
      });
    },
  });
};

// Approve leave request mutation
export const useApproveLeaveRequest = (workspaceId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ requestId, notes }: { requestId: string; notes?: string }) =>
      approveLeaveRequest(requestId, notes),
    onSuccess: () => {
      // Invalidate all leave-related queries to refresh the data
      queryClient.invalidateQueries({
        queryKey: leaveKeys.workspaceRequests(workspaceId),
      });
      queryClient.invalidateQueries({
        queryKey: leaveKeys.requests(workspaceId),
      });
      queryClient.invalidateQueries({
        queryKey: leaveKeys.balances(workspaceId),
      });
    },
  });
};

// Reject leave request mutation
export const useRejectLeaveRequest = (workspaceId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ requestId, notes }: { requestId: string; notes?: string }) =>
      rejectLeaveRequest(requestId, notes),
    onSuccess: () => {
      // Invalidate all leave-related queries to refresh the data
      queryClient.invalidateQueries({
        queryKey: leaveKeys.workspaceRequests(workspaceId),
      });
      queryClient.invalidateQueries({
        queryKey: leaveKeys.requests(workspaceId),
      });
      queryClient.invalidateQueries({
        queryKey: leaveKeys.balances(workspaceId),
      });
    },
  });
};

export const useEditLeaveRequest = (workspaceId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      requestId,
      data,
    }: {
      requestId: string;
      data: {
        policyId?: string;
        startDate?: Date;
        endDate?: Date;
        duration?: "FULL_DAY" | "HALF_DAY";
        notes?: string;
      };
    }) => editLeaveRequestClient(requestId, data),
    onSuccess: () => {
      // Invalidate all leave-related queries to refresh the data
      queryClient.invalidateQueries({
        queryKey: leaveKeys.userRequests(workspaceId),
      });
      queryClient.invalidateQueries({
        queryKey: leaveKeys.requests(workspaceId),
      });
      queryClient.invalidateQueries({
        queryKey: leaveKeys.workspaceRequests(workspaceId),
      });
      queryClient.invalidateQueries({
        queryKey: leaveKeys.balances(workspaceId),
      });
    },
  });
};

export const useCancelLeaveRequest = (workspaceId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ requestId }: { requestId: string }) =>
      cancelLeaveRequestClient(requestId),
    onSuccess: () => {
      // Invalidate all leave-related queries to refresh the data
      queryClient.invalidateQueries({
        queryKey: leaveKeys.userRequests(workspaceId),
      });
      queryClient.invalidateQueries({
        queryKey: leaveKeys.requests(workspaceId),
      });
      queryClient.invalidateQueries({
        queryKey: leaveKeys.workspaceRequests(workspaceId),
      });
      queryClient.invalidateQueries({
        queryKey: leaveKeys.balances(workspaceId),
      });
    },
  });
};
