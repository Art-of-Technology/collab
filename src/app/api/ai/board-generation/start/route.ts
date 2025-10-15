import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { jobStorage, JobStatus } from '@/lib/job-storage';
import { AI_PROMPTS, AI_TOKEN_LIMITS, AI_CONFIG } from '@/lib/ai-prompts';

function mockData() {
  return false; //use for production testing
 //   return process.env.NODE_ENV === 'development';
}


export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { description, projectType, teamSize, workspaceId } = await request.json();

    if (!description || !workspaceId) {
      return NextResponse.json(
        { error: 'Description and workspace ID are required' },
        { status: 400 }
      );
    }

    // Create board generation job (in-memory for now)
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Validate jobId is not undefined
    if (!jobId) {
      throw new Error('Failed to generate job ID');
    }
    
    const job: JobStatus = {
      id: jobId,
      userId: session.user.id,
      workspaceId,
      description,
      projectType,
      teamSize,
      status: 'PENDING',
      progress: 0,
      currentStep: 'Initializing...',
      boardData: undefined,
      boardId: undefined,
      error: undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    await jobStorage.set(job);

    console.log(`Job created with ID: ${jobId}`);
    const allJobs = await jobStorage.getAll();
    console.log('All jobs:');
    console.log(allJobs);

    // Start background process (we'll trigger it immediately)
    // In a real production environment, you might use a job queue like Bull/Agenda
    startBackgroundGeneration(job.id);

    return NextResponse.json({ 
      success: true, 
      jobId: job.id,
      message: 'Board generation started'
    });

  } catch (error) {
    console.error('Error starting board generation:');
    console.error(error);
    return NextResponse.json(
      { error: 'Failed to start board generation' },
      { status: 500 }
    );
  }
}

// Background generation function
async function startBackgroundGeneration(jobId: string) {
  // Run this in background without blocking the response
  setTimeout(async () => {
    try {
      const job = await jobStorage.get(jobId);
      if (!job) return;

      // Step 1: Generate Milestones
      await updateJobStatus(jobId, 'GENERATING_MILESTONES', 10, 'Generating milestones...');
      const milestones = await generateMilestones(job.description, job.projectType, job.teamSize, job.userId);
      
      await updateJobBoardData(jobId, { milestones });
      
      // Step 2: Generate Epics
      await updateJobStatus(jobId, 'GENERATING_EPICS', 30, 'Generating epics...');
      const epics = await generateEpics(job.description, milestones, job.projectType, job.userId);
      
      await updateJobBoardData(jobId, { milestones, epics });

      // Step 3: Generate Stories
      await updateJobStatus(jobId, 'GENERATING_STORIES', 60, 'Generating stories...');
      const stories = await generateStories(job.description, epics, job.projectType, job.userId);
      
      await updateJobBoardData(jobId, { milestones, epics, stories });

      // Step 4: Generate Tasks
      await updateJobStatus(jobId, 'GENERATING_TASKS', 80, 'Generating tasks...');
      const tasks = await generateTasks(job.description, stories, job.projectType, job.userId);
      
      const fullBoardData = { milestones, epics, stories, tasks };
      await updateJobBoardData(jobId, fullBoardData);

      // Step 5: Create Board and Import
      await updateJobStatus(jobId, 'COMPLETED', 90, 'Creating board...');
      const boardId = await createBoardFromData(job.workspaceId, job.userId, job.description, fullBoardData);
      
      await updateJobStatus(jobId, 'COMPLETED', 100, 'Board created successfully!', boardId);

    } catch (error) {
      console.error('Background generation error:');
      console.error(error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await updateJobStatus(jobId, 'FAILED', 0, `Error: ${errorMessage}`);
    }
  }, 100); // Start immediately but don't block response
}

async function updateJobStatus(jobId: string, status: JobStatus['status'], progress: number, currentStep: string, boardId?: string) {
  const job = await jobStorage.get(jobId);
  if (job) {
    job.status = status;
    job.progress = progress;
    job.currentStep = currentStep;
    if (boardId) job.boardId = boardId;
    job.updatedAt = new Date();
    await jobStorage.set(job);
  }
}

async function updateJobBoardData(jobId: string, boardData: any) {
  const job = await jobStorage.get(jobId);
  if (job) {
    job.boardData = boardData;
    job.updatedAt = new Date();
    await jobStorage.set(job);
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Enhanced AI generation with streaming and completion handling
async function generateWithAI(
  systemPrompt: string, 
  userMessages: Array<{role: string, content: string}>, 
  maxTokens: number = 4000,
  maxRetries: number = AI_CONFIG.MAX_RETRIES
): Promise<string> {
  let attempt = 0;
  let fullContent = '';
  const conversation = [...userMessages];

  while (attempt < maxRetries) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: AI_CONFIG.MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            ...conversation
          ],
          temperature: AI_CONFIG.TEMPERATURE,
          max_tokens: maxTokens,
        }),
      });

      const data = await response.json();
      
      if (!data.choices || !data.choices[0]) {
        throw new Error('Invalid API response structure');
      }

      const choice = data.choices[0];
      const content = choice.message?.content || '';
      const finishReason = choice.finish_reason;

      // Accumulate content
      if (attempt === 0) {
        fullContent = content;
      } else {
        // For continuation requests, append content
        fullContent += content;
      }

      console.log(`Attempt ${attempt + 1}: finish_reason=${finishReason}, content_length=${content.length}`);

      // Check if response was truncated due to length
      if (finishReason === 'length') {
        console.log('Response truncated due to length, requesting continuation...');
        
        // Add the incomplete response and ask for continuation
        conversation.push({ role: 'assistant', content: content });
        conversation.push({ 
          role: 'user', 
          content: 'Please continue your response from where you left off. Return ONLY the continuation of the JSON data, no explanations.' 
        });
        
        attempt++;
        continue;
      }

      // Response completed successfully
      if (finishReason === 'stop') {
        console.log('Response completed successfully');
        break;
      }

      // Other finish reasons (content_filter, etc.)
      if (finishReason) {
        console.warn(`Unexpected finish_reason: ${finishReason}`);
        break;
      }

    } catch (error) {
      console.error(`AI generation attempt ${attempt + 1} failed:`, error);
      attempt++;
      
      if (attempt >= maxRetries) {
        throw new Error(`AI generation failed after ${maxRetries} attempts: ${error}`);
      }
      
      // Wait before retry
      await sleep(1000 * attempt);
    }
  }

  return fullContent.trim();
}

