"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { JobStatus } from '@/lib/job-storage';

interface StoryGenerationContextType {
  jobs: JobStatus[];
  refreshJobs: () => void;
}

const StoryGenerationContext = createContext<StoryGenerationContextType>({
  jobs: [],
  refreshJobs: () => { },
});

export function useStoryGeneration() {
  return useContext(StoryGenerationContext);
}

export function StoryGenerationProvider({ workspaceId, children }: { workspaceId: string, children: ReactNode }) {
  const [jobs, setJobs] = useState<JobStatus[]>([]);

  const fetchJobs = async () => {
    if (!workspaceId) return;
    try {
    } catch (error) {
      // Silently fail - context should not break the app
      console.error('Failed to fetch story generation jobs:', error);
    }
  };

  // useEffect(() => {
  //   fetchJobs();
  //   const interval = setInterval(fetchJobs, 2000); // Poll every 2 seconds
  //   return () => clearInterval(interval);
  // }, [workspaceId]);

  return (
    <StoryGenerationContext.Provider value={{ jobs, refreshJobs: fetchJobs }}>
      {children}
    </StoryGenerationContext.Provider>
  );
} 