"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { JobStatus } from '@/lib/job-storage';

interface BoardGenerationContextType {
  jobs: JobStatus[];
  refreshJobs: () => void;
}

const BoardGenerationContext = createContext<BoardGenerationContextType>({
  jobs: [],
  refreshJobs: () => {},
});

export function useBoardGeneration() {
  return useContext(BoardGenerationContext);
}

export function BoardGenerationProvider({ workspaceId, children }: { workspaceId: string, children: ReactNode }) {
  const [jobs, setJobs] = useState<JobStatus[]>([]);

  const fetchJobs = async () => {
    if (!workspaceId) return;
    try {
      const response = await fetch(`/api/ai/board-generation/jobs?workspaceId=${workspaceId}`);
      const result = await response.json();
      if (result.success) setJobs(result.jobs);
    } catch {}
  };

  useEffect(() => {
    fetchJobs();
    const interval = setInterval(fetchJobs, 3000);
    return () => clearInterval(interval);
  }, [workspaceId]);

  return (
    <BoardGenerationContext.Provider value={{ jobs, refreshJobs: fetchJobs }}>
      {children}
    </BoardGenerationContext.Provider>
  );
} 