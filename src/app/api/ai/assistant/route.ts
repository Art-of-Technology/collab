import axios from "axios";
import { getCurrentUser } from "@/lib/session";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Define the function specs for AI to use
const functionSpecs = [
  {
    name: "createTask",
    description: "Create a new task in the specified workspace and board",
    parameters: {
      type: "object",
      properties: {
        title: { 
          type: "string",
          description: "The title of the task" 
        },
        description: { 
          type: "string",
          description: "The detailed description of the task" 
        },
        priority: { 
          type: "string",
          description: "The priority level of the task",
          enum: ["LOW", "MEDIUM", "HIGH"]
        },
        type: { 
          type: "string",
          description: "The type of task",
          enum: ["TASK", "BUG", "FEATURE", "IMPROVEMENT"]
        },
        workspaceId: { 
          type: "string",
          description: "The ID of the workspace where the task will be created" 
        },
        taskBoardId: { 
          type: "string",
          description: "The ID of the task board where the task will be created" 
        },
        assigneeId: { 
          type: "string",
          description: "The user ID of the person assigned to the task"
        },
        dueDate: { 
          type: "string",
          description: "The due date for the task in ISO format (YYYY-MM-DD)"
        }
      },
      required: ["title", "workspaceId"]
    }
  },
  {
    name: "listWorkspaces",
    description: "List all workspaces the user has access to",
    parameters: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "listBoards",
    description: "List all boards in a specific workspace",
    parameters: {
      type: "object",
      properties: {
        workspaceId: { 
          type: "string", 
          description: "The ID of the workspace to list boards for"
        }
      },
      required: ["workspaceId"]
    }
  },
  {
    name: "listTasks",
    description: "List tasks based on filters",
    parameters: {
      type: "object",
      properties: {
        workspaceId: { 
          type: "string", 
          description: "The ID of the workspace to list tasks for"
        },
        status: { 
          type: "string", 
          description: "Filter by task status",
          enum: ["TODO", "IN_PROGRESS", "DONE"]
        },
        priority: { 
          type: "string", 
          description: "Filter by priority",
          enum: ["LOW", "MEDIUM", "HIGH"]
        },
        assigneeId: { 
          type: "string", 
          description: "Filter by assignee ID"
        },
        limit: { 
          type: "number", 
          description: "Maximum number of tasks to return (default 10)" 
        }
      },
      required: ["workspaceId"]
    }
  },
  {
    name: "summarizeTasks",
    description: "Summarize completed tasks in a workspace",
    parameters: {
      type: "object",
      properties: {
        workspaceId: { 
          type: "string", 
          description: "The ID of the workspace to summarize tasks for" 
        },
        timeframe: { 
          type: "string", 
          description: "The timeframe to summarize (today, week, month)",
          enum: ["today", "week", "month"]
        }
      },
      required: ["workspaceId", "timeframe"]
    }
  },
  {
    name: "getUserActivities",
    description: "Get a user's recent activities (posts and tasks) across all workspaces",
    parameters: {
      type: "object",
      properties: {
        nameQuery: { 
          type: "string", 
          description: "The name or partial name of the user to search for" 
        },
        timeframe: { 
          type: "string", 
          description: "The timeframe to check (today, week, month)",
          enum: ["today", "week", "month"]
        }
      },
      required: ["nameQuery"]
    }
  }
];

