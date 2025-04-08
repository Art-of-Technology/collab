'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  getUserConversations, 
  getConversationById, 
  sendMessage, 
  getUsersForNewConversation,
  createOrGetConversation 
} from '@/actions/message';
import { useToast } from '@/hooks/use-toast';

export function useConversations() {
  return useQuery({
    queryKey: ['conversations'],
    queryFn: () => getUserConversations(),
  });
}

export function useConversation(conversationId: string) {

  return useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: () => getConversationById(conversationId),
    enabled: !!conversationId,
    refetchInterval: 5000, // Polling every 5 seconds to check for new messages
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({conversationId, content}: {conversationId: string, content: string}) => 
      sendMessage(conversationId, content),
    onSuccess: (_, variables) => {
      // Invalidate conversation to refresh with new message
      queryClient.invalidateQueries({
        queryKey: ['conversation', variables.conversationId],
      });
      queryClient.invalidateQueries({
        queryKey: ['conversations'],
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to send message",
        variant: "destructive",
      });
    }
  });
}

export function useUsersForNewConversation() {
  return useQuery({
    queryKey: ['users-for-conversation'],
    queryFn: () => getUsersForNewConversation(),
  });
}

export function useCreateConversation() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (otherUserId: string) => createOrGetConversation(otherUserId),
    onSuccess: () => {
      // Invalidate conversations list
      queryClient.invalidateQueries({
        queryKey: ['conversations'],
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create conversation",
        variant: "destructive",
      });
    }
  });
} 