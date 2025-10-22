# Third-Party App API Documentation

This document describes the REST API endpoints available for third-party applications to access Collab's data through OAuth 2.0 authentication.

## Base URL

All API endpoints are available at:
```
https://your-collab-instance.com/api/apps/auth/
```

## Authentication

All endpoints require OAuth 2.0 Bearer token authentication:

```http
Authorization: Bearer <your_access_token>
```

Access tokens are obtained through the OAuth 2.0 authorization flow. See the [OAuth documentation](oauth-endpoints.md) for details.

## Scopes

The following scopes are available for third-party applications:

| Scope | Description |
|-------|-------------|
| `user:read` | Read user profile information |
| `user:write` | Update user profile information |
| `profile:read` | Read user profile information (alias for user:read) |
| `profile:write` | Update user profile information (alias for user:write) |
| `workspace:read` | Read workspace information and members |
| `workspace:write` | Update workspace settings (admin only) |
| `issues:read` | Read issues and their details |
| `issues:write` | Create, update, and delete issues |
| `posts:read` | Read posts and discussions |
| `posts:write` | Create, update, and delete posts |
| `comments:read` | Read comments on issues, tasks, and posts |
| `comments:write` | Create, update, and delete comments |
| `leave:read` | Read leave requests and balances |
| `leave:write` | Create and manage leave requests |

## Error Responses

All endpoints return consistent error responses:

```json
{
  "error": "error_code",
  "error_description": "Human-readable error description",
  "details": {} // Optional additional error details
}
```

Common error codes:
- `missing_token` - No authorization token provided
- `invalid_token` - Invalid or expired access token
- `insufficient_scope` - Token doesn't have required scopes
- `validation_error` - Request data validation failed
- `resource_not_found` - Requested resource not found
- `insufficient_permissions` - User lacks required permissions
- `server_error` - Internal server error

## Rate Limiting

API requests are rate-limited per application and workspace. Current limits:
- 1000 requests per hour per app installation
- 100 requests per minute per app installation

Rate limit headers are included in responses:
```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1640995200
```

## Pagination

List endpoints support pagination with the following query parameters:
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 50, max: 100)

Paginated responses include:
```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 150,
    "pages": 3
  }
}
```

## API Endpoints

### User Profile

#### Get Current User
```http
GET /api/apps/auth/user/me
```
**Required scopes:** `user:read` or `profile:read`

Returns the current user's profile information.

**Response:**
```json
{
  "id": "user_123",
  "email": "user@example.com",
  "name": "John Doe",
  "image": "https://example.com/avatar.jpg",
  "bio": "Software developer",
  "location": "San Francisco, CA",
  "website": "https://johndoe.com",
  "company": "Acme Corp",
  "jobTitle": "Senior Developer",
  "timezone": "America/Los_Angeles",
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-15T10:30:00Z",
  "workspace": {
    "id": "workspace_123",
    "slug": "acme",
    "name": "Acme Corp",
    "role": "MEMBER",
    "joinedAt": "2024-01-01T00:00:00Z",
    "status": "ACTIVE"
  }
}
```

#### Update Current User
```http
PATCH /api/apps/auth/user/me
```
**Required scopes:** `user:write` or `profile:write`

Updates the current user's profile information.

**Request body:**
```json
{
  "name": "John Smith",
  "bio": "Full-stack developer",
  "location": "New York, NY",
  "website": "https://johnsmith.dev",
  "company": "New Company",
  "jobTitle": "Lead Developer",
  "timezone": "America/New_York"
}
```

### Workspace

#### Get Current Workspace
```http
GET /api/apps/auth/workspace
```
**Required scopes:** `workspace:read`

Returns information about the current workspace.

**Response:**
```json
{
  "id": "workspace_123",
  "name": "Acme Corp",
  "slug": "acme",
  "description": "Our company workspace",
  "website": "https://acme.com",
  "image": "https://example.com/logo.jpg",
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-15T10:30:00Z",
  "stats": {
    "memberCount": 25,
    "projectCount": 5,
    "issueCount": 150,
    "taskCount": 300
  },
  "currentUser": {
    "role": "MEMBER",
    "joinedAt": "2024-01-01T00:00:00Z",
    "status": "ACTIVE",
    "permissions": {}
  }
}
```

#### List Workspace Members
```http
GET /api/apps/auth/workspace/members
```
**Required scopes:** `workspace:read`

**Query parameters:**
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 50, max: 100)
- `role` - Filter by role (ADMIN, MEMBER, GUEST)
- `status` - Filter by status (ACTIVE, INACTIVE, PENDING)
- `search` - Search by name or email

### Issues

#### List Issues
```http
GET /api/apps/auth/issues
```
**Required scopes:** `issues:read`

