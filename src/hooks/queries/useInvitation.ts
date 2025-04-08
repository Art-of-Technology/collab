'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getPendingInvitations, getInvitationByToken, acceptInvitation } from '@/actions/invitation';

/**
 * Hook for fetching pending workspace invitations
 */
export function usePendingInvitations(email: string | undefined | null) {
  return useQuery({
    queryKey: ['workspaces', 'invitations', 'pending', email],
    queryFn: () => getPendingInvitations(email as string),
    enabled: !!email,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

// Define query keys
export const invitationKeys = {
  all: ['invitations'] as const,
  pending: () => [...invitationKeys.all, 'pending'] as const,
  token: (token: string) => [...invitationKeys.all, 'token', token] as const,
};

// Get an invitation by token
export const useInvitationByToken = (token: string) => {
  return useQuery({
    queryKey: invitationKeys.token(token),
    queryFn: () => getInvitationByToken(token),
    enabled: !!token,
  });
};

// Accept invitation mutation
export interface UseAcceptInvitationOptions {
  onSuccess?: (data: any) => void;
  onError?: (error: Error) => void;
}

export const useAcceptInvitation = (options?: UseAcceptInvitationOptions) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: acceptInvitation,
    onSuccess: (data) => {
      // Invalidate workspaces list and invitation
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.invalidateQueries({ queryKey: invitationKeys.all });
      
      if (options?.onSuccess) {
        options.onSuccess(data);
      }
    },
    onError: (error: Error) => {
      if (options?.onError) {
        options.onError(error);
      }
    },
  });
}; 