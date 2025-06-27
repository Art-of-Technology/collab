import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { jobStorage } from '@/lib/job-storage';

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const workspaceId = url.searchParams.get('workspaceId');

    if (!workspaceId) {
      return NextResponse.json(
        { error: 'Workspace ID is required' },
        { status: 400 }
      );
    }

    // Get all jobs for the user in this workspace
    const userJobs = (await jobStorage.getByWorkspace(workspaceId)).filter(
      job => job.userId === session.user.id
    );

    // Sort by creation date (newest first)
    userJobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({
      success: true,
      jobs: userJobs.map(job => ({
        id: job.id,
        description: job.description,
        status: job.status,
        progress: job.progress,
        currentStep: job.currentStep,
        boardId: job.boardId,
        error: job.error,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt
      }))
    });

  } catch (error) {
    console.error('Error fetching jobs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch jobs' },
      { status: 500 }
    );
  }
} 