'use client';

import { useQuery } from '@tanstack/react-query';
import { 
    getMilestoneById, 
    getEpicById, 
    getStoryById,
    getWorkspaceMilestones,
    getWorkspaceEpics,
    getWorkspaceStories
} from '@/actions/boardItems';

// Query keys
export const entityKeys = {
  all: ['entities'] as const,
  lists: () => [...entityKeys.all, 'list'] as const,
  list: (workspaceId: string, entityType: string, boardId?: string | null) => 
        [...entityKeys.lists(), workspaceId, entityType, { boardId: boardId ?? 'all' }] as const,
  details: () => [...entityKeys.all, 'detail'] as const,
  detail: (id: string) => [...entityKeys.details(), id] as const,
};

// Type helper for query results (adjust based on actual return types)
type MilestoneList = { id: string; title: string; taskBoardId: string | null }[];
type EpicList = { id: string; title: string; taskBoardId: string | null }[];
type StoryList = { id: string; title: string; taskBoardId: string | null; epicId: string | null }[];

// Hook to get Milestone details by ID
export const useMilestoneById = (id: string | undefined | null) => {
  return useQuery({
    queryKey: entityKeys.detail(id || ''),
    queryFn: () => getMilestoneById(id as string),
    enabled: !!id, // Only run if id is provided
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};

// Hook to get Epic details by ID
export const useEpicById = (id: string | undefined | null) => {
  return useQuery({
    queryKey: entityKeys.detail(id || ''),
    queryFn: () => getEpicById(id as string),
    enabled: !!id, // Only run if id is provided
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};

// Hook to get Story details by ID
export const useStoryById = (id: string | undefined | null) => {
  return useQuery({
    queryKey: entityKeys.detail(id || ''),
    queryFn: () => getStoryById(id as string),
    enabled: !!id, // Only run if id is provided
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};

// Hook to get Milestones, accepting optional boardId
export const useWorkspaceMilestones = (
    workspaceId: string | undefined | null, 
    boardId?: string | null
) => {
  return useQuery<MilestoneList>({
    queryKey: entityKeys.list(workspaceId || '', 'milestones', boardId),
    queryFn: () => getWorkspaceMilestones(workspaceId as string, boardId),
    enabled: !!workspaceId, // Enable based on workspaceId; further filtering done by boardId in action
    staleTime: 1000 * 60 * 15, 
  });
};

// Hook to get Epics, accepting optional boardId
export const useWorkspaceEpics = (
    workspaceId: string | undefined | null, 
    boardId?: string | null
) => {
  return useQuery<EpicList>({
    queryKey: entityKeys.list(workspaceId || '', 'epics', boardId),
    queryFn: () => getWorkspaceEpics(workspaceId as string, boardId),
    enabled: !!workspaceId, 
    staleTime: 1000 * 60 * 15, 
  });
};

// Hook to get Stories, accepting optional boardId
export const useWorkspaceStories = (
    workspaceId: string | undefined | null, 
    boardId?: string | null
) => {
  return useQuery<StoryList>({
    queryKey: entityKeys.list(workspaceId || '', 'stories', boardId),
    queryFn: () => getWorkspaceStories(workspaceId as string, boardId),
    enabled: !!workspaceId, 
    staleTime: 1000 * 60 * 15, 
  });
}; 