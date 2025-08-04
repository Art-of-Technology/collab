"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import {
  getLeavePolicies,
  createLeaveRequest,
  getUserLeaveRequests,
} from "@/actions/leave";

// Function to fetch leave balances
async function getUserLeaveBalances(
  workspaceId: string,
  year?: number
): Promise<any[]> {
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

// Define query keys
export const leaveKeys = {
  all: ["leave"] as const,
  policies: (workspaceId: string) =>
    [...leaveKeys.all, "policies", workspaceId] as const,
  requests: (workspaceId: string) =>
    [...leaveKeys.all, "requests", workspaceId] as const,
  userRequests: (workspaceId: string, userId?: string) =>
    [...leaveKeys.requests(workspaceId), "user", userId] as const,
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
      if (
        error.message.includes("Unauthorized") ||
        error.message.includes("401")
      ) {
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
      if (
        error.message.includes("Unauthorized") ||
        error.message.includes("401")
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
      // Also invalidate balances since they might be affected
      queryClient.invalidateQueries({
        queryKey: leaveKeys.balances(workspaceId),
      });
    },
  });
};
