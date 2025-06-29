import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { jobStorage } from '@/lib/job-storage';

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId');

    if (!workspaceId) {
      return NextResponse.json({ error: 'Workspace ID is required' }, { status: 400 });
    }

    // Get all jobs for the workspace
    const allJobs = await jobStorage.getByWorkspace(workspaceId);
    
    // Filter only task creation jobs (jobs that start with 'task_job_')
    const taskJobs = allJobs.filter(job => 
      job.id.startsWith('task_job_') && 
      job.userId === session.user.id
    );

    // Sort by creation date (newest first)
    taskJobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({
      success: true,
      jobs: taskJobs.slice(0, 10), // Return only the 10 most recent
    });

  } catch (error) {
    console.error('Error fetching task creation jobs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch jobs' },
      { status: 500 }
    );
  }
} 