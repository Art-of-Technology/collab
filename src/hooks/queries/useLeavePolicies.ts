import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

// Types for leave policy management
export interface LeavePolicyData {
  name: string;
  group: string | null;
  isPaid: boolean;
  trackIn: "HOURS" | "DAYS";
  isHidden: boolean;
  exportMode:
    | "DO_NOT_EXPORT"
    | "EXPORT_WITH_PAY_CONDITION"
    | "EXPORT_WITH_CODE";
  exportCode: string | null;
  accrualType: "DOES_NOT_ACCRUE" | "HOURLY" | "FIXED" | "REGULAR_WORKING_HOURS";
  deductsLeave: boolean;
  maxBalance: number | null;
  rolloverType: "ENTIRE_BALANCE" | "PARTIAL_BALANCE" | "NONE" | null;
  rolloverAmount: number | null;
  rolloverDate: string | null;
  allowOutsideLeaveYearRequest: boolean;
  useAverageWorkingHours: boolean;
  workspaceId: string;
}

export interface LeavePolicy extends LeavePolicyData {
  id: string;
  createdAt: string;
  updatedAt: string;
  _count?: {
    leaveRequests: number;
  };
}

export type UpdateLeavePolicyData = Partial<
  Omit<LeavePolicyData, "workspaceId">
>;

/**
 * Hook to fetch leave policies for a workspace
 */
export function useLeavePolicies(workspaceId: string, includeHidden = false) {
  return useQuery({
    queryKey: ["leave-policies", workspaceId, includeHidden],
    queryFn: async (): Promise<LeavePolicy[]> => {
      const response = await fetch(
        `/api/leave/policies?workspaceId=${workspaceId}&includeHidden=${includeHidden}`
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to fetch leave policies");
      }

      return response.json();
    },
    enabled: !!workspaceId,
  });
}

/**
 * Hook to fetch a specific leave policy
 */
export function useLeavePolicy(policyId: string) {
  return useQuery({
    queryKey: ["leave-policy", policyId],
    queryFn: async (): Promise<LeavePolicy> => {
      const response = await fetch(`/api/leave/policies/${policyId}`);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to fetch leave policy");
      }

      return response.json();
    },
    enabled: !!policyId,
  });
}

/**
 * Hook to create a new leave policy
 */
export function useCreateLeavePolicy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: LeavePolicyData): Promise<LeavePolicy> => {
      const response = await fetch("/api/leave/policies", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create leave policy");
      }

      return response.json();
    },
    onSuccess: (newPolicy) => {
      // Invalidate and refetch leave policies
      queryClient.invalidateQueries({
        queryKey: ["leave-policies", newPolicy.workspaceId],
      });

      toast.success("Leave policy created successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to create leave policy");
    },
  });
}

/**
 * Hook to update a leave policy
 */
export function useUpdateLeavePolicy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      policyId,
      data,
    }: {
      policyId: string;
      data: UpdateLeavePolicyData;
    }): Promise<LeavePolicy> => {
      const response = await fetch(`/api/leave/policies/${policyId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update leave policy");
      }

      return response.json();
    },
    onSuccess: (updatedPolicy) => {
      // Invalidate queries for the updated policy and policy list
      queryClient.invalidateQueries({
        queryKey: ["leave-policy", updatedPolicy.id],
      });
      queryClient.invalidateQueries({
        queryKey: ["leave-policies", updatedPolicy.workspaceId],
      });

      toast.success("Leave policy updated successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update leave policy");
    },
  });
}

/**
 * Hook to delete a leave policy
 */
export function useDeleteLeavePolicy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (policyId: string): Promise<void> => {
      const response = await fetch(`/api/leave/policies/${policyId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete leave policy");
      }
    },
    onSuccess: (_, policyId) => {
      // Invalidate policy list queries
      queryClient.invalidateQueries({
        queryKey: ["leave-policies"],
      });

      // Remove the specific policy from cache
      queryClient.removeQueries({
        queryKey: ["leave-policy", policyId],
      });

      toast.success("Leave policy deleted successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to delete leave policy");
    },
  });
}

/**
 * Hook to check if a policy can be deleted (no pending/approved requests)
 */
export function useCanDeletePolicy(policy?: LeavePolicy) {
  return {
    canDelete:
      !policy?._count?.leaveRequests || policy._count.leaveRequests === 0,
    reason: policy?._count?.leaveRequests
      ? `Policy has ${policy._count.leaveRequests} pending or approved leave request(s)`
      : undefined,
  };
}