// Function to handle the AI request with function calling
async function callAssistantAPI(userId: string, message: string, contextMessages: any[]) {
  const apiKey = process.env.OPENAPI_KEY;
  
  if (!apiKey) {
    console.error('OpenAI API key is missing');
    return null;
  }
  
  const endpoint = 'https://api.openai.com/v1/chat/completions';

  // Build the messages array with context
  const messages = [
    {
      role: 'system',
      content: `You are a helpful task management assistant that helps users manage their tasks, projects, and workspaces. 
      You can create tasks, list workspaces and boards, summarize task progress, track user activities, and more.
      
      Your capabilities include:
      - Creating tasks in any workspace with different priorities and types
      - Listing available workspaces and boards
      - Showing tasks with various filters
      - Summarizing completed tasks for different timeframes
      - Tracking and reporting on what specific users are working on
      
      Always be concise and helpful. If you need more information to complete a request, ask the user.
      When creating tasks, make sure to get all necessary information like title, description, priority, etc.
      When asked about what someone is working on, try to search for them by name and show their recent activities.
      
      IMPORTANT: Always format your responses using markdown:
      - Use **bold** for emphasis and important information
      - Use headings (##, ###) for section titles
      - Use bullet points or numbered lists for multiple items
      - Use code blocks for IDs or technical information
      - Use tables when showing structured data like tasks
      
      This formatting will be rendered properly to the user.`
    },
    ...contextMessages,
    {
      role: 'user',
      content: message
    }
  ];

  try {
    const response = await axios.post(
      endpoint,
      {
        model: 'gpt-4-turbo',
        messages: messages,
        temperature: 0.7,
        functions: functionSpecs,
        function_call: 'auto',
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
      }
    );
    
    return response.data;
  } catch (error: any) {
    console.error('Error calling AI assistant:', error.response?.data || error.message);
    return null;
  }
}

// Implement the functions that the AI can call
async function handleFunctionCall(userId: string, functionName: string, args: any) {
  switch (functionName) {
    case "createTask":
      return await createTask(userId, args);
    case "listWorkspaces":
      return await listWorkspaces(userId);
    case "listBoards":
      return await listBoards(userId, args.workspaceId);
    case "listTasks":
      return await listTasks(userId, args);
    case "summarizeTasks":
      return await summarizeTasks(userId, args);
    case "getUserActivities":
      return await getUserActivities(userId, args);
    default:
      return { error: "Function not implemented" };
  }
}