// Enhanced JSON parsing with validation and retry
async function parseAIResponse<T>(
  content: string, 
  expectedStructure: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _retryPrompt?: string
): Promise<T> {
  // Clean up content
  let cleanContent = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  
  // Handle multiple JSON blocks (in case of continuation)
  if (cleanContent.includes('}\n{') || cleanContent.includes(']\n[')) {
    // Try to merge JSON blocks
    cleanContent = cleanContent.replace(/}\s*{/g, '},{').replace(/]\s*\[/g, ',');
  }

  // Validate JSON structure
  if (expectedStructure === 'array' && (!cleanContent.startsWith('[') || !cleanContent.endsWith(']'))) {
    console.warn('Invalid JSON array format, attempting to fix...');
    if (!cleanContent.startsWith('[')) cleanContent = '[' + cleanContent;
    if (!cleanContent.endsWith(']')) cleanContent = cleanContent + ']';
  }

  try {
    const parsed = JSON.parse(cleanContent);
    console.log(`Successfully parsed JSON with ${Array.isArray(parsed) ? parsed.length : 'object'} items`);
    return parsed;
  } catch (error) {
    console.error('JSON Parse Error:', error);
    console.error('Content that failed to parse:', cleanContent.substring(0, 500) + '...');
    
    // Try to fix common issues
    const fixes = [
      // Remove trailing commas
      () => cleanContent.replace(/,(\s*[}\]])/g, '$1'),
      // Fix unescaped quotes
      () => cleanContent.replace(/([^\\])"/g, '$1\\"'),
      // Add missing closing brackets
      () => {
        const openBrackets = (cleanContent.match(/\[/g) || []).length;
        const closeBrackets = (cleanContent.match(/\]/g) || []).length;
        return cleanContent + ']'.repeat(Math.max(0, openBrackets - closeBrackets));
      }
    ];

    for (const fix of fixes) {
      try {
        const fixedContent = fix();
        const parsed = JSON.parse(fixedContent);
        console.log('Successfully fixed and parsed JSON');
        return parsed;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (_fixError) {
        // Continue to next fix
      }
    }

    throw new Error(`Failed to parse JSON after all fix attempts: ${error}`);
  }
}

