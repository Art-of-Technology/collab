'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  getFeatureRequests, 
  getFeatureRequestById, 
  createFeatureRequest,
  voteOnFeature,
  addFeatureComment,
  updateFeatureStatus
} from '@/actions/feature';

// Define query keys
export const featureKeys = {
  all: ['features'] as const,
  lists: () => [...featureKeys.all, 'list'] as const,
  filtered: (filters: { page?: number; limit?: number; status?: string; orderBy?: string }) => 
    [...featureKeys.lists(), filters] as const,
  detail: (id: string) => [...featureKeys.all, 'detail', id] as const,
};

// Get all feature requests with filtering and pagination
export const useFeatureRequests = (
  filters: { 
    page?: number; 
    limit?: number; 
    status?: string; 
    orderBy?: string 
  } = {}
) => {
  return useQuery({
    queryKey: featureKeys.filtered(filters),
    queryFn: () => getFeatureRequests(filters),
  });
};

// Get a single feature request by ID
export const useFeatureRequestById = (id: string) => {
  return useQuery({
    queryKey: featureKeys.detail(id),
    queryFn: () => getFeatureRequestById(id),
    enabled: !!id,
  });
};

// Create a new feature request
export const useCreateFeatureRequest = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: createFeatureRequest,
    onSuccess: () => {
      // Invalidate the feature list query to refresh the data
      queryClient.invalidateQueries({ queryKey: featureKeys.lists() });
    },
  });
};

// Vote on a feature request
export const useVoteOnFeature = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: voteOnFeature,
    onSuccess: (_, variables) => {
      // Invalidate both the list and the specific feature detail
      queryClient.invalidateQueries({ queryKey: featureKeys.lists() });
      queryClient.invalidateQueries({ 
        queryKey: featureKeys.detail(variables.featureRequestId)
      });
    },
  });
};

// Add a comment to a feature request
export const useAddFeatureComment = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: addFeatureComment,
    onSuccess: (_, variables) => {
      // Invalidate the specific feature detail
      queryClient.invalidateQueries({ 
        queryKey: featureKeys.detail(variables.featureRequestId)
      });
    },
  });
};

// Update feature request status (admin only)
export const useUpdateFeatureStatus = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: updateFeatureStatus,
    onSuccess: (_, variables) => {
      // Invalidate both the list and the specific feature detail
      queryClient.invalidateQueries({ queryKey: featureKeys.lists() });
      queryClient.invalidateQueries({ 
        queryKey: featureKeys.detail(variables.featureRequestId) 
      });
    },
  });
}; 