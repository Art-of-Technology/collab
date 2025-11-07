'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  getCurrentUser, 
  getUserById,
  updateUserAvatar,
  getCurrentUserProfile,
  getUserProfile,
  updateUserProfile
} from '@/actions/user';

// Define query keys
export const userKeys = {
  all: ['users'] as const,
  current: () => [...userKeys.all, 'current'] as const,
  detail: (id: string) => [...userKeys.all, 'detail', id] as const,
};

// Get current user hook
export const useCurrentUser = () => {
  return useQuery({
    queryKey: userKeys.current(),
    queryFn: getCurrentUser,
  });
};

// Get user by ID hook
export const useUserById = (userId: string) => {
  return useQuery({
    queryKey: userKeys.detail(userId),
    queryFn: () => getUserById(userId),
    enabled: !!userId,
  });
};

// Update user profile mutation
export const useUpdateUserProfile = (workspaceId?: string) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: any) => updateUserProfile(data, workspaceId),
    onSuccess: () => {
      // Invalidate the current user query to refresh the data
      queryClient.invalidateQueries({ queryKey: userKeys.current() });
      queryClient.invalidateQueries({ queryKey: ['profile', 'current', workspaceId] });
    },
  });
};

// Update user avatar mutation
export const useUpdateUserAvatar = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: updateUserAvatar,
    onSuccess: () => {
      // Invalidate the current user query to refresh the data
      queryClient.invalidateQueries({ queryKey: userKeys.current() });
    },
  });
};

export function useCurrentUserProfile(workspaceId?: string) {
  return useQuery({
    queryKey: ['profile', 'current', workspaceId],
    queryFn: () => getCurrentUserProfile(workspaceId),
    enabled: workspaceId !== undefined,
  });
}

export function useUserProfile(userId: string, workspaceId?: string) {
  return useQuery({
    queryKey: ['profile', userId, workspaceId],
    queryFn: () => getUserProfile(userId, workspaceId),
    enabled: !!userId && workspaceId !== undefined,
  });
}

export function useUpdateProfile(workspaceId?: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: any) => updateUserProfile(data, workspaceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', 'current', workspaceId] });
    }
  });
} 