async function generateMilestones(description: string, projectType?: string, teamSize?: string, userId?: string) {
  if (mockData()) {
    await sleep(1500);
    return [
      {
        title: "Dummy Milestone",
        description: "This is a dummy milestone.",
        startDate: "2024-08-01",
        endDate: "2024-08-31",
        assignedUsers: ["dummy@user.com"]
      }
    ];
  }
  let userEmail = "user@example.com";
  if (userId) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (user?.email) userEmail = user.email;
  }
  // Use enhanced AI generation with high token limit for comprehensive milestones
  const content = await generateWithAI(
    AI_PROMPTS.MILESTONES(userEmail),
    [
      { role: 'user', content: description }
    ],
    AI_TOKEN_LIMITS.MILESTONES
  );

  // Parse with enhanced error handling
  const milestones = await parseAIResponse<any[]>(content, 'array');
  
  // Ensure proper user assignment
  milestones.forEach((milestone: any) => {
    if (!milestone.assignedUsers || !Array.isArray(milestone.assignedUsers)) {
      milestone.assignedUsers = [userEmail];
    } else {
      milestone.assignedUsers = milestone.assignedUsers.map((email: string) => 
        email.includes('@example.com') ? userEmail : email
      );
    }
  });
  
  console.log(`Generated ${milestones.length} comprehensive milestones`);
  return milestones;
}

async function generateEpics(description: string, milestones: any[], projectType?: string, userId?: string) {
  if (mockData()) {
    await sleep(1500);
    return [
      {
        title: "Dummy Epic",
        description: "This is a dummy epic.",
        milestoneIndex: 0,
        priority: "high",
        assignedUsers: ["dummy@user.com"]
      }
    ];
  }
  let userEmail = "user@example.com";
  if (userId) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (user?.email) userEmail = user.email;
  }
  // Use enhanced AI generation with high token limit for detailed epics
  const content = await generateWithAI(
    AI_PROMPTS.EPICS(userEmail),
    [
      { role: 'user', content: description },
      { role: 'user', content: `Milestones: ${JSON.stringify(milestones, null, 2)}` }
    ],
    AI_TOKEN_LIMITS.EPICS
  );

  // Parse with enhanced error handling
  const epics = await parseAIResponse<any[]>(content, 'array');
  
  // Ensure proper user assignment
  epics.forEach((epic: any) => {
    if (!epic.assignedUsers || !Array.isArray(epic.assignedUsers)) {
      epic.assignedUsers = [userEmail];
    } else {
      epic.assignedUsers = epic.assignedUsers.map((email: string) => 
        email.includes('@example.com') ? userEmail : email
      );
    }
  });
  
  console.log(`Generated ${epics.length} comprehensive epics`);
  return epics;
}

async function generateStories(description: string, epics: any[], projectType?: string, userId?: string) {
  if (mockData()) {
    await sleep(1500);
    return [
      {
        title: "Dummy Story",
        description: "This is a dummy story.",
        epicIndex: 0,
        priority: "medium",
        assignedUsers: ["dummy@user.com"]
      }
    ];
  }
  let userEmail = "user@example.com";
  if (userId) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (user?.email) userEmail = user.email;
  }
  // Use enhanced AI generation with high token limit for detailed stories
  const content = await generateWithAI(
    AI_PROMPTS.STORIES(userEmail),
    [
      { role: 'user', content: description },
      { role: 'user', content: `Epics: ${JSON.stringify(epics, null, 2)}` }
    ],
    AI_TOKEN_LIMITS.STORIES
  );

  // Parse with enhanced error handling
  const stories = await parseAIResponse<any[]>(content, 'array');
  
  // Ensure proper user assignment
  stories.forEach((story: any) => {
    if (!story.assignedUsers || !Array.isArray(story.assignedUsers)) {
      story.assignedUsers = [userEmail];
    } else {
      story.assignedUsers = story.assignedUsers.map((email: string) => 
        email.includes('@example.com') ? userEmail : email
      );
    }
  });
  
  console.log(`Generated ${stories.length} comprehensive stories`);
  return stories;
}

