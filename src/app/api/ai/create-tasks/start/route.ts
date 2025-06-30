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

    const { tasks, storyId, boardId, workspaceId } = await request.json();

    if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
      return NextResponse.json(
        { error: 'Tasks array is required' },
        { status: 400 }
      );
    }

    if (!storyId || !boardId || !workspaceId) {
      return NextResponse.json(
        { error: 'Story ID, Board ID, and Workspace ID are required' },
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

    // Create task creation job
    const jobId = `task_job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const job: JobStatus = {
      id: jobId,
      userId: session.user.id,
      workspaceId,
      description: `Creating ${tasks.length} tasks for story`,
      status: 'PENDING',
      progress: 0,
      currentStep: 'Initializing task creation...',
      boardData: { tasks, storyId, boardId },
      boardId: boardId,
      error: undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    await jobStorage.set(job);

    console.log(`Task creation job created with ID: ${jobId}`);
    console.log(`Job details:`, JSON.stringify(job, null, 2));

    // Start background process
    startBackgroundTaskCreation(jobId);

    return NextResponse.json({ 
      success: true, 
      jobId: jobId,
      message: 'Task creation started'
    });

  } catch (error) {
    console.error('Error starting task creation:');
    console.error(error);
    return NextResponse.json(
      { error: 'Failed to start task creation' },
      { status: 500 }
    );
  }
}

// Background task creation function
async function startBackgroundTaskCreation(jobId: string) {
  setTimeout(async () => {
    try {
      console.log(`Starting background task creation for job: ${jobId}`);
      const job = await jobStorage.get(jobId);
      if (!job || !job.boardData) {
        console.log(`Job not found or missing boardData: ${jobId}`);
        return;
      }
      console.log(`Found job for background processing:`, job.id, job.status);

      const { tasks, storyId, boardId } = job.boardData;

      await updateJobStatus(jobId, 'GENERATING_TASKS', 10, 'Validating data...');

      // Validate story exists
      const story = await prisma.story.findFirst({
        where: {
          id: storyId,
          workspaceId: job.workspaceId
        }
      });

      if (!story) {
        await updateJobStatus(jobId, 'FAILED', 0, 'Story not found');
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

      // Find the "To Do" or first available column
      const toDoColumn = taskBoard.columns.find(col => 
        col.name.toLowerCase() === 'to do' || 
        col.name.toLowerCase() === 'todo' ||
        col.name.toLowerCase() === 'backlog'
      ) || taskBoard.columns[0];

      if (!toDoColumn) {
        await updateJobStatus(jobId, 'FAILED', 0, 'No columns found in task board');
        return;
      }

      await updateJobStatus(jobId, 'GENERATING_TASKS', 30, 'Creating tasks...');

      // Create tasks
      const createdTasks = [];
      let position = 0;
      const totalTasks = tasks.length;

      for (let i = 0; i < tasks.length; i++) {
        const taskData = tasks[i];
        const progress = 30 + Math.floor((i / totalTasks) * 60);
        
        await updateJobStatus(jobId, 'GENERATING_TASKS', progress, `Creating task ${i + 1}/${totalTasks}: ${taskData.title}`);

        try {
          // Parse description if it's HTML
          const description = taskData.description || "";

          // Parse estimate to days
          const estimateMatch = taskData.estimate?.match(/(\d+)\s*days?/i);
          const estimateDays = estimateMatch ? parseInt(estimateMatch[1]) : 1;

          // Calculate due date based on estimate
          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + estimateDays);

          const task = await prisma.task.create({
            data: {
              title: taskData.title,
              description: description,
              type: taskData.type || "TASK",
              priority: taskData.priority?.toUpperCase() || "MEDIUM",
              status: toDoColumn.name,
              position: position++,
              dueDate: dueDate,
              taskBoardId: boardId,
              columnId: toDoColumn.id,
              workspaceId: job.workspaceId,
              storyId: storyId,
              reporterId: job.userId,
              assigneeId: job.userId,
            },
            include: {
              assignee: true,
              reporter: true,
              column: true,
              story: true,
            }
          });

          createdTasks.push(task);

          // Small delay to prevent overwhelming the database
          await new Promise(resolve => setTimeout(resolve, 100));

        } catch (taskError) {
          console.error(`Error creating task: ${taskData.title}`, taskError);
          // Continue with other tasks even if one fails
        }
      }

      await updateJobStatus(jobId, 'COMPLETED', 100, `Successfully created ${createdTasks.length} tasks!`);

      // Update job with created tasks
      const updatedJob = await jobStorage.get(jobId);
      if (updatedJob) {
        updatedJob.boardData = { ...updatedJob.boardData, createdTasks };
        await jobStorage.set(updatedJob);
      }

    } catch (error) {
      console.error('Background task creation error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await updateJobStatus(jobId, 'FAILED', 0, `Error: ${errorMessage}`);
    }
  }, 100);
}

async function updateJobStatus(jobId: string, status: JobStatus['status'], progress: number, currentStep: string) {
  const job = await jobStorage.get(jobId);
  if (job) {
    job.status = status;
    job.progress = progress;
    job.currentStep = currentStep;
    job.updatedAt = new Date();
    await jobStorage.set(job);
  }
} 