**Query parameters:**
- `page`, `limit` - Pagination
- `projectId` - Filter by project
- `assigneeId` - Filter by assignee
- `status` - Filter by status (OPEN, IN_PROGRESS, RESOLVED, CLOSED)
- `type` - Filter by type (BUG, FEATURE, TASK, IMPROVEMENT)
- `priority` - Filter by priority (LOW, MEDIUM, HIGH, URGENT)
- `search` - Search in title, description, or key

#### Create Issue
```http
POST /api/apps/auth/issues
```
**Required scopes:** `issues:write`

**Request body:**
```json
{
  "title": "Fix login bug",
  "description": "Users cannot log in with special characters in password",
  "type": "BUG",
  "priority": "HIGH",
  "projectId": "project_123",
  "assigneeId": "user_456",
  "labels": ["bug", "urgent"],
  "dueDate": "2024-02-01T00:00:00Z",
  "estimatedHours": 4
}
```

#### Get Issue
```http
GET /api/apps/auth/issues/{issueId}
```
**Required scopes:** `issues:read`

#### Update Issue
```http
PATCH /api/apps/auth/issues/{issueId}
```
**Required scopes:** `issues:write`

#### Delete Issue
```http
DELETE /api/apps/auth/issues/{issueId}
```
**Required scopes:** `issues:write`

### Tasks

#### List Tasks
```http
GET /api/apps/auth/tasks
```
**Required scopes:** `tasks:read`

**Query parameters:**
- `page`, `limit` - Pagination
- `projectId` - Filter by project
- `assigneeId` - Filter by assignee
- `status` - Filter by status (TODO, IN_PROGRESS, DONE, CANCELLED)
- `priority` - Filter by priority (LOW, MEDIUM, HIGH, URGENT)
- `parentTaskId` - Filter by parent task (subtasks)
- `search` - Search in title, description, or key

#### Create Task
```http
POST /api/apps/auth/tasks
```
**Required scopes:** `tasks:write`

**Request body:**
```json
{
  "title": "Implement user authentication",
  "description": "Add OAuth 2.0 authentication flow",
  "priority": "HIGH",
  "projectId": "project_123",
  "assigneeId": "user_456",
  "parentTaskId": "task_789",
  "labels": ["feature", "auth"],
  "dueDate": "2024-02-01T00:00:00Z",
  "estimatedHours": 8
}
```

#### Get Task
```http
GET /api/apps/auth/tasks/{taskId}
```
**Required scopes:** `tasks:read`

#### Update Task
```http
PATCH /api/apps/auth/tasks/{taskId}
```
**Required scopes:** `tasks:write`

#### Delete Task
```http
DELETE /api/apps/auth/tasks/{taskId}
```
**Required scopes:** `tasks:write`

### Posts

#### List Posts
```http
GET /api/apps/auth/posts
```
**Required scopes:** `posts:read`

**Query parameters:**
- `page`, `limit` - Pagination
- `projectId` - Filter by project
- `type` - Filter by type (ANNOUNCEMENT, DISCUSSION, QUESTION, UPDATE)
- `authorId` - Filter by author
- `isPinned` - Filter pinned posts (true/false)
- `search` - Search in title or content

#### Create Post
```http
POST /api/apps/auth/posts
```
**Required scopes:** `posts:write`

**Request body:**
```json
{
  "title": "Weekly Team Update",
  "content": "Here's what we accomplished this week...",
  "type": "UPDATE",
  "projectId": "project_123",
  "tags": ["weekly", "update"],
  "isPinned": false,
  "allowComments": true
}
```

#### Get Post
```http
GET /api/apps/auth/posts/{postId}
```
**Required scopes:** `posts:read`

#### Update Post
```http
PATCH /api/apps/auth/posts/{postId}
```
**Required scopes:** `posts:write`

#### Delete Post
```http
DELETE /api/apps/auth/posts/{postId}
```
**Required scopes:** `posts:write`

### Comments

#### List Comments
```http
GET /api/apps/auth/comments?resourceType=ISSUE&resourceId={resourceId}
```
**Required scopes:** `comments:read`

**Query parameters:**
- `resourceType` - Type of resource (ISSUE, TASK, POST) **required**
- `resourceId` - ID of the resource **required**
- `page`, `limit` - Pagination
- `authorId` - Filter by author

#### Create Comment
```http
POST /api/apps/auth/comments
```
**Required scopes:** `comments:write`

**Request body:**
```json
{
  "content": "This looks good to me!",
  "resourceType": "ISSUE",
  "resourceId": "issue_123",
  "parentCommentId": "comment_456"
}
```

#### Get Comment
```http
GET /api/apps/auth/comments/{commentId}
```
**Required scopes:** `comments:read`

#### Update Comment
```http
PATCH /api/apps/auth/comments/{commentId}
```
**Required scopes:** `comments:write`

#### Delete Comment
```http
DELETE /api/apps/auth/comments/{commentId}
```
**Required scopes:** `comments:write`

### Milestones

