"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';
import { JobStatus } from '@/lib/job-storage';

interface TaskGenerationContextType {
  jobs: JobStatus[];
  refreshJobs: () => void;
}

const TaskGenerationContext = createContext<TaskGenerationContextType>({
  jobs: [],
  refreshJobs: () => {},
});

export function useTaskGeneration() {
  return useContext(TaskGenerationContext);
}

export function TaskGenerationProvider({ workspaceId, children }: { workspaceId: string, children: ReactNode }) {
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
        // Use pre-filtered task jobs from unified endpoint
        setJobs(result.taskJobs || []);
      }
    } catch (error) {
      // Silently fail - context should not break the app
      console.error('Failed to fetch task generation jobs:', error);
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
    <TaskGenerationContext.Provider value={{ jobs, refreshJobs: fetchJobs }}>
      {children}
    </TaskGenerationContext.Provider>
  );
} 