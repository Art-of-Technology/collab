"use client";

import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
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
  const jobsRef = useRef<JobStatus[]>([]);

  // Keep ref in sync with state
  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  const fetchJobs = async () => {
    if (!workspaceId) return;
    try {
      const response = await fetch(`/api/ai/jobs?workspaceId=${workspaceId}`);
      const result = await response.json();
      if (result.success) {
        // Use pre-filtered board jobs from unified endpoint
        setJobs(result.boardJobs || []);
      }
    } catch (error) {
      console.error('Failed to fetch board generation jobs:', error);
    }
  };

  useEffect(() => {
    fetchJobs();
    
    // Set up intelligent polling - only poll when there are active jobs
    const interval = setInterval(() => {
      const hasActiveJobs = jobsRef.current.some((job: JobStatus) => 
        job.status === 'PENDING' || 
        job.status === 'GENERATING_MILESTONES' ||
        job.status === 'GENERATING_EPICS' ||
        job.status === 'GENERATING_STORIES' ||
        job.status === 'GENERATING_TASKS'
      );
      if (hasActiveJobs) {
        fetchJobs();
      }
    }, 10000); // Poll every 10 seconds instead of 2
    
    return () => clearInterval(interval);
  }, [workspaceId]);

  return (
    <BoardGenerationContext.Provider value={{ jobs, refreshJobs: fetchJobs }}>
      {children}
    </BoardGenerationContext.Provider>
  );
} 