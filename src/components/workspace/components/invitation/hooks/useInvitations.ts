import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import type { Invitation } from "../types";

// Query key factory for invitations
export const invitationKeys = {
  all: ['invitations'] as const,
  workspace: (workspaceId: string) => [...invitationKeys.all, 'workspace', workspaceId] as const,
};

export function invitationFeedback(data: { emailSent?: boolean; emailDetails?: { error?: string | null } }) {
  if (data.emailSent === true) {
    return { title: 'Invitation sent successfully', description: 'An invitation email has been sent.' };
  }

  const error = data.emailDetails?.error;
  const notSent = data.emailSent === false && (
    error === 'Email delivery is not configured. Contact your workspace administrator.' ||
    error === 'The email service did not accept the message. Please retry from workspace invitations.'
  );
  return {
    title: notSent ? 'Invitation created; email not sent' : 'Invitation created; email unconfirmed',
    description: `${error || 'Email delivery could not be confirmed.'} Copy the invitation link from Pending Invitations to share it directly.`,
  };
}

// Hook to fetch invitations for a workspace
export function useInvitations(workspaceId: string) {
  return useQuery({
    queryKey: invitationKeys.workspace(workspaceId),
    queryFn: async (): Promise<Invitation[]> => {
      const response = await fetch(`/api/workspaces/${workspaceId}/invitations`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch invitations');
      }
      
      return response.json();
    },
    enabled: !!workspaceId,
    staleTime: 30 * 1000, // 30 seconds
    refetchOnWindowFocus: true,
  });
}

// Hook to invite a new member
export function useInviteMember(workspaceId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (email: string) => {
      const response = await fetch(`/api/workspaces/${workspaceId}/invitations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to send invitation');
      }

      return result;
    },
    onSuccess: (data) => {
      // Invalidate and refetch invitations
      queryClient.invalidateQueries({
        queryKey: invitationKeys.workspace(workspaceId),
      });

      // Also invalidate workspace data to update invitation count
      queryClient.invalidateQueries({
        queryKey: ['workspace', workspaceId],
      });

      toast({ ...invitationFeedback(data), variant: data.emailSent === true ? 'default' : 'destructive' });
    },
    onError: (error) => {
      toast({
        title: "Failed to send invitation",
        description: error instanceof Error ? error.message : "An error occurred while sending the invitation",
        variant: "destructive",
      });
    },
  });
}

export function useResendInvitation(workspaceId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ invitationId, email }: { invitationId: string; email: string }) => {
      // First cancel the existing invitation
      const cancelResponse = await fetch(`/api/workspaces/${workspaceId}/invitations?id=${invitationId}`, {
        method: 'DELETE',
      });

      if (!cancelResponse.ok) {
        const errorData = await cancelResponse.json();
        throw new Error(errorData.error || 'Failed to cancel existing invitation');
      }

      // Then create a new invitation
      const createResponse = await fetch(`/api/workspaces/${workspaceId}/invitations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const result = await createResponse.json();

      if (!createResponse.ok) {
        throw new Error(result.error || 'Failed to create new invitation');
      }

      return result;
    },
    onSuccess: (data) => {
      // Invalidate and refetch invitations
      queryClient.invalidateQueries({
        queryKey: invitationKeys.workspace(workspaceId),
      });

      // Also invalidate workspace data to update invitation count
      queryClient.invalidateQueries({
        queryKey: ['workspace', workspaceId],
      });

      toast({ ...invitationFeedback(data), variant: data.emailSent === true ? 'default' : 'destructive' });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to resend invitation',
        variant: 'destructive',
      });
    },
  });
}

export function useCancelInvitation(workspaceId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (invitationId: string) => {
      const response = await fetch(`/api/workspaces/${workspaceId}/invitations?id=${invitationId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to cancel invitation');
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate and refetch invitations
      queryClient.invalidateQueries({
        queryKey: invitationKeys.workspace(workspaceId),
      });

      // Also invalidate workspace data to update invitation count
      queryClient.invalidateQueries({
        queryKey: ['workspace', workspaceId],
      });

      toast({
        title: 'Invitation Cancelled',
        description: 'The invitation has been cancelled successfully.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to cancel invitation',
        variant: 'destructive',
      });
    },
  });
}
