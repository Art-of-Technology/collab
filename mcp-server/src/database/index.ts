import { logger } from '../utils/logger.js';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  workspaces: Array<{
    id: string;
    name: string;
    slug: string;
    role: string;
  }>;
}

interface LoginResponse {
  success: boolean;
  token: string;
  user: User;
}

export class CollabAPIClient {
  private baseUrl: string;
  private sessionToken: string | null = null;
  private currentUser: User | null = null;
  private isInitialized: boolean = false;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  }

  async connect(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Test the connection by making a simple API call
      const response = await this.makeRequest('/api/user/me', 'GET');
      if (response.ok || response.status === 401) { // 401 is expected without proper auth
        this.isInitialized = true;
        logger.info('API client connection established');
      } else {
        throw new Error(`API connection test failed: ${response.status}`);
      }
    } catch (error) {
      logger.error('Failed to connect to API:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.sessionToken = null;
    this.currentUser = null;
    this.isInitialized = false;
    logger.info('API client connection closed');
  }

  async login(email: string, password: string): Promise<LoginResponse> {
    try {
      const response = await this.makeRequest('/api/auth/mcp-login', 'POST', {
        email,
        password,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Login failed');
      }

      const loginData: LoginResponse = await response.json();
      this.sessionToken = loginData.token;
      this.currentUser = loginData.user;
      
      logger.info(`User ${email} logged in successfully`);
      return loginData;
    } catch (error) {
      logger.error('Login failed:', error);
      throw error;
    }
  }

  async loginWithToken(token: string): Promise<LoginResponse> {
    try {
      // Validate the token by calling an endpoint that requires authentication
      const response = await fetch(`${this.baseUrl}/api/user/me`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Invalid or expired token');
      }

      const userData = await response.json();
      
      // Set the session token and user data
      this.sessionToken = token;
      this.currentUser = {
        id: userData.id,
        email: userData.email,
        name: userData.name,
        role: userData.role,
        workspaces: userData.workspaces || []
      };
      
      logger.info(`User ${userData.email} logged in successfully via token`);
      
      return {
        success: true,
        token: token,
        user: this.currentUser
      };
    } catch (error) {
      logger.error('Token login failed:', error);
      throw error;
    }
  }

  logout(): void {
    this.sessionToken = null;
    this.currentUser = null;
    logger.info('User logged out');
  }

  getCurrentUser(): User | null {
    return this.currentUser;
  }

  isAuthenticated(): boolean {
    return this.sessionToken !== null && this.currentUser !== null;
  }

  private async makeRequest(path: string, method: string = 'GET', body?: any): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add session token if available
    if (this.sessionToken) {
      headers['Authorization'] = `Bearer ${this.sessionToken}`;
    }

    const options: RequestInit = {
      method,
      headers,
    };

    if (body && method !== 'GET') {
      options.body = JSON.stringify(body);
    }

    logger.debug(`Making ${method} request to ${url}`);
    return fetch(url, options);
  }

  private async apiCall<T>(path: string, method: string = 'GET', body?: any): Promise<T> {
    if (!this.isAuthenticated() && !path.includes('/api/auth/mcp-login')) {
      throw new Error('Not authenticated. Please login first.');
    }

    const response = await this.makeRequest(path, method, body);
    
    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 401) {
        // Session expired, logout
        this.logout();
        throw new Error('Session expired. Please login again.');
      }
      throw new Error(`API call failed: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  // Task-related API operations
  async getTaskByIssueKey(issueKey: string) {
    return this.apiCall(`/api/tasks/${issueKey}`);
  }

  async getTaskById(taskId: string) {
    return this.apiCall(`/api/tasks/${taskId}`);
  }

  async addTaskComment(taskId: string, content: string, parentId?: string) {
    if (!this.currentUser) {
      throw new Error('Not authenticated');
    }
    
    // Convert markdown to HTML for proper display
    const { marked } = await import('marked');
    
    // Configure marked for proper HTML output
    marked.setOptions({
      breaks: true,        // Convert line breaks to <br>
      gfm: true           // Enable GitHub Flavored Markdown
    });
    
    const html = marked(content);
    
    return this.apiCall(`/api/tasks/${taskId}/comments`, 'POST', {
      content: content, // Keep original content for editing
      html: html,      // Send HTML version for display
      authorId: this.currentUser.id,
      parentId,
    });
  }

  async getTaskComments(taskId: string) {
    return this.apiCall(`/api/tasks/${taskId}/comments`);
  }

  async getUserByEmail(email: string) {
    return this.apiCall(`/api/users/by-email?email=${encodeURIComponent(email)}`);
  }

  async getWorkspacesByUserId(userId: string) {
    return this.apiCall(`/api/users/${userId}/workspaces`);
  }

  async getTasksByWorkspace(workspaceId: string, assigneeId?: string, limit: number = 50) {
    const params = new URLSearchParams();
    
    // If no assigneeId is provided, use current user's ID
    if (assigneeId) {
      params.append('assigneeId', assigneeId);
    } else if (this.currentUser) {
      params.append('assigneeId', this.currentUser.id);
    }
    
    params.append('limit', limit.toString());
    
    return this.apiCall(`/api/workspaces/${workspaceId}/tasks?${params.toString()}`);
  }

  async updateTaskStatus(taskId: string, status: string, columnId?: string) {
    return this.apiCall(`/api/tasks/${taskId}/edit`, 'PATCH', {
      status,
      columnId,
    });
  }

  async startWorkOnTask(taskId: string) {
    return this.apiCall(`/api/tasks/${taskId}/play`, 'POST');
  }

  async stopWorkOnTask(taskId: string) {
    return this.apiCall(`/api/tasks/${taskId}/stop`, 'POST');
  }

  async getTaskSessions(taskId: string) {
    return this.apiCall(`/api/tasks/${taskId}/sessions`);
  }

  async getTaskActivities(taskId: string) {
    return this.apiCall(`/api/tasks/${taskId}/activities`);
  }

  // Workspace operations
  async getWorkspaceDetails(workspaceId: string) {
    return this.apiCall(`/api/workspaces/${workspaceId}`);
  }

  async getTaskBoards(workspaceId: string) {
    return this.apiCall(`/api/workspaces/${workspaceId}/boards`);
  }

  async getBoardDetails(boardId: string) {
    return this.apiCall(`/api/tasks/boards/${boardId}`);
  }

  async getBoardTasks(boardId: string) {
    return this.apiCall(`/api/tasks/boards/${boardId}/tasks`);
  }

  // User operations  
  async getUserWorkspaces() {
    return this.apiCall('/api/workspaces');
  }

  // Get user workspaces from current user context
  getUserWorkspacesFromContext() {
    return this.currentUser?.workspaces || [];
  }
} 