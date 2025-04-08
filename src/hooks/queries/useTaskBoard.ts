"use client";

import { useQuery } from "@tanstack/react-query";
import axios from "axios";

export interface TaskBoard {
  id: string;
  name: string;
  description: string | null;
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
  creatorId: string;
  creator?: {
    id: string;
    name: string;
    image: string;
  };
  _count?: {
    tasks: number;
  };
}

interface UseTaskBoardsOptions {
  workspaceId?: string;
  includeStats?: boolean;
}

export const useTaskBoards = ({
  workspaceId,
  includeStats = false,
}: UseTaskBoardsOptions = {}) => {
  return useQuery({
    queryKey: ["taskBoards", { workspaceId, includeStats }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (workspaceId) params.append("workspaceId", workspaceId);
      if (includeStats) params.append("includeStats", "true");

      const { data } = await axios.get(`/api/taskboards?${params.toString()}`);
      return data as TaskBoard[];
    },
    enabled: !!workspaceId,
  });
};

export const useTaskBoard = (id: string | undefined) => {
  return useQuery({
    queryKey: ["taskBoard", id],
    queryFn: async () => {
      const { data } = await axios.get(`/api/taskboards/${id}`);
      return data as TaskBoard;
    },
    enabled: !!id,
  });
}; 