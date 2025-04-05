'use client';

import { useQuery } from '@tanstack/react-query';
import { getTags } from '@/actions/tag';

export function useTags() {
  return useQuery({
    queryKey: ['tags'],
    queryFn: () => getTags(),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
} 