async function generateTasks(description: string, stories: any[], projectType?: string, userId?: string) {
  if (mockData()) {
    await sleep(1500);
    return [
      {
        title: "Dummy Task",
        description: "This is a dummy task.",
        storyIndex: 0,
        priority: "medium",
        type: "development",
        storyPoints: 3,
        assignedUsers: ["dummy@user.com"],
        labels: ["backend", "api"]
      }
    ];
  }
  let userEmail = "user@example.com";
  if (userId) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (user?.email) userEmail = user.email;
  }
  // Use enhanced AI generation with highest token limit for comprehensive tasks
  const content = await generateWithAI(
    AI_PROMPTS.TASKS(userEmail),
    [
      { role: 'user', content: description },
      { role: 'user', content: `Stories: ${JSON.stringify(stories, null, 2)}` }
    ],
    AI_TOKEN_LIMITS.TASKS
  );

  // Parse with enhanced error handling
  const tasks = await parseAIResponse<any[]>(content, 'array');
  
  // Ensure proper user assignment
  tasks.forEach((task: any) => {
    if (!task.assignedUsers || !Array.isArray(task.assignedUsers)) {
      task.assignedUsers = [userEmail];
    } else {
      task.assignedUsers = task.assignedUsers.map((email: string) => 
        email.includes('@example.com') ? userEmail : email
      );
    }
  });
  
  console.log(`Generated ${tasks.length} comprehensive tasks`);
  return tasks;
}

