import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { jobStorage, JobStatus } from '@/lib/job-storage';

function useMockData() {
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
      const boardId = await createBoardFromData(job.workspaceId, job.userId, fullBoardData);
      
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

async function generateMilestones(description: string, projectType?: string, teamSize?: string, userId?: string) {
  if (useMockData()) {
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
  const systemPrompt = `You are a senior product manager, business analyst, and technical lead. Your task is to deeply analyse the following end user requirement for a whole product and deliver:

1. Milestones: High-level deliverables/phases, with description, estimate, criteria, stakeholders.

Tech stack: React, Node.js, .NET Core/MVC, PostgreSQL, SQL Server, Redis, DuckDB, Elasticsearch, NoSQL DB, Qdrant. Prefer self-hosted/dockerized solutions.

Format: Return ONLY a JSON array of milestones with this exact format:
[
  {
    "title": "Milestone name",
    "description": "Detailed description",
    "estimate": "Time/cost estimate",
    "acceptanceCriteria": "Key acceptance criteria",
    "stakeholders": ["role1", "role2"],
    "startDate": "2024-01-01",
    "endDate": "2024-01-31",
    "assignedUsers": ["${userEmail}"]
  }
]
IMPORTANT: Return ONLY the JSON array, no markdown formatting, no explanations.`;
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAPI_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: description }
      ],
      temperature: 0.7,
      max_tokens: 2000,
    }),
  });
  const data = await response.json();
  let content = data.choices[0].message.content.trim();
  content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  if (!content.startsWith('[') || !content.endsWith(']')) {
    console.error('Invalid JSON format - content:');
    console.error(content);
    throw new Error('ChatGPT returned invalid JSON format');
  }
  try {
    const milestones = JSON.parse(content);
    milestones.forEach((milestone: any) => {
      if (!milestone.assignedUsers || !Array.isArray(milestone.assignedUsers)) {
        milestone.assignedUsers = [userEmail];
      } else {
        milestone.assignedUsers = milestone.assignedUsers.map((email: string) => email.includes('@example.com') ? userEmail : email);
      }
    });
    return milestones;
  } catch (error) {
    console.error('Failed to parse milestones JSON:');
    console.error(content);
    console.error('Parse error:');
    console.error(error);
    throw new Error('Failed to generate valid milestones data');
  }
}

async function generateEpics(description: string, milestones: any[], projectType?: string, userId?: string) {
  if (useMockData()) {
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
  const systemPrompt = `You are a senior product manager, business analyst, and technical lead. Your task is to deeply analyse the following end user requirement for a whole product and deliver:

2. Epics: Break each milestone into major functional/technical areas or objectives. For each epic, provide:
- Description
- High-level technical solution/architecture overview (including recommendations for tech stack or new tools/platforms, if any)
- Estimated effort/cost

Tech stack: React, Node.js, .NET Core/MVC, PostgreSQL, SQL Server, Redis, DuckDB, Elasticsearch, NoSQL DB, Qdrant. Prefer self-hosted/dockerized solutions.

Format: Return ONLY a JSON array of epics with this exact format:
[
  {
    "title": "Epic name",
    "description": "Detailed description",
    "milestoneIndex": 0,
    "priority": "high",
    "solution": "High-level technical solution/architecture overview",
    "estimate": "Effort/cost estimate",
    "assignedUsers": ["${userEmail}"]
  }
]
IMPORTANT: Return ONLY the JSON array, no markdown formatting, no explanations.`;
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAPI_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: description },
        { role: 'user', content: `Milestones: ${JSON.stringify(milestones, null, 2)}` }
      ],
      temperature: 0.7,
      max_tokens: 2000,
    }),
  });
  const data = await response.json();
  let content = data.choices[0].message.content.trim();
  content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  if (!content.startsWith('[') || !content.endsWith(']')) {
    console.error('Invalid JSON format - content:');
    console.error(content);
    throw new Error('ChatGPT returned invalid JSON format');
  }
  try {
    const epics = JSON.parse(content);
    epics.forEach((epic: any) => {
      if (!epic.assignedUsers || !Array.isArray(epic.assignedUsers)) {
        epic.assignedUsers = [userEmail];
      } else {
        epic.assignedUsers = epic.assignedUsers.map((email: string) => email.includes('@example.com') ? userEmail : email);
      }
    });
    return epics;
  } catch (error) {
    console.error('Failed to parse epics JSON:');
    console.error(content);
    console.error('Parse error:');
    console.error(error);
    throw new Error('Failed to generate valid epics data');
  }
}

