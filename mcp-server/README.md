# Collab MCP Server

A Model Context Protocol (MCP) server for seamless integration between Collab project management and Cursor IDE. This server enables developers to interact with their Collab tasks, workspaces, and projects directly from within Cursor.

## 🚀 Features

- **User Authentication**: Secure login with your Collab account credentials
- **Task Management**: Get, create, update, and track tasks
- **Time Tracking**: Start and stop work sessions directly from Cursor
- **Comments**: Add comments to tasks and participate in discussions
- **Workspaces**: Access and manage multiple workspaces
- **Real-time Context**: AI assistants get live context about your tasks and projects

## 🛠️ Installation

### Prerequisites

- Node.js 18+ 
- NPM or Yarn
- Access to a Collab instance (local or hosted)
- Cursor IDE

### Setup

1. **Clone or download** the MCP server files to your local machine

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment**:
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` with your Collab instance URL:
   ```env
   COLLAB_API_URL=http://localhost:3000  # or your hosted Collab URL
   ```

4. **Build the server**:
   ```bash
   npm run build
   ```

## 📋 Cursor Integration

### Automatic Installation (Recommended)

1. **Generate install links**:
   ```bash
   npm run generate-links
   ```

2. **Use the generated link** in your terminal output to automatically configure Cursor

### Manual Installation

Add this configuration to your Cursor settings:

```json
{
  "mcpServers": {
    "collab": {
      "command": "node",
      "args": ["/path/to/mcp-server/dist/index.js"],
      "env": {
        "COLLAB_API_URL": "http://localhost:3000"
      }
    }
  }
}
```

## 🔐 Authentication

### Three Authentication Methods

#### Method 1: Email & Password
For users with Collab passwords:

1. **Use the login tool**:
   ```
   Tool: login
   Email: your-email@example.com
   Password: your-password
   ```

#### Method 2: Google OAuth
For users who only use Google to login to Collab:

1. **Get authentication URL**:
   ```
   Tool: get-auth-url
   ```

2. **Open the URL in your browser** and sign in with Google

3. **Copy the token** from the success page

4. **Complete authentication**:
   ```
   Tool: login-with-token
   Token: [paste the token here]
   ```

#### Method 3: Session Token (Easiest)
If you're already logged into Collab in your browser:

1. **Visit the token page** while logged in: `http://localhost:3000/mcp-token`

2. **Copy the token** from the page

3. **Complete authentication**:
   ```
   Tool: login-with-token
   Token: [paste the token here]
   ```

### Verify Authentication

Check your current session:
```
Tool: whoami
```

### Authentication Flow

- **Login Methods**: Email/password OR Google OAuth
- **Session**: Secure 7-day session tokens
- **Auto-refresh**: Tokens refresh automatically
- **Logout**: End your session when done

### Security Notes

- Tokens are stored securely in memory only
- Sessions expire after 7 days
- OAuth tokens are generated only after successful Google authentication
- Never share your tokens with anyone

## 🔧 Available Tools

### Authentication Tools

- **`login`** - Authenticate with email and password
- **`get-auth-url`** - Get Google OAuth authorization URL
- **`login-with-token`** - Complete OAuth authentication with browser token
- **`logout`** - End your current session
- **`whoami`** - Check current user and workspaces

### Task Management Tools

- **`get-task`** - Get detailed task information by issue key (e.g., WZB-123)
- **`list-tasks`** - List tasks in a workspace (defaults to your tasks)
- **`update-task-status`** - Update task status
- **`add-comment`** - Add comments to tasks
- **`start-work`** - Start time tracking on a task
- **`stop-work`** - Stop time tracking on a task

### Workspace Tools

- **`list-workspaces`** - List all your accessible workspaces

### Board Management Tools

- **`list-boards`** - List all task boards in a workspace
- **`get-board`** - Get detailed information about a specific board
- **`get-board-tasks`** - Get all tasks in a specific board, organized by columns

## 📖 Usage Examples

### Basic Authentication

#### Option 1: Email & Password
```bash
# Login to Collab with credentials
> login
Email: john@example.com
Password: [your-password]
```

#### Option 2: Google OAuth
```bash
# Get OAuth URL
> get-auth-url
# Opens browser with authentication URL

# After browser authentication, use the token
> login-with-token
Token: [paste token from browser]
```

#### Option 3: Session Token (Easiest)
```bash
# Visit http://localhost:3000/mcp-token in your browser while logged in
# Copy the token from the page

# Use the token
> login-with-token
Token: [paste token from page]
```

