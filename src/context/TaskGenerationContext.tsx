"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
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

  const fetchJobs = async () => {
    if (!workspaceId) return;
    try {
      const response = await fetch(`/api/ai/create-tasks/jobs?workspaceId=${workspaceId}`);
      const result = await response.json();
      console.log('TaskGeneration fetch result:', result);
      if (result.success) {
        // Filter only task creation jobs (jobs that start with 'task_job_')
        const taskJobs = result.jobs.filter((job: JobStatus) => job.id.startsWith('task_job_'));
        console.log('TaskGeneration filtered jobs:', taskJobs);
        setJobs(taskJobs);
      }
    } catch (error) {
      // Silently fail - context should not break the app
      console.error('Failed to fetch task generation jobs:', error);
    }
  };

  useEffect(() => {
    fetchJobs();
    const interval = setInterval(fetchJobs, 2000); // Poll every 2 seconds
    return () => clearInterval(interval);
  }, [workspaceId]);

  return (
    <TaskGenerationContext.Provider value={{ jobs, refreshJobs: fetchJobs }}>
      {children}
    </TaskGenerationContext.Provider>
  );
} 