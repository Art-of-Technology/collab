// DEPRECATED: This endpoint is replaced by /api/ai/jobs for better performance
// Use the unified endpoint instead of individual job endpoints
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
      return NextResponse.json(
        { error: 'Workspace ID is required' },
        { status: 400 }
      );
    }

    // Get all jobs for this user and workspace
    const allJobs = await jobStorage.getAll();
    
    // Filter jobs for this user and workspace, and only story-related jobs
    const userJobs = allJobs.filter(job => 
      job.userId === session.user.id && 
      job.workspaceId === workspaceId &&
      job.id.startsWith('story_job_')
    );

    // Sort by creation date (newest first)
    userJobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Return only last 10 jobs
    const recentJobs = userJobs.slice(0, 10);

    return NextResponse.json({ 
      success: true, 
      jobs: recentJobs 
    });

  } catch (error) {
    console.error('Error fetching story generation jobs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch jobs' },
      { status: 500 }
    );
  }
} 