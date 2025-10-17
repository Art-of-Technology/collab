import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import type { Invitation } from "../types";

// Query key factory for invitations
export const invitationKeys = {
  all: ['invitations'] as const,
  workspace: (workspaceId: string) => [...invitationKeys.all, 'workspace', workspaceId] as const,
};

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
    onSuccess: (data, email) => {
      // Invalidate and refetch invitations
      queryClient.invalidateQueries({
        queryKey: invitationKeys.workspace(workspaceId),
      });

      // Also invalidate workspace data to update invitation count
      queryClient.invalidateQueries({
        queryKey: ['workspace', workspaceId],
      });

      // Show detailed status toast
      if (data.emailSent === false) {
        const errorDetail = data.emailDetails?.error ? `: ${data.emailDetails.error}` : '';
        toast({
          title: "Invitation created, but email not sent",
          description: `The invitation was created successfully, but we couldn't send the email${errorDetail}. The user can still join using the invitation link from your workspace settings.`,
          variant: "destructive",
        });
      } else {
        const messageId = data.emailDetails?.messageId ? ` (ID: ${data.emailDetails.messageId})` : '';
        toast({
          title: "Invitation sent successfully",
          description: `An email invitation has been sent to ${email}${messageId}`,
          variant: "default",
        });
      }
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

// Hook to cancel an invitation
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
    onSuccess: (data, { email }) => {
      // Invalidate and refetch invitations
      queryClient.invalidateQueries({
        queryKey: invitationKeys.workspace(workspaceId),
      });

      // Also invalidate workspace data to update invitation count
      queryClient.invalidateQueries({
        queryKey: ['workspace', workspaceId],
      });

      if (data.emailSent === false) {
        toast({
          title: "Invitation resent, but email not sent",
          description: "The invitation was created successfully, but we couldn't send the email. The user can still join using the invitation link from your workspace settings.",
          variant: "default",
        });
      } else {
        toast({
          title: "Invitation resent successfully",
          description: `A new invitation email has been sent to ${email}`,
          variant: "default",
        });
      }
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
