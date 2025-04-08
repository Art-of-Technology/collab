"use client";

import { useQuery } from "@tanstack/react-query";
import axios from "axios";

// Define query keys for milestones
export const milestoneKeys = {
  all: ["milestones"] as const,
  lists: () => [...milestoneKeys.all, "list"] as const,
  list: (filters: Record<string, any>) => [...milestoneKeys.lists(), filters] as const,
  details: () => [...milestoneKeys.all, "detail"] as const,
  detail: (id: string) => [...milestoneKeys.details(), id] as const,
  workspace: (workspaceId: string) => [...milestoneKeys.lists(), { workspaceId }] as const,
  board: (boardId: string) => [...milestoneKeys.lists(), { boardId }] as const,
};

// Fetch milestones with optional filtering
export interface MilestoneFilters {
  boardId?: string;
  workspaceId?: string;
  status?: string;
}

export interface Milestone {
  id: string;
  title: string;
  description: string | null;
  status: string;
  startDate: string | null;
  dueDate: string | null;
  color: string | null;
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
  _count?: {
    epics: number;
    stories: number;
    tasks: number;
  };
}

interface UseMilestonesOptions {
  workspaceId?: string;
  status?: string;
  includeStats?: boolean;
}

export const useMilestones = ({
  workspaceId,
  status,
  includeStats = false,
}: UseMilestonesOptions = {}) => {
  return useQuery({
    queryKey: ["milestones", { workspaceId, status, includeStats }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (workspaceId) params.append("workspaceId", workspaceId);
      if (status) params.append("status", status);
      if (includeStats) params.append("includeStats", "true");

      const { data } = await axios.get(`/api/milestones?${params.toString()}`);
      return data as Milestone[];
    },
    enabled: !!workspaceId,
  });
};

export const useMilestone = (id: string | undefined) => {
  return useQuery({
    queryKey: ["milestone", id],
    queryFn: async () => {
      const { data } = await axios.get(`/api/milestones/${id}`);
      return data as Milestone;
    },
    enabled: !!id,
  });
}; 