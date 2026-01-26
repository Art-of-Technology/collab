/**
 * AI Orchestration Layer - Core Types
 *
 * This module defines the foundational types for the AI-native architecture.
 * It supports multi-provider AI integration with a unified interface.
 */

// ============================================================================
// Provider Types
// ============================================================================

export type AIProviderType = 'anthropic' | 'openai' | 'local';

export type AIModelId =
  // Anthropic models
  | 'claude-opus-4'
  | 'claude-sonnet-4'
  | 'claude-haiku-3.5'
  // OpenAI models
  | 'gpt-4o'
  | 'gpt-4o-mini'
  | 'gpt-4-turbo'
  | 'text-embedding-3-small'
  | 'text-embedding-3-large'
  // Local models (optional)
  | 'local-llm';

export interface AIProviderConfig {
  provider: AIProviderType;
  apiKey?: string;
  baseUrl?: string;
  defaultModel: AIModelId;
  maxRetries?: number;
  timeout?: number;
}

// ============================================================================
// Message Types
// ============================================================================

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface AIMessage {
  role: MessageRole;
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface AIToolResult {
  toolCallId: string;
  result: unknown;
  isError?: boolean;
}

// ============================================================================
// Request/Response Types
// ============================================================================

export interface AICompletionRequest {
  model?: AIModelId;
  messages: AIMessage[];
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: AIToolDefinition[];
  toolChoice?: 'auto' | 'none' | 'required' | { name: string };
  responseFormat?: 'text' | 'json';
  stream?: boolean;
  metadata?: Record<string, unknown>;
}

export interface AICompletionResponse {
  id: string;
  content: string;
  model: AIModelId;
  toolCalls?: ToolCall[];
  usage: AIUsage;
  finishReason: 'stop' | 'length' | 'tool_calls' | 'error';
  metadata?: Record<string, unknown>;
}

export interface AIStreamChunk {
  id: string;
  content: string;
  toolCalls?: Partial<ToolCall>[];
  finishReason?: 'stop' | 'length' | 'tool_calls' | 'error';
}

export interface AIUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

// ============================================================================
// Tool Definition Types
// ============================================================================

export interface AIToolDefinition {
  name: string;
  description: string;
  inputSchema: JSONSchema;
}

export interface JSONSchema {
  type: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';
  properties?: Record<string, JSONSchemaProperty>;
  required?: string[];
  items?: JSONSchemaProperty;
  description?: string;
}

export interface JSONSchemaProperty {
  type: string;
  description?: string;
  enum?: string[];
  items?: JSONSchemaProperty;
  properties?: Record<string, JSONSchemaProperty>;
  required?: string[];
  default?: unknown;
}

// ============================================================================
// Embedding Types
// ============================================================================

export interface EmbeddingRequest {
  input: string | string[];
  model?: AIModelId;
  dimensions?: number;
}

export interface EmbeddingResponse {
  embeddings: number[][];
  model: AIModelId;
  usage: {
    promptTokens: number;
    totalTokens: number;
  };
}

// ============================================================================
// Agent Types
// ============================================================================

export interface AIAgentIdentity {
  id: string;
  name: string;
  avatar?: string;
  role: AIAgentRole;
  description: string;
  systemPrompt: string;
  capabilities: AIAgentCapability[];
  workspaceId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type AIAgentRole =
  | 'assistant'      // General purpose assistant
  | 'analyst'        // Data analysis, reports, insights
  | 'reviewer'       // Code review, content review
  | 'planner'        // Sprint planning, estimation
  | 'writer'         // Documentation, content generation
  | 'support'        // Customer support, FAQ
  | 'custom';        // Custom-defined role

export type AIAgentCapability =
  | 'issue_management'
  | 'project_planning'
  | 'code_review'
  | 'documentation'
  | 'data_analysis'
  | 'report_generation'
  | 'content_creation'
  | 'search'
  | 'automation';

export interface AIAgentAction {
  id: string;
  agentId: string;
  type: 'message' | 'tool_use' | 'observation';
  content: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: unknown;
  timestamp: Date;
}

// ============================================================================
// Context Types
// ============================================================================

export interface AIContext {
  workspaceId: string;
  projectId?: string;
  issueId?: string;
  userId: string;
  sessionId: string;
  conversationHistory: AIMessage[];
  metadata: AIContextMetadata;
}

export interface AIContextMetadata {
  workspaceName?: string;
  projectName?: string;
  issueName?: string;
  userName?: string;
  userRole?: string;
  currentView?: string;
  recentActivity?: string[];
}

// ============================================================================
// Task Types (for background AI operations)
// ============================================================================

export interface AITask {
  id: string;
  type: AITaskType;
  status: AITaskStatus;
  agentId?: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  progress?: number;
  scheduledAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type AITaskType =
  | 'daily_summary'
  | 'sprint_analysis'
  | 'issue_triage'
  | 'duplicate_detection'
  | 'auto_labeling'
  | 'pr_review'
  | 'documentation_generation'
  | 'report_generation'
  | 'custom';

export type AITaskStatus =
  | 'pending'
  | 'scheduled'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

// ============================================================================
// Event Types (for AI triggers)
// ============================================================================

export interface AIEvent {
  type: AIEventType;
  workspaceId: string;
  payload: Record<string, unknown>;
  timestamp: Date;
}

export type AIEventType =
  | 'issue.created'
  | 'issue.updated'
  | 'issue.commented'
  | 'pr.opened'
  | 'pr.merged'
  | 'sprint.started'
  | 'sprint.ended'
  | 'daily.morning'
  | 'daily.evening'
  | 'weekly.summary';

// ============================================================================
// Error Types
// ============================================================================

export class AIError extends Error {
  constructor(
    message: string,
    public code: AIErrorCode,
    public provider?: AIProviderType,
    public statusCode?: number,
    public retryable: boolean = false
  ) {
    super(message);
    this.name = 'AIError';
  }
}

export type AIErrorCode =
  | 'PROVIDER_ERROR'
  | 'RATE_LIMIT'
  | 'CONTEXT_LENGTH_EXCEEDED'
  | 'INVALID_REQUEST'
  | 'AUTHENTICATION_ERROR'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'UNKNOWN';
