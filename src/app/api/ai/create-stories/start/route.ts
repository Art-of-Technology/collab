import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { jobStorage, JobStatus } from '@/lib/job-storage';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { stories, epicId, boardId, workspaceId } = await request.json();

    if (!stories || !Array.isArray(stories) || stories.length === 0) {
      return NextResponse.json(
        { error: 'Stories array is required' },
        { status: 400 }
      );
    }

    if (!epicId || !boardId || !workspaceId) {
      return NextResponse.json(
        { error: 'Epic ID, Board ID, and Workspace ID are required' },
        { status: 400 }
      );
    }

    // Validate access to workspace
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        OR: [
          { ownerId: session.user.id },
          { members: { some: { userId: session.user.id } } }
        ]
      }
    });

    if (!workspace) {
      return NextResponse.json({ error: 'Workspace not found or access denied' }, { status: 404 });
    }

    // Create story creation job
    const jobId = `story_job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const job: JobStatus = {
      id: jobId,
      userId: session.user.id,
      workspaceId,
      description: `Creating ${stories.length} stories for epic`,
      status: 'PENDING',
      progress: 0,
      currentStep: 'Initializing story creation...',
      boardData: { stories, epicId, boardId },
      boardId: boardId,
      error: undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    await jobStorage.set(job);

    console.log(`Story creation job created with ID: ${jobId}`);

    // Start background process
    startBackgroundStoryCreation(jobId);

    return NextResponse.json({ 
      success: true, 
      jobId: jobId,
      message: 'Story creation started'
    });

  } catch (error) {
    console.error('Error starting story creation:', error);
    return NextResponse.json(
      { error: 'Failed to start story creation' },
      { status: 500 }
    );
  }
}

// Helper function to update job status
async function updateJobStatus(jobId: string, status: JobStatus['status'], progress: number, currentStep: string) {
  try {
    const job = await jobStorage.get(jobId);
    if (job) {
      job.status = status;
      job.progress = progress;
      job.currentStep = currentStep;
      job.updatedAt = new Date();
      await jobStorage.set(job);
    }
  } catch (error) {
    console.error(`Error updating job status for ${jobId}:`, error);
  }
}

// Background story creation function
async function startBackgroundStoryCreation(jobId: string) {
  setTimeout(async () => {
    try {
      console.log(`Starting background story creation for job: ${jobId}`);
      const job = await jobStorage.get(jobId);
      if (!job || !job.boardData) {
        console.log(`Job not found or missing boardData: ${jobId}`);
        return;
      }
      console.log(`Found job for background processing:`, job.id, job.status);

      const { stories, epicId, boardId } = job.boardData;

      await updateJobStatus(jobId, 'GENERATING_STORIES', 10, 'Validating data...');

      // Validate epic exists
      const epic = await prisma.epic.findFirst({
        where: {
          id: epicId,
          workspaceId: job.workspaceId
        }
      });

      if (!epic) {
        await updateJobStatus(jobId, 'FAILED', 0, 'Epic not found');
        return;
      }

      // Validate task board exists
      const taskBoard = await prisma.taskBoard.findFirst({
        where: {
          id: boardId,
          workspaceId: job.workspaceId
        },
        include: {
          columns: true
        }
      });

      if (!taskBoard) {
        await updateJobStatus(jobId, 'FAILED', 0, 'Task board not found');
        return;
      }

      // Find the "Stories" or appropriate column
      const storiesColumn = taskBoard.columns.find(col => 
        col.name.toLowerCase() === 'stories' || 
        col.name.toLowerCase() === 'story' ||
        col.name.toLowerCase() === 'to do' ||
        col.name.toLowerCase() === 'todo' ||
        col.name.toLowerCase() === 'backlog'
      ) || taskBoard.columns[0];

      if (!storiesColumn) {
        await updateJobStatus(jobId, 'FAILED', 0, 'No columns found in task board');
        return;
      }

      await updateJobStatus(jobId, 'GENERATING_STORIES', 30, 'Creating stories...');

      // Create stories
      const createdStories = [];
      let position = 0;
      const totalStories = stories.length;

      for (let i = 0; i < stories.length; i++) {
        const storyData = stories[i];
        const progress = 30 + Math.floor((i / totalStories) * 60);
        
        await updateJobStatus(jobId, 'GENERATING_STORIES', progress, `Creating story ${i + 1}/${totalStories}: ${storyData.title}`);

        try {
          // Parse description if it's HTML
          const description = storyData.description || "";

          // Generate issue key if board has a prefix
          let issueKey = null;
          if (taskBoard.issuePrefix) {
            // Update the board's next issue number
            const updatedBoard = await prisma.taskBoard.update({
              where: { id: taskBoard.id },
              data: { nextIssueNumber: { increment: 1 } }
            });
            issueKey = `${taskBoard.issuePrefix}-${updatedBoard.nextIssueNumber - 1}`;
          }

          const story = await prisma.story.create({
            data: {
              title: storyData.title,
              description: description,
              priority: storyData.priority?.toUpperCase() || "MEDIUM",
              status: storiesColumn.name,
              storyPoints: storyData.storyPoints || undefined,
              position: position++,
              issueKey: issueKey,
              taskBoardId: boardId,
              columnId: storiesColumn.id,
              workspaceId: job.workspaceId,
              epicId: epicId,
              reporterId: job.userId,
              assigneeId: job.userId,
            },
            include: {
              assignee: true,
              reporter: true,
              column: true,
              epic: true,
            }
          });

          createdStories.push(story);

          // Small delay to prevent overwhelming the database
          await new Promise(resolve => setTimeout(resolve, 100));

        } catch (storyError) {
          console.error(`Error creating story: ${storyData.title}`, storyError);
          // Continue with other stories even if one fails
        }
      }

      await updateJobStatus(jobId, 'COMPLETED', 100, `Successfully created ${createdStories.length} stories!`);

      // Update job with created stories
      const updatedJob = await jobStorage.get(jobId);
      if (updatedJob) {
        updatedJob.boardData = { ...updatedJob.boardData, createdStories };
        await jobStorage.set(updatedJob);
      }

    } catch (error) {
      console.error('Background story creation error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await updateJobStatus(jobId, 'FAILED', 0, `Error: ${errorMessage}`);
    }
  }, 100);
} 