async function createBoardFromData(workspaceId: string, userId: string, description: string, boardData: any) {
  // Generate a professional board name using AI
  let boardName = 'AI Generated Board';
  try {
    console.log('Generating board name from description:', description);
    
    // Get user email for the prompt
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true }
    });
    const userEmail = user?.email || 'user@example.com';
    
    // Generate board name using AI
    const boardNameContent = await generateWithAI(
      AI_PROMPTS.BOARD_NAME(userEmail),
      [{ role: 'user', content: description }],
      AI_TOKEN_LIMITS.BOARD_NAME
    );
    
    boardName = boardNameContent.trim() || 'AI Generated Board';
    console.log('Generated board name:', boardName);
  } catch (error) {
    console.error('Failed to generate board name:', error);
    // Fall back to description-based naming
    const shortPrompt = description.length > 32 ? description.slice(0, 32) + '...' : description;
    boardName = shortPrompt || 'AI Generated Board';
  }

  const board = await prisma.taskBoard.create({
    data: {
      name: boardName,
      description: `Generated from: ${description}`,
      issuePrefix: 'AI',
      nextIssueNumber: 1,
      workspaceId,
      isDefault: false
    }
  });

  // Create default columns
  const columns = await Promise.all([
    { name: "Milestones", order: 0, color: "#8B5CF6" },
    { name: "Epics", order: 1, color: "#3B82F6" },
    { name: "Stories", order: 2, color: "#06B6D4" },
    { name: "To Do", order: 3, color: "#6366F1" },
    { name: "In Progress", order: 4, color: "#EC4899" },
    { name: "Review", order: 5, color: "#F59E0B" },
    { name: "Done", order: 6, color: "#10B981" },
  ].map(col =>
    prisma.taskColumn.create({
      data: {
        name: col.name,
        order: col.order,
        color: col.color,
        taskBoardId: board.id
      }
    })
  ));

  // Helper: get columnId by name
  const getColumnId = (name: string) => {
    const col = columns.find((c) => c.name === name);
    return col ? col.id : undefined;
  };

  // Insert milestones
  const milestoneRecords = await Promise.all((boardData.milestones || []).map(async (milestone: any, idx: number) => {
    let assigneeId: string | undefined = undefined;
    if (Array.isArray(milestone.assignedUsers) && milestone.assignedUsers.length > 0) {
      const userEmailOrId = milestone.assignedUsers[0];
      const user = await prisma.user.findFirst({
        where: {
          OR: [
            { id: userEmailOrId },
            { email: userEmailOrId }
          ]
        },
        select: { id: true }
      });
      if (user) assigneeId = user.id;
    }
    return prisma.milestone.create({
      data: {
        title: milestone.title,
        description: milestone.description || '',
        startDate: (milestone.startDate && !isNaN(Date.parse(milestone.startDate))) ? new Date(milestone.startDate) : undefined,
        dueDate: (milestone.endDate && !isNaN(Date.parse(milestone.endDate))) ? new Date(milestone.endDate) : undefined,
        position: idx,
        taskBoardId: board.id,
        workspaceId,
        columnId: getColumnId('Milestones'),
        assigneeId,
      }
    });
  }));

  // Insert epics
  const epicRecords = await Promise.all((boardData.epics || []).map(async (epic: any, idx: number) => {
    let assigneeId: string | undefined = undefined;
    if (Array.isArray(epic.assignedUsers) && epic.assignedUsers.length > 0) {
      const userEmailOrId = epic.assignedUsers[0];
      const user = await prisma.user.findFirst({
        where: {
          OR: [
            { id: userEmailOrId },
            { email: userEmailOrId }
          ]
        },
        select: { id: true }
      });
      if (user) assigneeId = user.id;
    }
    return prisma.epic.create({
      data: {
        title: epic.title,
        description: epic.description || '',
        milestoneId: typeof epic.milestoneIndex === 'number' && milestoneRecords[epic.milestoneIndex] ? milestoneRecords[epic.milestoneIndex].id : undefined,
        priority: epic.priority || 'medium',
        startDate: (epic.startDate && !isNaN(Date.parse(epic.startDate))) ? new Date(epic.startDate) : undefined,
        dueDate: (epic.endDate && !isNaN(Date.parse(epic.endDate))) ? new Date(epic.endDate) : undefined,
        position: idx,
        taskBoardId: board.id,
        workspaceId,
        columnId: getColumnId('Epics'),
        assigneeId,
      }
    });
  }));

  // Insert stories
  const storyRecords = await Promise.all((boardData.stories || []).map(async (story: any, idx: number) => {
    let assigneeId: string | undefined = undefined;
    if (Array.isArray(story.assignedUsers) && story.assignedUsers.length > 0) {
      const userEmailOrId = story.assignedUsers[0];
      const user = await prisma.user.findFirst({
        where: {
          OR: [
            { id: userEmailOrId },
            { email: userEmailOrId }
          ]
        },
        select: { id: true }
      });
      if (user) assigneeId = user.id;
    }
    return prisma.story.create({
      data: {
        title: story.title,
        description: story.description || '',
        epicId: typeof story.epicIndex === 'number' && epicRecords[story.epicIndex] ? epicRecords[story.epicIndex].id : undefined,
        priority: story.priority || 'medium',
        type: story.type || 'user-story',
        storyPoints: story.storyPoints || undefined,
        position: idx,
        taskBoardId: board.id,
        workspaceId,
        columnId: getColumnId('Stories'),
        assigneeId,
      }
    });
  }));

  // Insert tasks
  await Promise.all((boardData.tasks || []).map(async (task: any, idx: number) => {
    let assigneeId: string | undefined = undefined;
    if (Array.isArray(task.assignedUsers) && task.assignedUsers.length > 0) {
      const userEmailOrId = task.assignedUsers[0];
      const user = await prisma.user.findFirst({
        where: {
          OR: [
            { id: userEmailOrId },
            { email: userEmailOrId }
          ]
        },
        select: { id: true }
      });
      if (user) assigneeId = user.id;
    }
    await prisma.task.create({
      data: {
        title: task.title,
        description: task.description || '',
        storyId: typeof task.storyIndex === 'number' && storyRecords[task.storyIndex] ? storyRecords[task.storyIndex].id : undefined,
        priority: task.priority || 'medium',
        type: task.type || 'task',
        storyPoints: task.storyPoints || undefined,
        dueDate: (task.dueDate && !isNaN(Date.parse(task.dueDate))) ? new Date(task.dueDate) : undefined,
        position: idx,
        taskBoardId: board.id,
        workspaceId,
        columnId: getColumnId('To Do'),
        assigneeId,
      }
    });
  }));

  return board.id;
} 