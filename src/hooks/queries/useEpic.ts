"use client";

import { useQuery } from "@tanstack/react-query";
import axios from "axios";

// Define query keys for epics
export const epicKeys = {
  all: ["epics"] as const,
  lists: () => [...epicKeys.all, "list"] as const,
  list: (filters: Record<string, any>) => [...epicKeys.lists(), filters] as const,
  details: () => [...epicKeys.all, "detail"] as const,
  detail: (id: string) => [...epicKeys.details(), id] as const,
  workspace: (workspaceId: string) => [...epicKeys.lists(), { workspaceId }] as const,
  board: (boardId: string) => [...epicKeys.lists(), { boardId }] as const,
  milestone: (milestoneId: string) => [...epicKeys.lists(), { milestoneId }] as const,
};

// Fetch epics with optional filtering
export interface EpicFilters {
  milestoneId?: string;
  boardId?: string;
  workspaceId?: string;
  status?: string;
}

export interface Epic {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  startDate: string | null;
  dueDate: string | null;
  color: string | null;
  workspaceId: string;
  milestoneId: string | null;
  taskBoardId: string | null;
  createdAt: string;
  updatedAt: string;
  creatorId: string;
  creator?: {
    id: string;
    name: string;
    image: string;
  };
  milestone?: {
    id: string;
    title: string;
  };
  _count?: {
    stories: number;
    tasks: number;
  };
}

interface UseEpicsOptions {
  workspaceId?: string;
  milestoneId?: string;
  status?: string;
  includeStats?: boolean;
}

export const useEpics = ({
  workspaceId,
  milestoneId,
  status,
  includeStats = false,
}: UseEpicsOptions = {}) => {
  return useQuery({
    queryKey: ["epics", { workspaceId, milestoneId, status, includeStats }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (workspaceId) params.append("workspaceId", workspaceId);
      if (milestoneId) params.append("milestoneId", milestoneId);
      if (status) params.append("status", status);
      if (includeStats) params.append("includeStats", "true");

      const { data } = await axios.get(`/api/epics?${params.toString()}`);
      return data as Epic[];
    },
    enabled: !!workspaceId,
  });
};

export const useEpic = (id: string | undefined) => {
  return useQuery({
    queryKey: ["epic", id],
    queryFn: async () => {
      const { data } = await axios.get(`/api/epics/${id}`);
      return data as Epic;
    },
    enabled: !!id,
  });
}; 