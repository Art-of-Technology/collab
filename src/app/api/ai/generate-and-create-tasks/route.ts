import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { jobStorage, JobStatus } from '@/lib/job-storage';
import { prisma } from '@/lib/prisma';
import { AI_PROMPTS } from '@/lib/ai-prompts';

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { storyId, boardId, workspaceId } = await request.json();

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

    // Get story details
    const story = await prisma.story.findFirst({
      where: {
        id: storyId,
        workspaceId: workspaceId
      },
      include: {
        epic: {
          include: {
            milestone: true
          }
        }
      }
    });

    if (!story) {
      return NextResponse.json({ error: 'Story not found' }, { status: 404 });
    }

    // Create background job
    const jobId = `task_job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const job: JobStatus = {
      id: jobId,
      userId: session.user.id,
      workspaceId,
      description: `Generating and creating tasks for story: ${story.title}`,
      status: 'PENDING',
      progress: 0,
      currentStep: 'Initializing AI task generation...',
      boardData: { 
        storyId, 
        boardId, 
        storyTitle: story.title,
        storyDescription: story.description,
        epicTitle: story.epic?.title,
        milestoneTitle: story.epic?.milestone?.title
      },
      boardId: boardId,
      error: undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    await jobStorage.set(job);

    console.log(`AI task generation job created with ID: ${jobId}`);

    // Start background process
    startBackgroundAITaskGeneration(jobId);

    return NextResponse.json({ 
      success: true, 
      jobId: jobId,
      message: 'AI task generation started'
    });

  } catch (error) {
    console.error('Error starting AI task generation:', error);
    return NextResponse.json(
      { error: 'Failed to start AI task generation' },
      { status: 500 }
    );
  }
}

// Background AI task generation and creation function
async function startBackgroundAITaskGeneration(jobId: string) {
  setTimeout(async () => {
    try {
      console.log(`Starting background AI task generation for job: ${jobId}`);
      const job = await jobStorage.get(jobId);
      if (!job || !job.boardData) {
        console.log(`Job not found or missing boardData: ${jobId}`);
        return;
      }

      const { storyId, boardId, storyTitle, storyDescription, epicTitle, milestoneTitle } = job.boardData;

      // Step 1: Generate tasks with AI
      await updateJobStatus(jobId, 'GENERATING_TASKS', 10, 'Generating tasks with AI...');

      const prompt = `${AI_PROMPTS.TASKS}

Story Context:
- Title: ${storyTitle}
- Description: ${storyDescription || 'No description provided'}
${epicTitle ? `- Epic: ${epicTitle}` : ''}
${milestoneTitle ? `- Milestone: ${milestoneTitle}` : ''}

Please generate tasks for this story. Focus on breaking down the story into actionable development tasks.`;

      console.log('Sending AI request for task generation...');
      
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAPI_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [
            {
              role: 'system',
              content: 'You are a helpful assistant that generates development tasks based on user stories. Always respond with valid JSON only.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 2000,
        }),
      });

      if (!response.ok) {
        throw new Error(`AI API request failed: ${response.statusText}`);
      }

      await updateJobStatus(jobId, 'GENERATING_TASKS', 30, 'Processing AI response...');

      const aiResponse = await response.json();
      const content = aiResponse.choices[0]?.message?.content;

      if (!content) {
        throw new Error('No content received from AI');
      }

      // Parse AI response
      let generatedTasks;
      try {
        // Clean up the response to extract JSON
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
          throw new Error('No JSON array found in AI response');
        }
        generatedTasks = JSON.parse(jsonMatch[0]);
      } catch (parseError) {
        console.error('Error parsing AI response:', parseError);
        throw new Error('Failed to parse AI response');
      }

      if (!Array.isArray(generatedTasks) || generatedTasks.length === 0) {
        throw new Error('AI did not generate any valid tasks');
      }

      await updateJobStatus(jobId, 'GENERATING_TASKS', 50, `Generated ${generatedTasks.length} tasks, now creating them...`);

      // Step 2: Validate story and board
      const story = await prisma.story.findFirst({
        where: {
          id: storyId,
          workspaceId: job.workspaceId
        }
      });

      if (!story) {
        throw new Error('Story not found');
      }

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
        throw new Error('Task board not found');
      }

      // Find the "To Do" or first available column
      const toDoColumn = taskBoard.columns.find(col => 
        col.name.toLowerCase() === 'to do' || 
        col.name.toLowerCase() === 'todo' ||
        col.name.toLowerCase() === 'backlog'
      ) || taskBoard.columns[0];

      if (!toDoColumn) {
        throw new Error('No columns found in task board');
      }

      // Step 3: Create tasks
      const createdTasks = [];
      let position = 0;
      const totalTasks = generatedTasks.length;

      for (let i = 0; i < generatedTasks.length; i++) {
        const taskData = generatedTasks[i];
        const progress = 50 + Math.floor((i / totalTasks) * 45);
        
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

      await updateJobStatus(jobId, 'COMPLETED', 100, `Successfully generated and created ${createdTasks.length} tasks!`);

      // Update job with created tasks
      const updatedJob = await jobStorage.get(jobId);
      if (updatedJob) {
        updatedJob.boardData = { ...updatedJob.boardData, createdTasks, generatedTasks };
        await jobStorage.set(updatedJob);
      }

    } catch (error) {
      console.error('Background AI task generation error:', error);
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