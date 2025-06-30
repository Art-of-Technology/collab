import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { jobStorage } from '@/lib/job-storage';

export async function GET(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const jobId = params.jobId;
    if (!jobId) {
      return NextResponse.json({ error: 'Job ID is required' }, { status: 400 });
    }

    const job = await jobStorage.get(jobId);
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Check if user owns this job
    if (job.userId !== session.user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    return NextResponse.json({
      id: job.id,
      status: job.status,
      progress: job.progress,
      currentStep: job.currentStep,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      error: job.error,
      boardId: job.boardId,
      createdTasksCount: job.boardData?.createdTasks?.length || 0,
    });

  } catch (error) {
    console.error('Error fetching job status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch job status' },
      { status: 500 }
    );
  }
} 