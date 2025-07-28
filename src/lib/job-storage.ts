// Shared in-memory job storage
// In production, this should be replaced with Redis or a proper database

import { redis } from './redis';

export interface JobStatus {
  id: string;
  userId: string;
  workspaceId: string;
  description: string;
  projectType?: string;
  teamSize?: string;
  status: 'PENDING' | 'GENERATING_MILESTONES' | 'GENERATING_EPICS' | 'GENERATING_STORIES' | 'GENERATING_TASKS' | 'COMPLETED' | 'FAILED';
  progress: number;
  currentStep: string;
  boardData?: any;
  boardId?: string;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

const JOB_PREFIX = 'boardgen:job:';

export async function setJob(job: JobStatus) {
  await redis.set(JOB_PREFIX + job.id, JSON.stringify(job), { EX: 600 });
}

export async function getJob(jobId: string): Promise<JobStatus | undefined> {
  const data = await redis.get(JOB_PREFIX + jobId);
  return data ? JSON.parse(data) : undefined;
}

export async function deleteJob(jobId: string) {
  await redis.del(JOB_PREFIX + jobId);
}

export async function getAllJobs(): Promise<JobStatus[]> {
  const keys = await redis.keys(JOB_PREFIX + '*');
  if (!keys.length) return [];
  const values = await redis.mGet(keys) as (string | null)[];
  return values.filter((v): v is string => !!v).map((v) => JSON.parse(v));
}

export async function getJobsByUser(userId: string): Promise<JobStatus[]> {
  const jobs = await getAllJobs();
  return jobs.filter(j => j.userId === userId);
}

export async function getJobsByWorkspace(workspaceId: string): Promise<JobStatus[]> {
  const jobs = await getAllJobs();
  return jobs.filter(j => j.workspaceId === workspaceId);
}

// Export singleton instance
export const jobStorage = {
  set: setJob,
  get: getJob,
  delete: deleteJob,
  getAll: getAllJobs,
  getByUser: getJobsByUser,
  getByWorkspace: getJobsByWorkspace
}; 