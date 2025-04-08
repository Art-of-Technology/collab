'use client';

import { useQuery } from '@tanstack/react-query';
import { searchContent } from '@/actions/search';

export function useSearch(query: string, tab: string = 'all') {
  return useQuery({
    queryKey: ['search', query, tab],
    queryFn: () => searchContent(query, tab),
    enabled: !!query.trim(),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
} 