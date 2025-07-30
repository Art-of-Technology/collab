import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { jobStorage } from '@/lib/job-storage';
import { resolveWorkspaceSlug } from '@/lib/slug-resolvers';

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceSlugOrId = searchParams.get('workspaceId');

    if (!workspaceSlugOrId) {
      return NextResponse.json(
        { error: 'Workspace ID is required' },
        { status: 400 }
      );
    }

    // Resolve workspace slug to actual workspace ID if needed
    const actualWorkspaceId = await resolveWorkspaceSlug(workspaceSlugOrId);
    
    if (!actualWorkspaceId) {
      return NextResponse.json(
        { error: 'Workspace not found' },
        { status: 404 }
      );
    }

    // Get all jobs for this user and workspace
    const allJobs = await jobStorage.getAll();
    
    // Filter jobs for this user and workspace using the resolved workspace ID
    const userJobs = allJobs.filter(job => 
      job.userId === session.user.id && 
      job.workspaceId === actualWorkspaceId
    );

    // Sort by creation date (newest first)
    userJobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Clean job data to reduce transfer size - remove unnecessary fields
    const cleanJobData = (jobs: any[]) => jobs.map(job => ({
      id: job.id,
      status: job.status,
      progress: job.progress,
      currentStep: job.currentStep,
      description: job.description,
      error: job.error,
      boardId: job.boardId,
      boardData: job.boardData,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      // Keep only essential fields for widgets
    }));

    // Categorize jobs by type for better frontend filtering
    const storyJobs = cleanJobData(userJobs.filter(job => job.id.startsWith('story_job_')).slice(0, 10));
    const taskJobs = cleanJobData(userJobs.filter(job => job.id.startsWith('task_job_')).slice(0, 10));
    const boardJobs = cleanJobData(userJobs.filter(job => job.id.startsWith('job_') && !job.id.startsWith('task_job_') && !job.id.startsWith('story_job_')).slice(0, 10));

    return NextResponse.json({ 
      success: true, 
      totalJobs: userJobs.length,
      storyJobs,
      taskJobs,
      boardJobs,
      // Stats for monitoring
      stats: {
        activeJobs: userJobs.filter(job => ['PENDING', 'GENERATING_STORIES', 'GENERATING_TASKS', 'GENERATING_MILESTONES', 'GENERATING_EPICS'].includes(job.status)).length,
        completedJobs: userJobs.filter(job => job.status === 'COMPLETED').length,
        failedJobs: userJobs.filter(job => job.status === 'FAILED').length,
      }
    });

  } catch (error) {
    console.error('Error fetching AI jobs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch jobs' },
      { status: 500 }
    );
  }
} 