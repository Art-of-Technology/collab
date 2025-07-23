import { CollabAPIClient } from '../database/index.js';
import { logger } from '../utils/logger.js';

interface MCPResource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  handler: () => Promise<string>;
}

export async function setupResources(apiClient: CollabAPIClient): Promise<MCPResource[]> {
  return [
    {
      uri: 'collab://current-user',
      name: 'Current User',
      description: 'Information about the currently authenticated user',
      mimeType: 'application/json',
      handler: async () => {
        const currentUser = apiClient.getCurrentUser();
        
        if (!currentUser) {
          return JSON.stringify({
            error: 'Not authenticated',
            message: 'Please use the "login" tool to authenticate with your Collab account'
          }, null, 2);
        }

        return JSON.stringify({
          user: currentUser,
          authenticated: true,
          workspaceCount: currentUser.workspaces.length
        }, null, 2);
      },
    },

    {
      uri: 'collab://workspaces',
      name: 'Available Workspaces',
      description: 'List of workspaces accessible to the current user',
      mimeType: 'application/json',
      handler: async () => {
        const currentUser = apiClient.getCurrentUser();
        
        if (!currentUser) {
          return JSON.stringify({
            error: 'Not authenticated',
            message: 'Please use the "login" tool to authenticate with your Collab account'
          }, null, 2);
        }

        return JSON.stringify({
          workspaces: currentUser.workspaces,
          totalCount: currentUser.workspaces.length
        }, null, 2);
      },
    },

    {
      uri: 'collab://tasks/{workspaceId}',
      name: 'Workspace Tasks',
      description: 'Tasks in a specific workspace (replace {workspaceId} with actual workspace ID)',
      mimeType: 'application/json',
      handler: async () => {
        const currentUser = apiClient.getCurrentUser();
        
        if (!currentUser) {
          return JSON.stringify({
            error: 'Not authenticated',
            message: 'Please use the "login" tool to authenticate with your Collab account'
          }, null, 2);
        }

        return JSON.stringify({
          message: 'This is a template resource. To get actual tasks, use the "list-tasks" tool with a specific workspace ID.',
          example: 'list-tasks with workspaceId: "workspace-uuid"',
          availableWorkspaces: currentUser.workspaces.map(w => ({ id: w.id, name: w.name }))
        }, null, 2);
      },
    },

    {
      uri: 'collab://task/{taskId}',
      name: 'Task Details',
      description: 'Detailed information about a specific task (replace {taskId} with actual task ID or issue key)',
      mimeType: 'application/json',
      handler: async () => {
        const currentUser = apiClient.getCurrentUser();
        
        if (!currentUser) {
          return JSON.stringify({
            error: 'Not authenticated',
            message: 'Please use the "login" tool to authenticate with your Collab account'
          }, null, 2);
        }

        return JSON.stringify({
          message: 'This is a template resource. To get actual task details, use the "get-task" tool with a specific issue key.',
          example: 'get-task with issueKey: "WZB-123"',
          format: 'Task issue keys are typically in format: PROJECT-NUMBER (e.g., WZB-123)'
        }, null, 2);
      },
    },

    {
      uri: 'collab://boards/{workspaceId}',
      name: 'Task Boards',
      description: 'Task boards in a specific workspace (replace {workspaceId} with actual workspace ID)',
      mimeType: 'application/json',
      handler: async () => {
        const currentUser = apiClient.getCurrentUser();
        
        if (!currentUser) {
          return JSON.stringify({
            error: 'Not authenticated',
            message: 'Please use the "login" tool to authenticate with your Collab account'
          }, null, 2);
        }

        return JSON.stringify({
          message: 'This resource shows task boards for a workspace. Boards help organize tasks into columns like "To Do", "In Progress", "Done".',
          note: 'Currently, board information is accessed through tasks. Each task shows its associated board.',
          availableWorkspaces: currentUser.workspaces.map(w => ({ id: w.id, name: w.name }))
        }, null, 2);
      },
    },

    {
      uri: 'collab://authentication-guide',
      name: 'Authentication Guide',
      description: 'Guide for authenticating with the Collab MCP server',
      mimeType: 'text/markdown',
      handler: async () => {
        return `# Collab MCP Authentication Guide

## Getting Started

To use the Collab MCP server, you need to authenticate with your Collab account.

### Step 1: Login

Use the \`login\` tool with your Collab credentials:

\`\`\`
Tool: login
Email: your-email@example.com
Password: your-password
\`\`\`

### Step 2: Verify Authentication

Check your current session:

\`\`\`
Tool: whoami
\`\`\`

### Step 3: Explore Your Workspaces

List your available workspaces:

\`\`\`
Tool: list-workspaces
\`\`\`

## Authentication Requirements

### Method 1: Email & Password
- **Email**: Use the same email you use to login to Collab
- **Password**: Use your Collab password

### Method 2: Google OAuth
- **Same Google Account**: Use the same Google account you use for Collab
- **Browser Required**: You'll need to open a browser to authenticate
- **No Password Needed**: Perfect for users who only use Google OAuth

### Method 3: Session Token (Easiest)
- **Already Logged In**: You must be logged into Collab in your browser
- **Simple Process**: Just visit a URL and copy the token
- **No External Setup**: No Google Console configuration needed

## Session Management

- **Duration**: Sessions last 7 days
- **Security**: Tokens are stored securely in memory
- **Refresh**: Tokens refresh automatically
- **Logout**: Use the \`logout\` tool to end your session

## Troubleshooting

### Common Issues

1. **Google OAuth Users**: If you only use Google to login to Collab, you'll need to set up a password in your Collab account first.

2. **Invalid Credentials**: Double-check your email and password are correct.

3. **Network Issues**: Ensure your Collab instance is accessible.

4. **Session Expired**: Use the \`login\` tool to re-authenticate.

## Security Notes

- Never share your authentication credentials
- Tokens are not stored on disk
- Each MCP server instance requires separate authentication
- Sessions expire automatically for security

---

Once authenticated, you can use all MCP tools and resources to interact with your Collab tasks and workspaces.
`;
      },
    },

    {
      uri: 'collab://usage-examples',
      name: 'Usage Examples',
      description: 'Examples of how to use the Collab MCP server',
      mimeType: 'text/markdown',
      handler: async () => {
        return `# Collab MCP Usage Examples

## Authentication Examples

### Option 1: Email & Password Login
\`\`\`
Tool: login
Email: developer@company.com
Password: your-secure-password
\`\`\`

### Option 2: Google OAuth Login
\`\`\`
# Step 1: Get OAuth URL
Tool: get-auth-url

# Step 2: Open the URL in browser, sign in with Google

# Step 3: Copy token and authenticate
Tool: login-with-token
Token: [paste the token from browser]
\`\`\`

### Option 3: Session Token Login (Easiest)
\`\`\`
# Step 1: Visit http://localhost:3000/mcp-token in browser while logged in

# Step 2: Copy token and authenticate
Tool: login-with-token
Token: [paste the token from page]
\`\`\`

### Verify Authentication
\`\`\`
# Check current user
Tool: whoami

# List workspaces
Tool: list-workspaces
\`\`\`

## Task Management Examples

### Get Task Details
\`\`\`
Tool: get-task
Issue Key: WZB-123
\`\`\`

### List Your Tasks
\`\`\`
Tool: list-tasks
Workspace ID: workspace-uuid-here
\`\`\`

### Add Task Comment
\`\`\`
Tool: add-comment
Task ID: WZB-123
Content: Working on the API integration. Expected completion by end of day.
\`\`\`

### Update Task Status
\`\`\`
Tool: update-task-status
Task ID: WZB-123
Status: In Progress
\`\`\`

## Time Tracking Examples

### Start Work Session
\`\`\`
Tool: start-work
Task ID: WZB-123
\`\`\`

### Stop Work Session
\`\`\`
Tool: stop-work
Task ID: WZB-123
\`\`\`

## Natural Language Examples

Once authenticated, you can use natural language with AI assistants:

### Task Information
- "Can you show me the details of task WZB-123?"
- "What's the status of the authentication task?"
- "Who is assigned to WZB-123?"

### Task Management
- "Start working on task WZB-123"
- "Add a comment to WZB-123 saying I've completed the API integration"
- "Update WZB-123 status to Done"

### Workspace Operations
- "List all my assigned tasks"
- "What workspaces do I have access to?"
- "Show me tasks in the development workspace"

### Workflow Integration
- "Can you please help me with task WZB-123?"
- "I finished working on the authentication feature"
- "Let me start tracking time on the new feature task"

## Advanced Examples

### Filtering Tasks
\`\`\`
Tool: list-tasks
Workspace ID: workspace-uuid
Assignee ID: user-uuid-here
Limit: 20
\`\`\`

### Task Comments with Replies
\`\`\`
Tool: add-comment
Task ID: WZB-123
Content: This is a reply to the previous comment
Parent ID: comment-uuid-here
\`\`\`

### Board Management Examples
\`\`\`
# List all boards in a workspace
Tool: list-boards
Workspace ID: workspace-uuid

# Get board details and columns
Tool: get-board
Board ID: board-uuid

# Get all tasks in a board organized by columns
Tool: get-board-tasks
Board ID: board-uuid
Limit: 100
\`\`\`

## Best Practices

1. **Always authenticate first** before using other tools
2. **Use specific issue keys** (e.g., WZB-123) for better results
3. **Check your workspaces** to understand available resources
4. **Use natural language** with AI assistants for complex workflows
5. **Logout when done** to maintain security

## Error Handling

Most tools will return helpful error messages if something goes wrong:
- Authentication issues will prompt you to login
- Invalid task IDs will suggest checking the format
- Network issues will indicate connection problems

---

These examples should help you get started with the Collab MCP server!
`;
      },
    },
  ];
} 