#### List Milestones
```http
GET /api/apps/auth/milestones
```
**Required scopes:** `milestones:read`

**Query parameters:**
- `page`, `limit` - Pagination
- `projectId` - Filter by project
- `status` - Filter by status (OPEN, CLOSED)
- `search` - Search in title or description

#### Create Milestone
```http
POST /api/apps/auth/milestones
```
**Required scopes:** `milestones:write`

**Request body:**
```json
{
  "title": "Version 2.0 Release",
  "description": "Major feature release",
  "dueDate": "2024-03-01T00:00:00Z",
  "projectId": "project_123",
  "status": "OPEN"
}
```

#### Get Milestone
```http
GET /api/apps/auth/milestones/{milestoneId}
```
**Required scopes:** `milestones:read`

#### Update Milestone
```http
PATCH /api/apps/auth/milestones/{milestoneId}
```
**Required scopes:** `milestones:write`

#### Delete Milestone
```http
DELETE /api/apps/auth/milestones/{milestoneId}
```
**Required scopes:** `milestones:write`

### Leave Management

#### List Leave Requests
```http
GET /api/apps/auth/leave/requests
```
**Required scopes:** `leave:read`

**Query parameters:**
- `page`, `limit` - Pagination
- `userId` - Filter by user (admin only)
- `status` - Filter by status (PENDING, APPROVED, REJECTED, CANCELLED)
- `type` - Filter by type (VACATION, SICK, PERSONAL, etc.)
- `startDate` - Filter by start date (ISO 8601)
- `endDate` - Filter by end date (ISO 8601)

#### Create Leave Request
```http
POST /api/apps/auth/leave/requests
```
**Required scopes:** `leave:write`

**Request body:**
```json
{
  "type": "VACATION",
  "startDate": "2024-02-15T00:00:00Z",
  "endDate": "2024-02-20T00:00:00Z",
  "reason": "Family vacation",
  "isHalfDay": false
}
```

#### Get Leave Request
```http
GET /api/apps/auth/leave/requests/{requestId}
```
**Required scopes:** `leave:read`

#### Update Leave Request
```http
PATCH /api/apps/auth/leave/requests/{requestId}
```
**Required scopes:** `leave:write`

#### Cancel Leave Request
```http
DELETE /api/apps/auth/leave/requests/{requestId}
```
**Required scopes:** `leave:write`

#### Get Leave Balances
```http
GET /api/apps/auth/leave/balances
```
**Required scopes:** `leave:read`

**Query parameters:**
- `userId` - Get balance for specific user (admin only)
- `year` - Year to get balance for (default: current year)

**Response:**
```json
{
  "balances": [
    {
      "user": {
        "id": "user_123",
        "name": "John Doe",
        "email": "john@example.com",
        "image": "https://example.com/avatar.jpg"
      },
      "year": 2024,
      "balances": [
        {
          "type": "VACATION",
          "policyName": "Annual Leave",
          "maxDaysPerYear": 20,
          "usedDays": 5,
          "remainingDays": 15,
          "pendingDays": 2
        }
      ],
      "summary": {
        "totalUsedDays": 5,
        "totalPendingDays": 2,
        "totalAvailableDays": 20
      }
    }
  ],
  "year": 2024,
  "policies": [
    {
      "id": "policy_123",
      "name": "Annual Leave",
      "type": "VACATION",
      "maxDaysPerYear": 20,
      "requiresApproval": true
    }
  ]
}
```

## SDK Examples

### JavaScript/Node.js

```javascript
const CollabAPI = require('@collab/api-client');

const client = new CollabAPI({
  baseURL: 'https://your-collab-instance.com',
  accessToken: 'your_access_token'
});

// Get current user
const user = await client.user.me();

// List issues
const issues = await client.issues.list({
  status: 'OPEN',
  assigneeId: user.id,
  page: 1,
  limit: 50
});

// Create a task
const task = await client.tasks.create({
  title: 'Implement feature X',
  description: 'Add new functionality',
  priority: 'HIGH',
  assigneeId: user.id
});
```

### Python

```python
from collab_api import CollabClient

client = CollabClient(
    base_url='https://your-collab-instance.com',
    access_token='your_access_token'
)

# Get current user
user = client.user.me()

# List issues
issues = client.issues.list(
    status='OPEN',
    assignee_id=user['id'],
    page=1,
    limit=50
)

# Create a task
task = client.tasks.create({
    'title': 'Implement feature X',
    'description': 'Add new functionality',
    'priority': 'HIGH',
    'assignee_id': user['id']
})
```

## Webhooks

Third-party apps can receive real-time notifications about events in Collab through webhooks. See the [Webhook Documentation](webhooks.md) for details on setting up and handling webhook events.

## Support

For API support and questions:
- Documentation: https://developers.collab.com
- Support: support@collab.com
- Community: https://community.collab.com