#### Verify Authentication
```bash
# Check your workspaces
> list-workspaces

# Check current user
> whoami
```

### Task Management

```bash
# Get task details
> get-task
Issue Key: WZB-123

# List your tasks in a workspace
> list-tasks
Workspace ID: workspace-uuid

# Start working on a task
> start-work
Task ID: WZB-123

# Add a comment
> add-comment
Task ID: WZB-123
Content: Working on the API integration

# Update task status
> update-task-status
Task ID: WZB-123
Status: In Progress

# Stop working
> stop-work
Task ID: WZB-123
```

### Board Management

```bash
# List all boards in a workspace
> list-boards
Workspace ID: workspace-uuid

# Get detailed information about a board
> get-board
Board ID: board-uuid

# Get all tasks in a board organized by columns
> get-board-tasks
Board ID: board-uuid
Limit: 50
```

### AI Assistant Integration

Once authenticated, you can use natural language with AI assistants:

```bash
"Can you show me the details of task WZB-123?"
"Start working on the authentication task"
"Add a comment to WZB-123 saying I've completed the API integration"
"What tasks are assigned to me in the main workspace?"
"Show me all boards in my workspace"
"What tasks are in the development board?"
"List all tasks in the To Do column"
```

## 🔒 Resources

The MCP server provides these resources for AI context:

- **`collab://current-user`** - Current user information
- **`collab://workspaces`** - Available workspaces
- **`collab://tasks/{workspaceId}`** - Tasks in a workspace
- **`collab://task/{taskId}`** - Individual task details
- **`collab://boards/{workspaceId}`** - Task boards in a workspace

## 🛠️ Development

### Building

```bash
npm run build
```

### Development Mode

```bash
npm run dev
```

### Testing

```bash
npm test
```

## 📚 API Reference

### Authentication Endpoints

- `POST /api/auth/mcp-login` - Authenticate user
- `POST /api/auth/validate-mcp-token` - Validate session token

### Task Endpoints

- `GET /api/tasks/{issueKey}` - Get task by issue key
- `GET /api/workspaces/{workspaceId}/tasks` - List workspace tasks
- `POST /api/tasks/{taskId}/comments` - Add task comment
- `POST /api/tasks/{taskId}/play` - Start work session
- `POST /api/tasks/{taskId}/stop` - Stop work session

### Board Endpoints

- `GET /api/workspaces/{workspaceId}/boards` - List boards in workspace
- `GET /api/tasks/boards/{boardId}` - Get board details with columns
- `GET /api/tasks/boards/{boardId}/tasks` - Get all tasks in a board

## 🔧 Configuration

### Environment Variables

```env
COLLAB_API_URL=http://localhost:3000    # Collab instance URL
MCP_SERVER_NAME=collab-mcp-server       # Server name
MCP_SERVER_VERSION=1.0.0                # Server version
```

### Workspace Configuration

No additional workspace configuration needed - users authenticate with their existing Collab accounts.

## 🚨 Troubleshooting

### Common Issues

1. **Authentication Failed**
   - **For Email/Password**: Check your Collab credentials
   - **For Google OAuth**: Try the `get-auth-url` → `login-with-token` flow
   - **For Session Token**: Visit `http://localhost:3000/mcp-token` while logged into Collab
   - Verify Collab instance is accessible

2. **OAuth Issues**
   - Make sure you use the same Google account as your Collab account
   - Ensure the token is copied completely from the browser
   - Try generating a new auth URL if the token fails

 3. **Session Token Issues**
   - Make sure you're logged into Collab in your browser first
   - Visit `http://localhost:3000/mcp-token` to get a fresh token
   - Ensure the complete token is copied without extra spaces

4. **Connection Issues**
   - Check `COLLAB_API_URL` in `.env`
   - Ensure Collab instance is running
   - Verify network connectivity

5. **Task Not Found**
   - Check task issue key format (e.g., WZB-123)
   - Ensure you have access to the task's workspace
   - Verify task exists in Collab

6. **Board Not Found**
   - Check board ID is correct
   - Ensure you have access to the board's workspace
   - Use `list-boards` to see available boards first

7. **Session Expired**
   - Use `login` or `get-auth-url` → `login-with-token` to re-authenticate
   - Check token hasn't expired (7 days)

### Debug Mode

Enable debug logging:
```bash
DEBUG=true npm start
```

## 📄 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📞 Support

For issues and questions:
- Check the troubleshooting section
- Review Collab documentation
- Create an issue in the repository 