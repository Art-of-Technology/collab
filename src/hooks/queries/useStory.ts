"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import axios from "axios";
import { deleteStory, getStoryById, updateStory, getWorkspaceStories } from "@/actions/story";
import { queryClient } from "@/lib/query-client";

export interface Story {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  points: number | null;
  dueDate: string | null;
  epicId: string | null;
  workspaceId: string;
  taskBoardId: string | null;
  createdAt: string;
  updatedAt: string;
  creatorId: string;
  creator?: {
    id: string;
    name: string;
    image: string;
  };
  epic?: {
    id: string;
    title: string;
  };
  taskBoard?: {
    id: string;
    name: string;
  };
  _count?: {
    tasks: number;
  };
}

interface UseStoriesOptions {
  workspaceId?: string;
  epicId?: string;
  taskBoardId?: string;
  status?: string;
  includeStats?: boolean;
}

export const useStories = ({
  workspaceId,
  epicId,
  taskBoardId,
  status,
  includeStats = false,
}: UseStoriesOptions = {}) => {
  return useQuery({
    queryKey: ["stories", { workspaceId, epicId, taskBoardId, status, includeStats }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (workspaceId) params.append("workspaceId", workspaceId);
      if (epicId) params.append("epicId", epicId);
      if (taskBoardId) params.append("taskBoardId", taskBoardId);
      if (status) params.append("status", status);
      if (includeStats) params.append("includeStats", "true");

      const { data } = await axios.get(`/api/stories?${params.toString()}`);
      return data as Story[];
    },
    enabled: !!workspaceId,
  });
};

export const useStory = (id: string | undefined) => {
  return useQuery({
    queryKey: ["story", id],
    queryFn: async () => {
      const { data } = await axios.get(`/api/stories/${id}`);
      return data as Story;
    },
    enabled: !!id,
  });
};

// Story Query Keys
export const storyKeys = {
  all: ["stories"] as const,
  lists: () => [...storyKeys.all, "list"] as const,
  list: (filters: Record<string, any>) => [...storyKeys.lists(), filters] as const,
  workspaceStories: (workspaceId: string) => [...storyKeys.list({ workspaceId })] as const,
  details: () => [...storyKeys.all, "detail"] as const,
  detail: (storyId: string) => [...storyKeys.details(), storyId] as const,
};

// Fetch stories for a workspace
export function useWorkspaceStories(workspaceId: string) {
  return useQuery({
    queryKey: storyKeys.workspaceStories(workspaceId),
    queryFn: () => getWorkspaceStories(workspaceId),
    enabled: !!workspaceId,
  });
}

// Fetch a single story by ID
export function useStoryById(storyId: string) {
  return useQuery({
    queryKey: storyKeys.detail(storyId),
    queryFn: () => getStoryById(storyId),
    enabled: !!storyId,
  });
}

// Update a story
export function useUpdateStory() {
  return useMutation({
    mutationFn: updateStory,
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: storyKeys.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: storyKeys.lists() });
    },
  });
}

// Delete a story
export function useDeleteStory() {
  return useMutation({
    mutationFn: deleteStory,
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: storyKeys.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: storyKeys.lists() });
    },
  });
} 