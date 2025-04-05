'use client';

import { useQuery } from '@tanstack/react-query';
import { getFaceLayerCounts } from '@/actions/avatar';
import { useUpdateUserAvatar } from './useUser';

// Define query keys
export const avatarKeys = {
  all: ['avatar'] as const,
  layerCounts: () => [...avatarKeys.all, 'layerCounts'] as const,
};

// Get face layer counts
export const useFaceLayerCounts = () => {
  return useQuery({
    queryKey: avatarKeys.layerCounts(),
    queryFn: getFaceLayerCounts,
  });
};

// Re-export the avatar update mutation for convenience
export { useUpdateUserAvatar }; 