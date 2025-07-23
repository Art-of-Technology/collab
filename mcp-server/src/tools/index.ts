import { z } from 'zod';
import { CollabAPIClient } from '../database/index.js';
import { logger } from '../utils/logger.js';

interface MCPTool {
  name: string;
  description: string;
  inputSchema: any;
  handler: (args: any) => Promise<any>;
}

export async function setupTools(apiClient: CollabAPIClient): Promise<MCPTool[]> {
  return [
    // Authentication tools
    {
      name: 'login',
      description: 'Authenticate with your Collab account using email and password',
      inputSchema: {
        type: 'object',
        properties: {
          email: {
            type: 'string',
            description: 'Your Collab account email address',
          },
          password: {
            type: 'string',
            description: 'Your Collab account password',
          },
        },
        required: ['email', 'password'],
      },
      handler: async (args: any) => {
        const { email, password } = args;
        
        try {
          const loginResult = await apiClient.login(email, password);
          
          return {
            content: [
              {
                type: 'text',
                text: `Successfully logged in as ${loginResult.user.name} (${loginResult.user.email})!\n\n` +
                      `Available workspaces:\n` +
                      loginResult.user.workspaces.map((ws: any) => `- ${ws.name} (${ws.role})`).join('\n') +
                      `\n\nYou can now use other tools to interact with your Collab tasks and workspaces.`,
              },
            ],
          };
        } catch (error) {
          logger.error('Login failed:', error);
          return {
            content: [
              {
                type: 'text',
                text: `Login failed: ${error instanceof Error ? error.message : 'Unknown error'}\n\n` +
                      `Alternative authentication methods:\n` +
                      `1. If you only use Google to login to Collab, try using the "get-auth-url" tool for OAuth authentication\n` +
                      `2. If you're already logged into Collab in your browser, visit http://localhost:3000/mcp-token to get your token, then use "login-with-token"`,
              },
            ],
            isError: true,
          };
        }
      },
    },

    {
      name: 'get-auth-url',
      description: 'Get OAuth authorization URL for Google authentication (for users who login with Google)',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
      handler: async (args: any) => {
        try {
          const response = await fetch(`${apiClient['baseUrl']}/api/auth/mcp-oauth-init`);
          
          if (!response.ok) {
            throw new Error(`Failed to get auth URL: ${response.status}`);
          }
          
          const data = await response.json();
          
          return {
            content: [
              {
                type: 'text',
                text: `🔗 Google OAuth Authentication\n\n` +
                      `1. Click or copy this URL and open it in your browser:\n` +
                      `${data.authUrl}\n\n` +
                      `2. Sign in with your Google account (the same one you use for Collab)\n\n` +
                      `3. After successful authentication, you'll get a token on the success page\n\n` +
                      `4. Copy the token and use the "login-with-token" tool here\n\n` +
                      `This is perfect for users who only use Google OAuth to access Collab!`,
              },
            ],
          };
        } catch (error) {
          logger.error('Failed to get auth URL:', error);
          return {
            content: [
              {
                type: 'text',
                text: `Failed to get OAuth URL: ${error instanceof Error ? error.message : 'Unknown error'}`,
              },
            ],
            isError: true,
          };
        }
      },
    },

    {
      name: 'login-with-token',
      description: 'Complete OAuth authentication using a token from the browser',
      inputSchema: {
        type: 'object',
        properties: {
          token: {
            type: 'string',
            description: 'The MCP token you received after OAuth authentication in the browser',
          },
        },
        required: ['token'],
      },
      handler: async (args: any) => {
        const { token } = args;
        
        try {
          const loginResult = await apiClient.loginWithToken(token);
          
                     return {
             content: [
               {
                 type: 'text',
                 text: `🎉 Successfully authenticated via OAuth as ${loginResult.user.name} (${loginResult.user.email})!\n\n` +
                       `Available workspaces:\n` +
                       loginResult.user.workspaces.map((ws: any) => `- ${ws.name} (${ws.role})`).join('\n') +
                      `\n\nYou can now use other tools to interact with your Collab tasks and workspaces.`,
              },
            ],
          };
        } catch (error) {
          logger.error('Token login failed:', error);
          return {
            content: [
              {
                type: 'text',
                text: `Token authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}\n\n` +
                      `Please make sure you copied the complete token from the browser, or try getting a new one with "get-auth-url".`,
              },
            ],
            isError: true,
          };
        }
      },
    },

    // Logout tool
    {
      name: 'logout',
      description: 'Logout from your Collab account',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
      handler: async (args: any) => {
        const currentUser = apiClient.getCurrentUser();
        apiClient.logout();
        
        return {
          content: [
            {
              type: 'text',
              text: currentUser 
                ? `Successfully logged out from ${currentUser.email}` 
                : 'You were not logged in',
            },
          ],
        };
      },
    },

    // Get current user info
    {
      name: 'whoami',
      description: 'Get information about the currently authenticated user',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
      handler: async (args: any) => {
        const currentUser = apiClient.getCurrentUser();
        
        if (!currentUser) {
          return {
            content: [
              {
                type: 'text',
                text: 'Not authenticated. Please use the "login" tool to authenticate with your Collab account.',
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: `Current User: ${currentUser.name} (${currentUser.email})\n` +
                    `Role: ${currentUser.role}\n\n` +
                    `Workspaces:\n` +
                    currentUser.workspaces.map(ws => `- ${ws.name} (${ws.role})`).join('\n'),
            },
          ],
        };
      },
    },

    // Get task by issue key
    {
      name: 'get-task',
      description: 'Get detailed information about a specific task by its issue key (e.g., WZB-123)',
      inputSchema: {
        type: 'object',
        properties: {
          issueKey: {
            type: 'string',
            description: 'The issue key (e.g., WZB-123)',
          },
        },
        required: ['issueKey'],
      },
      handler: async (args: any) => {
        const { issueKey } = args;
        
                 try {
           const task = await apiClient.getTaskByIssueKey(issueKey) as any;
           
           return {
             content: [
               {
                 type: 'text',
                 text: `Task: ${task.title}\n` +
                       `Issue Key: ${task.issueKey}\n` +
                       `Status: ${task.status}\n` +
                       `Priority: ${task.priority}\n` +
                       `Assignee: ${task.assignee?.name || 'Unassigned'}\n` +
                       `Created: ${new Date(task.createdAt).toLocaleDateString()}\n` +
                       `Updated: ${new Date(task.updatedAt).toLocaleDateString()}\n\n` +
                       `Description:\n${task.description || 'No description provided'}`,
               },
             ],
           };
        } catch (error) {
          logger.error('Failed to get task:', error);
          return {
            content: [
              {
                type: 'text',
                text: `Failed to get task ${issueKey}: ${error instanceof Error ? error.message : 'Unknown error'}`,
              },
            ],
            isError: true,
          };
        }
      },
    },

    // Add comment to task
    {
      name: 'add-comment',
      description: 'Add a comment to a specific task',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: 'The task ID or issue key',
          },
          content: {
            type: 'string',
            description: 'The comment content',
          },
          parentId: {
            type: 'string',
            description: 'Optional parent comment ID for replies',
          },
        },
        required: ['taskId', 'content'],
      },
      handler: async (args: any) => {
        const { taskId, content, parentId } = args;
        
        try {
          const comment = await apiClient.addTaskComment(taskId, content, parentId);
          
          return {
            content: [
              {
                type: 'text',
                text: `Comment added successfully to task ${taskId}:\n\n${content}`,
              },
            ],
          };
        } catch (error) {
          logger.error('Failed to add comment:', error);
          return {
            content: [
              {
                type: 'text',
                text: `Failed to add comment: ${error instanceof Error ? error.message : 'Unknown error'}`,
              },
            ],
            isError: true,
          };
        }
      },
    },

    // Start work on task
    {
      name: 'start-work',
      description: 'Start working on a task (start time tracking)',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: 'The task ID or issue key',
          },
        },
        required: ['taskId'],
      },
      handler: async (args: any) => {
        const { taskId } = args;
        
        try {
          await apiClient.startWorkOnTask(taskId);
          
          return {
            content: [
              {
                type: 'text',
                text: `Started working on task ${taskId}. Time tracking is now active.`,
              },
            ],
          };
        } catch (error) {
          logger.error('Failed to start work:', error);
          return {
            content: [
              {
                type: 'text',
                text: `Failed to start work on task ${taskId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
              },
            ],
            isError: true,
          };
        }
      },
    },

    // Stop work on task
    {
      name: 'stop-work',
      description: 'Stop working on a task (stop time tracking)',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: 'The task ID or issue key',
          },
        },
        required: ['taskId'],
      },
      handler: async (args: any) => {
        const { taskId } = args;
        
        try {
          await apiClient.stopWorkOnTask(taskId);
          
          return {
            content: [
              {
                type: 'text',
                text: `Stopped working on task ${taskId}. Time tracking has been stopped.`,
              },
            ],
          };
        } catch (error) {
          logger.error('Failed to stop work:', error);
          return {
            content: [
              {
                type: 'text',
                text: `Failed to stop work on task ${taskId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
              },
            ],
            isError: true,
          };
        }
      },
    },

    // List tasks
    {
      name: 'list-tasks',
      description: 'List tasks from a specific workspace, optionally filtered by assignee',
      inputSchema: {
        type: 'object',
        properties: {
          workspaceId: {
            type: 'string',
            description: 'The workspace ID',
          },
          assigneeId: {
            type: 'string',
            description: 'Optional assignee ID (defaults to current user)',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of tasks to return (default: 50)',
            default: 50,
          },
        },
        required: ['workspaceId'],
      },
      handler: async (args: any) => {
        const { workspaceId, assigneeId, limit = 50 } = args;
        
                 try {
           const tasks = await apiClient.getTasksByWorkspace(workspaceId, assigneeId, limit) as any[];
           
           if (tasks.length === 0) {
             return {
               content: [
                 {
                   type: 'text',
                   text: 'No tasks found in this workspace.',
                 },
               ],
             };
           }
           
           const taskList = tasks.map((task: any) => 
             `${task.issueKey} - ${task.title} (${task.status}) - ${task.assignee?.name || 'Unassigned'}`
           ).join('\n');
           
           return {
             content: [
               {
                 type: 'text',
                 text: `Found ${tasks.length} tasks:\n\n${taskList}`,
               },
             ],
           };
        } catch (error) {
          logger.error('Failed to list tasks:', error);
          return {
            content: [
              {
                type: 'text',
                text: `Failed to list tasks: ${error instanceof Error ? error.message : 'Unknown error'}`,
              },
            ],
            isError: true,
          };
        }
      },
    },

    // Update task status
    {
      name: 'update-task-status',
      description: 'Update the status of a specific task',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: 'The task ID or issue key',
          },
          status: {
            type: 'string',
            description: 'The new status (e.g., "To Do", "In Progress", "Done")',
          },
          columnId: {
            type: 'string',
            description: 'Optional column ID for board-specific status updates',
          },
        },
        required: ['taskId', 'status'],
      },
      handler: async (args: any) => {
        const { taskId, status, columnId } = args;
        
        try {
          await apiClient.updateTaskStatus(taskId, status, columnId);
          
          return {
            content: [
              {
                type: 'text',
                text: `Successfully updated task ${taskId} status to: ${status}`,
              },
            ],
          };
        } catch (error) {
          logger.error('Failed to update task status:', error);
          return {
            content: [
              {
                type: 'text',
                text: `Failed to update task status: ${error instanceof Error ? error.message : 'Unknown error'}`,
              },
            ],
            isError: true,
          };
        }
      },
    },

    // List workspaces
    {
      name: 'list-workspaces',
      description: 'List all workspaces the current user has access to',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
      handler: async (args: any) => {
        try {
          const workspaces = apiClient.getUserWorkspacesFromContext();
          
          if (workspaces.length === 0) {
            return {
              content: [
                {
                  type: 'text',
                  text: 'No workspaces found. Please make sure you are logged in.',
                },
              ],
            };
          }
          
          const workspaceList = workspaces.map((workspace: any) => 
            `${workspace.name} (${workspace.id}) - Role: ${workspace.role}`
          ).join('\n');
          
          return {
            content: [
              {
                type: 'text',
                text: `Your workspaces:\n\n${workspaceList}`,
              },
            ],
          };
        } catch (error) {
          logger.error('Failed to list workspaces:', error);
          return {
            content: [
              {
                type: 'text',
                text: `Failed to list workspaces: ${error instanceof Error ? error.message : 'Unknown error'}`,
              },
            ],
            isError: true,
          };
        }
      },
    },

    // Board Management Tools
    
    // List boards in workspace
    {
      name: 'list-boards',
      description: 'List all task boards in a specific workspace',
      inputSchema: {
        type: 'object',
        properties: {
          workspaceId: {
            type: 'string',
            description: 'The workspace ID to list boards from',
          },
        },
        required: ['workspaceId'],
      },
      handler: async (args: any) => {
        const { workspaceId } = args;
        
        try {
          const boards = await apiClient.getTaskBoards(workspaceId) as any[];
          
          if (boards.length === 0) {
            return {
              content: [
                {
                  type: 'text',
                  text: `No boards found in workspace ${workspaceId}.`,
                },
              ],
            };
          }
          
          const boardList = boards.map((board: any) => 
            `${board.name} (${board.id})\n` +
            `  - Issue Prefix: ${board.issuePrefix || 'N/A'}\n` +
            `  - Description: ${board.description || 'No description'}\n` +
            `  - Columns: ${board.columns?.length || 0} column(s)`
          ).join('\n\n');
          
          return {
            content: [
              {
                type: 'text',
                text: `Boards in workspace:\n\n${boardList}`,
              },
            ],
          };
        } catch (error) {
          logger.error('Failed to list boards:', error);
          return {
            content: [
              {
                type: 'text',
                text: `Failed to list boards: ${error instanceof Error ? error.message : 'Unknown error'}`,
              },
            ],
            isError: true,
          };
        }
      },
    },

    // Get board details
    {
      name: 'get-board',
      description: 'Get detailed information about a specific board',
      inputSchema: {
        type: 'object',
        properties: {
          boardId: {
            type: 'string',
            description: 'The board ID',
          },
        },
        required: ['boardId'],
      },
      handler: async (args: any) => {
        const { boardId } = args;
        
        try {
          const board = await apiClient.getBoardDetails(boardId) as any;
          
          const columnsList = board.columns?.map((col: any) => 
            `  - ${col.name} (${col.id}) - Position: ${col.position}`
          ).join('\n') || '  No columns found';
          
          return {
            content: [
              {
                type: 'text',
                text: `Board: ${board.name}\n` +
                      `ID: ${board.id}\n` +
                      `Issue Prefix: ${board.issuePrefix || 'N/A'}\n` +
                      `Description: ${board.description || 'No description'}\n` +
                      `Workspace: ${board.workspace?.name || 'Unknown'}\n` +
                      `Created: ${new Date(board.createdAt).toLocaleDateString()}\n` +
                      `Updated: ${new Date(board.updatedAt).toLocaleDateString()}\n\n` +
                      `Columns:\n${columnsList}`,
              },
            ],
          };
        } catch (error) {
          logger.error('Failed to get board:', error);
          return {
            content: [
              {
                type: 'text',
                text: `Failed to get board ${boardId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
              },
            ],
            isError: true,
          };
        }
      },
    },

    // Get board tasks
    {
      name: 'get-board-tasks',
      description: 'Get all tasks in a specific board, organized by columns',
      inputSchema: {
        type: 'object',
        properties: {
          boardId: {
            type: 'string',
            description: 'The board ID',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of tasks to return (default: 100)',
            default: 100,
          },
        },
        required: ['boardId'],
      },
      handler: async (args: any) => {
        const { boardId, limit = 100 } = args;
        
        try {
          const tasks = await apiClient.getBoardTasks(boardId) as any[];
          
          if (tasks.length === 0) {
            return {
              content: [
                {
                  type: 'text',
                  text: `No tasks found in board ${boardId}.`,
                },
              ],
            };
          }
          
          // Group tasks by column/status
          const tasksByColumn: { [key: string]: any[] } = {};
          tasks.slice(0, limit).forEach((task: any) => {
            const columnName = task.column?.name || task.status || 'No Column';
            if (!tasksByColumn[columnName]) {
              tasksByColumn[columnName] = [];
            }
            tasksByColumn[columnName].push(task);
          });
          
          let output = `Tasks in board (showing ${Math.min(tasks.length, limit)} of ${tasks.length} total):\n\n`;
          
          Object.entries(tasksByColumn).forEach(([columnName, columnTasks]) => {
            output += `📋 ${columnName} (${columnTasks.length} tasks):\n`;
            columnTasks.forEach((task: any) => {
              output += `  • ${task.issueKey || task.id} - ${task.title}\n`;
              output += `    Assignee: ${task.assignee?.name || 'Unassigned'}\n`;
              output += `    Priority: ${task.priority || 'N/A'}\n`;
              if (task.labels?.length > 0) {
                output += `    Labels: ${task.labels.map((l: any) => l.name).join(', ')}\n`;
              }
            });
            output += '\n';
          });
          
          return {
            content: [
              {
                type: 'text',
                text: output,
              },
            ],
          };
        } catch (error) {
          logger.error('Failed to get board tasks:', error);
          return {
            content: [
              {
                type: 'text',
                text: `Failed to get tasks for board ${boardId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
              },
            ],
            isError: true,
          };
        }
      },
    },
  ];
} 