// Create a new task
async function createTask(userId: string, args: any) {
  try {
    // Check if workspace exists and user has access
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: args.workspaceId,
        OR: [
          { ownerId: userId },
          { members: { some: { userId } } }
        ]
      }
    });

    if (!workspace) {
      return { error: "Workspace not found or you don't have access" };
    }

    // Prepare task data
    const taskData: any = {
      title: args.title,
      description: args.description || null,
      priority: args.priority || "MEDIUM",
      type: args.type || "TASK",
      status: "TODO",
      workspaceId: args.workspaceId,
      reporterId: userId,
    };

    // Add optional fields if provided
    if (args.assigneeId) {
      // Verify assignee is in workspace
      const isMember = await prisma.workspaceMember.findFirst({
        where: {
          workspaceId: args.workspaceId,
          userId: args.assigneeId
        }
      });

      if (isMember || workspace.ownerId === args.assigneeId) {
        taskData.assigneeId = args.assigneeId;
      } else {
        return { error: "Assignee is not a member of this workspace" };
      }
    }

    // Handle due date
    if (args.dueDate) {
      taskData.dueDate = new Date(args.dueDate);
    }

    // Add task board and column if provided
    if (args.taskBoardId) {
      const board = await prisma.taskBoard.findUnique({
        where: {
          id: args.taskBoardId,
          workspaceId: args.workspaceId
        },
        include: {
          columns: {
            orderBy: {
              order: 'asc'
            },
            take: 1
          }
        }
      });

      if (!board) {
        return { error: "Task board not found or doesn't belong to this workspace" };
      }

      taskData.taskBoardId = args.taskBoardId;
      
      // Use the first column if available
      if (board.columns && board.columns.length > 0) {
        taskData.columnId = board.columns[0].id;
      }

      // Generate issue key if board has a prefix
      if (board.issuePrefix) {
        // Update the board's next issue number
        const updatedBoard = await prisma.taskBoard.update({
          where: { id: board.id },
          data: { nextIssueNumber: { increment: 1 } },
          select: { issuePrefix: true, nextIssueNumber: true }
        });
        
        taskData.issueKey = `${board.issuePrefix}-${updatedBoard.nextIssueNumber - 1}`;
      }
    }

    // Create the task
    const task = await prisma.task.create({
      data: taskData,
      include: {
        assignee: {
          select: {
            id: true,
            name: true,
            image: true
          }
        },
        taskBoard: {
          select: {
            id: true,
            name: true
          }
        },
        column: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    return { 
      success: true, 
      task: {
        id: task.id,
        title: task.title,
        issueKey: task.issueKey,
        priority: task.priority,
        status: task.status,
        assignee: task.assignee,
        board: task.taskBoard,
        column: task.column
      } 
    };
  } catch (error) {
    console.error("Error creating task:", error);
    return { error: "Failed to create task" };
  }
}

// List workspaces the user has access to
async function listWorkspaces(userId: string) {
  try {
    const workspaces = await prisma.workspace.findMany({
      where: {
        OR: [
          { ownerId: userId },
          { members: { some: { userId } } }
        ]
      },
      select: {
        id: true,
        name: true,
        description: true,
        ownerId: true,
        createdAt: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return { workspaces };
  } catch (error) {
    console.error("Error listing workspaces:", error);
    return { error: "Failed to list workspaces" };
  }
}

// List boards in a workspace
async function listBoards(userId: string, workspaceId: string) {
  try {
    // Check if user has access to the workspace
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        OR: [
          { ownerId: userId },
          { members: { some: { userId } } }
        ]
      }
    });

    if (!workspace) {
      return { error: "Workspace not found or you don't have access" };
    }

    const boards = await prisma.taskBoard.findMany({
      where: {
        workspaceId
      },
      select: {
        id: true,
        name: true,
        description: true,
        issuePrefix: true,
        _count: {
          select: {
            tasks: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return { boards };
  } catch (error) {
    console.error("Error listing boards:", error);
    return { error: "Failed to list boards" };
  }
}

// List tasks with filtering
async function listTasks(userId: string, args: any) {
  try {
    // Check if user has access to the workspace
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: args.workspaceId,
        OR: [
          { ownerId: userId },
          { members: { some: { userId } } }
        ]
      }
    });

    if (!workspace) {
      return { error: "Workspace not found or you don't have access" };
    }

    // Build the query filters
    const where: any = {
      workspaceId: args.workspaceId
    };

    // Add optional filters
    if (args.status) {
      where.status = args.status;
    }

    if (args.priority) {
      where.priority = args.priority;
    }

    if (args.assigneeId) {
      where.assigneeId = args.assigneeId;
    }

    // Set limit with default
    const limit = args.limit || 10;

    const tasks = await prisma.task.findMany({
      where,
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        type: true,
        issueKey: true,
        createdAt: true,
        dueDate: true,
        assignee: {
          select: {
            id: true,
            name: true
          }
        },
        taskBoard: {
          select: {
            id: true,
            name: true
          }
        },
        column: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: [
        { status: 'asc' },
        { priority: 'desc' },
        { createdAt: 'desc' }
      ],
      take: limit
    });

    return { tasks };
  } catch (error) {
    console.error("Error listing tasks:", error);
    return { error: "Failed to list tasks" };
  }
}

// Summarize completed tasks
async function summarizeTasks(userId: string, args: any) {
  try {
    // Check if user has access to the workspace
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: args.workspaceId,
        OR: [
          { ownerId: userId },
          { members: { some: { userId } } }
        ]
      }
    });

    if (!workspace) {
      return { error: "Workspace not found or you don't have access" };
    }

    // Calculate date range based on timeframe
    const now = new Date();
    let startDate = new Date();
    
    if (args.timeframe === 'today') {
      startDate.setHours(0, 0, 0, 0);
    } else if (args.timeframe === 'week') {
      startDate.setDate(startDate.getDate() - 7);
    } else if (args.timeframe === 'month') {
      startDate.setMonth(startDate.getMonth() - 1);
    }

    // Get completed tasks
    const completedTasks = await prisma.task.findMany({
      where: {
        workspaceId: args.workspaceId,
        status: 'DONE',
        updatedAt: {
          gte: startDate,
          lte: now
        }
      },
      select: {
        id: true,
        title: true,
        priority: true,
        type: true,
        updatedAt: true,
        assignee: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });

    // Group tasks by assignee
    const tasksByAssignee: any = {};
    
    for (const task of completedTasks) {
      const assigneeName = task.assignee?.name || 'Unassigned';
      
      if (!tasksByAssignee[assigneeName]) {
        tasksByAssignee[assigneeName] = [];
      }
      
      tasksByAssignee[assigneeName].push(task);
    }

    // Build summary data
    const summary = {
      workspace: workspace.name,
      timeframe: args.timeframe,
      totalCompleted: completedTasks.length,
      byAssignee: tasksByAssignee,
      startDate: startDate.toISOString(),
      endDate: now.toISOString()
    };

    return { summary };
  } catch (error) {
    console.error("Error summarizing tasks:", error);
    return { error: "Failed to summarize tasks" };
  }
}

// Get user activities (tasks and posts)
async function getUserActivities(requestUserId: string, args: any) {
  try {
    const { nameQuery, timeframe = 'week' } = args;
    
    if (!nameQuery || typeof nameQuery !== 'string') {
      return { error: "User name query is required" };
    }
    
    // Calculate date range based on timeframe
    const now = new Date();
    let startDate = new Date();
    
    if (timeframe === 'today') {
      startDate.setHours(0, 0, 0, 0);
    } else if (timeframe === 'week') {
      startDate.setDate(startDate.getDate() - 7);
    } else if (timeframe === 'month') {
      startDate.setMonth(startDate.getMonth() - 1);
    }
    
    // Find users that match the query
    const users = await prisma.user.findMany({
      where: {
        name: {
          contains: nameQuery,
          mode: 'insensitive'
        }
      },
      select: {
        id: true,
        name: true,
        image: true,
        email: true,
        role: true
      },
      take: 5 // Limit to top 5 matches
    });
    
    if (users.length === 0) {
      return { error: `No users found matching "${nameQuery}"` };
    }
    
    // For each matching user, get their accessible workspaces
    const userIds = users.map(user => user.id);
    
    // Find workspaces for all matched users (where they are members or owners)
    const workspaces = await prisma.workspace.findMany({
      where: {
        OR: [
          { ownerId: { in: userIds } },
          { members: { some: { userId: { in: userIds } } } }
        ]
      },
      select: {
        id: true,
        name: true,
        ownerId: true
      }
    });
    
    // Validate requesting user has access to these workspaces
    const accessibleWorkspaces = await prisma.workspace.findMany({
      where: {
        id: { in: workspaces.map(w => w.id) },
        OR: [
          { ownerId: requestUserId },
          { members: { some: { userId: requestUserId } } }
        ]
      },
      select: {
        id: true
      }
    });
    
    const accessibleWorkspaceIds = accessibleWorkspaces.map(w => w.id);
    
    // If none of the workspaces are accessible, return error
    if (accessibleWorkspaceIds.length === 0) {
      return { error: "You don't have access to any workspaces where these users are active" };
    }
    
    // Get tasks assigned to or created by these users in accessible workspaces
    const tasks = await prisma.task.findMany({
      where: {
        workspaceId: { in: accessibleWorkspaceIds },
        OR: [
          { assigneeId: { in: userIds } },
          { reporterId: { in: userIds } }
        ],
        updatedAt: {
          gte: startDate,
          lte: now
        }
      },
      include: {
        assignee: {
          select: {
            id: true,
            name: true
          }
        },
        reporter: {
          select: {
            id: true,
            name: true
          }
        },
        workspace: {
          select: {
            id: true,
            name: true
          }
        },
        taskBoard: {
          select: {
            id: true,
            name: true
          }
        },
        column: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });
    
    // Get posts created by these users in accessible workspaces
    const posts = await prisma.post.findMany({
      where: {
        authorId: { in: userIds },
        workspaceId: { in: accessibleWorkspaceIds },
        createdAt: {
          gte: startDate,
          lte: now
        }
      },
      select: {
        id: true,
        message: true,
        type: true,
        createdAt: true,
        authorId: true,
        workspaceId: true,
        author: {
          select: {
            id: true,
            name: true
          }
        },
        workspace: {
          select: {
            id: true,
            name: true
          }
        },
        _count: {
          select: {
            comments: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    // Group activities by user
    const userActivities: Record<string, any> = {};
    
    // Process found users
    users.forEach(user => {
      userActivities[user.id] = {
        user: {
          id: user.id,
          name: user.name,
          email: user.email
        },
        tasks: {
          assigned: [],
          created: []
        },
        posts: []
      };
    });
    
    // Process tasks
    tasks.forEach(task => {
      // Add tasks assigned to users
      if (task.assigneeId && userIds.includes(task.assigneeId)) {
        const userData = userActivities[task.assigneeId];
        if (userData) {
          userData.tasks.assigned.push({
            id: task.id,
            title: task.title,
            status: task.status,
            priority: task.priority,
            type: task.type,
            updatedAt: task.updatedAt,
            workspace: task.workspace.name,
            board: task.taskBoard?.name || null,
            column: task.column?.name || null,
            issueKey: task.issueKey
          });
        }
      }
      
      // Add tasks created by users
      if (task.reporterId && userIds.includes(task.reporterId)) {
        const userData = userActivities[task.reporterId];
        if (userData) {
          userData.tasks.created.push({
            id: task.id,
            title: task.title,
            status: task.status,
            priority: task.priority,
            type: task.type,
            updatedAt: task.updatedAt,
            workspace: task.workspace.name,
            board: task.taskBoard?.name || null,
            column: task.column?.name || null,
            issueKey: task.issueKey
          });
        }
      }
    });
    
    // Process posts
    posts.forEach(post => {
      if (post.authorId && userIds.includes(post.authorId)) {
        const userData = userActivities[post.authorId];
        if (userData) {
          userData.posts.push({
            id: post.id,
            content: post.message,
            type: post.type,
            createdAt: post.createdAt,
            authorName: post.author?.name || 'Unknown',
            workspace: post.workspace?.name || 'Unknown',
            commentCount: post._count?.comments || 0
          });
        }
      }
    });
    
    // Convert to array for return
    const result = Object.values(userActivities);
    
    return { 
      timeframe,
      startDate: startDate.toISOString(),
      endDate: now.toISOString(),
      users: result
    };
  } catch (error) {
    console.error("Error getting user activities:", error);
    return { error: "Failed to retrieve user activities" };
  }
}

// Main API handler
export async function POST(req: Request) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }
    
    const body = await req.json();
    const { message, context = [] } = body;
    
    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }
    
    // Call the AI assistant
    const aiResponse = await callAssistantAPI(currentUser.id, message, context);
    
    if (!aiResponse) {
      return NextResponse.json(
        { error: "Failed to process request. Please try again." },
        { status: 500 }
      );
    }

    // Check if the response includes a function call
    if (aiResponse.choices && 
        aiResponse.choices[0].message && 
        aiResponse.choices[0].message.function_call) {
      
      const functionCall = aiResponse.choices[0].message.function_call;
      const functionName = functionCall.name;
      const functionArgs = JSON.parse(functionCall.arguments);

      // Execute the function
      const functionResult = await handleFunctionCall(
        currentUser.id, 
        functionName, 
        functionArgs
      );

      // Create a follow-up request to the AI with the function result
      const followUpMessages = [
        ...context,
        { role: 'user', content: message },
        { 
          role: 'assistant',
          content: null,
          function_call: {
            name: functionName,
            arguments: functionCall.arguments
          }
        },
        {
          role: 'function',
          name: functionName,
          content: JSON.stringify(functionResult)
        }
      ];

      // Get the final response from the AI
      const finalResponse = await callAssistantAPI(
        currentUser.id,
        "", // Empty message since we're providing context
        followUpMessages
      );

      if (!finalResponse) {
        return NextResponse.json(
          { error: "Failed to process function result. Please try again." },
          { status: 500 }
        );
      }

      // Return the complete conversation
      return NextResponse.json({
        message: finalResponse.choices[0].message.content,
        conversation: [
          ...context,
          { role: 'user', content: message },
          { role: 'assistant', content: finalResponse.choices[0].message.content }
        ],
        functionCalled: functionName,
        functionResult
      });
    }

    // If no function call, just return the AI response
    return NextResponse.json({
      message: aiResponse.choices[0].message.content,
      conversation: [
        ...context,
        { role: 'user', content: message },
        { role: 'assistant', content: aiResponse.choices[0].message.content }
      ]
    });
  } catch (error) {
    console.error('Error in assistant API:', error);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
} 