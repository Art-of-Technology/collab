/**
 * MCP Client - Client-side MCP Connection
 *
 * This module provides a direct connection to the MCP server using
 * Streamable HTTP transport, bypassing Anthropic's MCP connector.
 *
 * This approach is necessary because Anthropic's MCP connector has an
 * undocumented domain allowlist that blocks non-registered servers.
 */

import { getMcpServerUrl } from './mcp-token';

// JSON-RPC 2.0 types
interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

// MCP Tool definition from server
interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
    [key: string]: unknown;
  };
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    title?: string;
  };
}

// Claude's native tool format
export interface ClaudeTool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
    [key: string]: unknown;
  };
}

// Tool call result
export interface ToolCallResult {
  isError: boolean;
  content: Array<{ type: string; text?: string }>;
}

/**
 * MCP Client Session
 *
 * Manages a connection to the MCP server using Streamable HTTP transport.
 * Handles session initialization, tool listing, and tool execution.
 */
export class McpClientSession {
  private sessionId: string | null = null;
  private baseUrl: string;
  private token: string;
  private requestId = 0;
  private tools: McpToolDefinition[] = [];

  constructor(token: string, baseUrl?: string) {
    this.token = token;
    this.baseUrl = baseUrl || getMcpServerUrl();
  }

  /**
   * Initialize the MCP session
   */
  async initialize(): Promise<void> {
    const initRequest: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: ++this.requestId,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {
          tools: {},
        },
        clientInfo: {
          name: 'collab-ai-client',
          version: '1.0.0',
        },
      },
    };

    const response = await this.sendRequest(initRequest);

    if (response.error) {
      throw new Error(`MCP initialization failed: ${response.error.message}`);
    }

    // Session ID is returned in the response header by the server
    // For subsequent requests, we'll use the stored session ID

    // Send initialized notification
    await this.sendNotification('notifications/initialized', {});

    console.log('[MCP Client] Session initialized:', this.sessionId?.substring(0, 8) || 'unknown');
  }

  /**
   * List available tools from the MCP server
   */
  async listTools(): Promise<McpToolDefinition[]> {
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: ++this.requestId,
      method: 'tools/list',
      params: {},
    };

    const response = await this.sendRequest(request);

    if (response.error) {
      throw new Error(`Failed to list tools: ${response.error.message}`);
    }

    const result = response.result as { tools: McpToolDefinition[] };
    this.tools = result.tools || [];

    console.log(`[MCP Client] Discovered ${this.tools.length} tools`);
    return this.tools;
  }

  /**
   * Call a tool on the MCP server
   */
  async callTool(toolName: string, args: Record<string, unknown>): Promise<ToolCallResult> {
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: ++this.requestId,
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args,
      },
    };

    const response = await this.sendRequest(request);

    if (response.error) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Tool error: ${response.error.message}`,
          },
        ],
      };
    }

    const result = response.result as {
      content: Array<{ type: string; text?: string }>;
      isError?: boolean;
    };

    return {
      isError: result.isError || false,
      content: result.content || [],
    };
  }

  /**
   * Convert MCP tools to Claude's native tool format
   */
  convertToolsToClaudeFormat(): ClaudeTool[] {
    return this.tools.map((tool) => ({
      name: tool.name,
      description: tool.description || `Tool: ${tool.name}`,
      input_schema: tool.inputSchema,
    }));
  }

  /**
   * Get the list of tool names
   */
  getToolNames(): string[] {
    return this.tools.map((t) => t.name);
  }

  /**
   * Close the session
   */
  async close(): Promise<void> {
    if (!this.sessionId) return;

    try {
      const url = `${this.baseUrl}/api/mcp`;
      await fetch(url, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'MCP-Session-Id': this.sessionId,
        },
      });
      console.log('[MCP Client] Session closed');
    } catch (error) {
      console.warn('[MCP Client] Error closing session:', error);
    }

    this.sessionId = null;
  }

  /**
   * Send a JSON-RPC request to the MCP server
   */
  private async sendRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const url = `${this.baseUrl}/api/mcp`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${this.token}`,
    };

    if (this.sessionId) {
      headers['MCP-Session-Id'] = this.sessionId;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(request),
    });

    // Extract session ID from response headers
    const newSessionId = response.headers.get('mcp-session-id');
    if (newSessionId) {
      this.sessionId = newSessionId;
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`MCP request failed: ${response.status} ${errorText}`);
    }

    const jsonResponse = (await response.json()) as JsonRpcResponse;
    return jsonResponse;
  }

  /**
   * Send a JSON-RPC notification (no response expected)
   */
  private async sendNotification(method: string, params: Record<string, unknown>): Promise<void> {
    const url = `${this.baseUrl}/api/mcp`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${this.token}`,
    };

    if (this.sessionId) {
      headers['MCP-Session-Id'] = this.sessionId;
    }

    // Notifications don't have an id field
    const notification = {
      jsonrpc: '2.0',
      method,
      params,
    };

    await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(notification),
    });
  }
}

/**
 * Create and initialize an MCP client session
 */
export async function createMcpSession(token: string): Promise<McpClientSession> {
  const session = new McpClientSession(token);
  await session.initialize();
  await session.listTools();
  return session;
}