async function generateStories(description: string, epics: any[], projectType?: string, userId?: string) {
  if (useMockData()) {
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
  const systemPrompt = `You are a senior product manager, business analyst, and technical lead. Your task is to deeply analyse the following end user requirement for a whole product and deliver:

### 3. User Stories

For each Epic listed below, break it down into several INVEST-compliant user stories.

For **each user story**, provide:

- **Story ID**
- **Role** (As a…)
- **Goal** (I want to…)
- **Reason** (So that…)
- **Acceptance Criteria** (clear, testable, in bullet points)
- **Story Points / Effort Estimate** (e.g., 1-8 points, or XS/S/M/L/XL)
- **Non-functional Requirements** (performance, security, compliance, UX, accessibility, etc.)
- **Relevant Visuals/Diagrams** (describe user flow, API contract, architecture, or UI wireframe)
- **Technical Notes** (if any edge case, integration, or dependency exists)

**Tech stack:** React, Node.js, .NET Core/MVC, PostgreSQL, SQL Server, Redis, DuckDB, Elasticsearch, NoSQL DB, Qdrant. Prefer self-hosted/dockerized solutions.

**Format your response in Markdown, with clear headings for each Epic and Story.**

If any information is missing or unclear, list your clarification questions first before providing stories.

---
**Input:**  
- End User Requirement: ${description}
- Epics: ${JSON.stringify(epics, null, 2)}

Format: Return ONLY a JSON array of user stories with this exact format:
[
  {
    "title": "Story title",
    "description": "Detailed description",
    "epicIndex": 0,
    "priority": "medium",
    "acceptanceCriteria": "Acceptance criteria",
    "storyPoints": 3,
    "nonFunctional": "Non-functional requirements",
    "visuals": "Visuals/diagrams (describe or markdown image links)",
    "assignedUsers": ["${userEmail}"]
  }
]
IMPORTANT: Return ONLY the JSON array, no markdown formatting, no explanations.`;
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAPI_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: description },
        { role: 'user', content: `Epics: ${JSON.stringify(epics, null, 2)}` }
      ],
      temperature: 0.7,
      max_tokens: 2000,
    }),
  });
  const data = await response.json();
  let content = data.choices[0].message.content.trim();
  content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  if (!content.startsWith('[') || !content.endsWith(']')) {
    console.error('Invalid JSON format - content:');
    console.error(content);
    throw new Error('ChatGPT returned invalid JSON format');
  }
  try {
    const stories = JSON.parse(content);
    stories.forEach((story: any) => {
      if (!story.assignedUsers || !Array.isArray(story.assignedUsers)) {
        story.assignedUsers = [userEmail];
      } else {
        story.assignedUsers = story.assignedUsers.map((email: string) => email.includes('@example.com') ? userEmail : email);
      }
    });
    return stories;
  } catch (error) {
    console.error('Failed to parse stories JSON:');
    console.error(content);
    console.error('Parse error:');
    console.error(error);
    throw new Error('Failed to generate valid stories data');
  }
}

async function generateTasks(description: string, stories: any[], projectType?: string, userId?: string) {
  if (useMockData()) {
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
  const systemPrompt = `You are a senior product manager, business analyst, and technical lead. Your task is to deeply analyse the following end user requirement for a whole product and deliver:

4. Tasks & Sub-tasks: Break each user story into detailed technical and design tasks, and further into sub-tasks as needed. For every task:
- Title & Description
- Inputs/outputs
- Dependencies
- Responsible skillset/role (e.g., React dev, Node dev, designer, DBA, DevOps)
- Time/cost estimate
- References to relevant code patterns, docs, or best practices

Tech stack: React, Node.js, .NET Core/MVC, PostgreSQL, SQL Server, Redis, DuckDB, Elasticsearch, NoSQL DB, Qdrant. Prefer self-hosted/dockerized solutions.

Format: Return ONLY a JSON array of tasks with this exact format:
[
  {
    "title": "Task title",
    "description": "Detailed task description",
    "storyIndex": 0,
    "priority": "medium",
    "type": "development",
    "storyPoints": 3,
    "inputs": "Inputs",
    "outputs": "Outputs",
    "dependencies": "Dependencies",
    "role": "Responsible skillset/role",
    "estimate": "Time/cost estimate",
    "references": "References to code/docs/best practices",
    "assignedUsers": ["${userEmail}"],
    "labels": ["backend", "api"]
  }
]
IMPORTANT: Return ONLY the JSON array, no markdown formatting, no explanations.`;
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAPI_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: description },
        { role: 'user', content: `Stories: ${JSON.stringify(stories, null, 2)}` }
      ],
      temperature: 0.7,
      max_tokens: 3000,
    }),
  });
  const data = await response.json();
  let content = data.choices[0].message.content.trim();
  content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  if (!content.startsWith('[') || !content.endsWith(']')) {
    console.error('Invalid JSON format - content:');
    console.error(content);
    throw new Error('ChatGPT returned invalid JSON format');
  }
  try {
    const tasks = JSON.parse(content);
    tasks.forEach((task: any) => {
      if (!task.assignedUsers || !Array.isArray(task.assignedUsers)) {
        task.assignedUsers = [userEmail];
      } else {
        task.assignedUsers = task.assignedUsers.map((email: string) => email.includes('@example.com') ? userEmail : email);
      }
    });
    return tasks;
  } catch (error) {
    console.error('Failed to parse tasks JSON:');
    console.error(content);
    console.error('Parse error:');
    console.error(error);
    throw new Error('Failed to generate valid tasks data');
  }
}

async function createBoardFromData(workspaceId: string, userId: string, boardData: any) {
  // Use the user's prompt/description as the board name (shortened)
  const prompt = (boardData.description || '').trim() || 'Untitled';
  const shortPrompt = prompt.length > 32 ? prompt.slice(0, 32) + '...' : prompt;
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const board = await prisma.taskBoard.create({
    data: {
      name: `${shortPrompt} - ${uniqueSuffix}`,
      description: `Generated from: ${prompt}`,
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