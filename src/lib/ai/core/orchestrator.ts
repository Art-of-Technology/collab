/**
 * AI Orchestrator
 *
 * The central coordinator for all AI operations. It handles:
 * - Provider selection and routing
 * - Context management
 * - Conversation state
 * - Tool execution
 * - Error handling and retries
 */

import {
  AIProviderType,
  AIProviderConfig,
  AIModelId,
  AICompletionRequest,
  AICompletionResponse,
  AIStreamChunk,
  EmbeddingRequest,
  EmbeddingResponse,
  AIError,
  AIContext,
  AIMessage,
  AIToolDefinition,
  ToolCall,
  AIToolResult,
} from './types';
import { AIProvider, providerRegistry, getProviderForModel, MODEL_CONFIGS } from './provider';
import { AnthropicProvider } from '../providers/anthropic';
import { OpenAIProvider } from '../providers/openai';

// ============================================================================
// Configuration
// ============================================================================

export interface OrchestratorConfig {
  defaultProvider: AIProviderType;
  providers: Partial<Record<AIProviderType, AIProviderConfig>>;
  enableFallback?: boolean;
  fallbackOrder?: AIProviderType[];
  maxRetries?: number;
  retryDelay?: number;
}

const DEFAULT_CONFIG: OrchestratorConfig = {
  defaultProvider: 'openai',
  providers: {
    anthropic: {
      provider: 'anthropic',
      defaultModel: 'claude-sonnet-4',
    },
    openai: {
      provider: 'openai',
      defaultModel: 'gpt-4o',
    },
  },
  enableFallback: true,
  fallbackOrder: ['openai', 'anthropic'],
  maxRetries: 3,
  retryDelay: 1000,
};

// ============================================================================
// Tool Executor Type
// ============================================================================

export type ToolExecutor = (
  toolName: string,
  toolInput: Record<string, unknown>,
  context: AIContext
) => Promise<unknown>;

// ============================================================================
// AI Orchestrator
// ============================================================================

export class AIOrchestrator {
  private config: OrchestratorConfig;
  private toolExecutor?: ToolExecutor;
  private conversationContexts: Map<string, AIContext> = new Map();

  constructor(config: Partial<OrchestratorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.registerProviders();
  }

  private registerProviders(): void {
    // Register provider implementations
    providerRegistry.register('anthropic', AnthropicProvider);
    providerRegistry.register('openai', OpenAIProvider);
  }

  /**
   * Set the tool executor for handling tool calls
   */
  setToolExecutor(executor: ToolExecutor): void {
    this.toolExecutor = executor;
  }

  /**
   * Get or create a context for a session
   */
  getContext(sessionId: string): AIContext | undefined {
    return this.conversationContexts.get(sessionId);
  }

  /**
   * Create a new context for a session
   */
  createContext(
    sessionId: string,
    workspaceId: string,
    userId: string,
    metadata?: AIContext['metadata']
  ): AIContext {
    const context: AIContext = {
      workspaceId,
      userId,
      sessionId,
      conversationHistory: [],
      metadata: metadata || {},
    };
    this.conversationContexts.set(sessionId, context);
    return context;
  }

  /**
   * Update context metadata
   */
  updateContextMetadata(
    sessionId: string,
    metadata: Partial<AIContext['metadata']>
  ): void {
    const context = this.conversationContexts.get(sessionId);
    if (context) {
      context.metadata = { ...context.metadata, ...metadata };
    }
  }

  /**
   * Add a message to the conversation history
   */
  addToHistory(sessionId: string, message: AIMessage): void {
    const context = this.conversationContexts.get(sessionId);
    if (context) {
      context.conversationHistory.push(message);
    }
  }

  /**
   * Clear context for a session
   */
  clearContext(sessionId: string): void {
    this.conversationContexts.delete(sessionId);
  }

  /**
   * Get the appropriate provider for a model
   */
  private getProvider(model?: AIModelId): AIProvider {
    const providerType = model
      ? getProviderForModel(model)
      : this.config.defaultProvider;

    const providerConfig = this.config.providers[providerType];
    if (!providerConfig) {
      throw new AIError(
        `Provider ${providerType} is not configured`,
        'INVALID_REQUEST'
      );
    }

    return providerRegistry.getProvider(providerType, providerConfig);
  }

  /**
   * Complete a request with automatic provider routing
   */
  async complete(request: AICompletionRequest): Promise<AICompletionResponse> {
    const provider = this.getProvider(request.model);

    let lastError: AIError | null = null;
    const maxRetries = this.config.maxRetries || 3;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await provider.complete(request);
      } catch (error) {
        lastError = error as AIError;

        // Don't retry non-retryable errors
        if (!lastError.retryable) {
          throw lastError;
        }

        // Wait before retrying
        if (attempt < maxRetries - 1) {
          await this.delay(this.config.retryDelay || 1000);
        }
      }
    }

    // Try fallback providers if enabled
    if (this.config.enableFallback && this.config.fallbackOrder) {
      const currentProvider = request.model
        ? getProviderForModel(request.model)
        : this.config.defaultProvider;

      for (const fallbackType of this.config.fallbackOrder) {
        if (fallbackType === currentProvider) continue;

        const fallbackConfig = this.config.providers[fallbackType];
        if (!fallbackConfig) continue;

        try {
          const fallbackProvider = providerRegistry.getProvider(
            fallbackType,
            fallbackConfig
          );

          // Use the fallback provider's default model
          const fallbackRequest = {
            ...request,
            model: fallbackConfig.defaultModel,
          };

          return await fallbackProvider.complete(fallbackRequest);
        } catch {
          // Continue to next fallback
        }
      }
    }

    throw lastError || new AIError('All providers failed', 'PROVIDER_ERROR');
  }

  /**
   * Stream a completion with automatic provider routing
   */
  async *stream(
    request: AICompletionRequest
  ): AsyncGenerator<AIStreamChunk, void, unknown> {
    const provider = this.getProvider(request.model);
    yield* provider.stream(request);
  }

  /**
   * Generate embeddings (always uses OpenAI)
   */
  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const openaiConfig = this.config.providers.openai;
    if (!openaiConfig) {
      throw new AIError(
        'OpenAI provider is not configured for embeddings',
        'INVALID_REQUEST'
      );
    }

    const provider = providerRegistry.getProvider('openai', openaiConfig);
    return provider.embed(request);
  }

  /**
   * Complete a request with tool use, handling the tool execution loop
   */
  async completeWithTools(
    request: AICompletionRequest,
    context: AIContext,
    maxIterations: number = 10
  ): Promise<AICompletionResponse> {
    if (!this.toolExecutor) {
      throw new AIError(
        'Tool executor not configured',
        'INVALID_REQUEST'
      );
    }

    let currentMessages = [...request.messages];
    let iterations = 0;
    let response: AICompletionResponse;

    while (iterations < maxIterations) {
      iterations++;

      response = await this.complete({
        ...request,
        messages: currentMessages,
      });

      // If no tool calls, we're done
      if (!response.toolCalls || response.toolCalls.length === 0) {
        return response;
      }

      // Execute tool calls
      const toolResults: AIToolResult[] = [];

      for (const toolCall of response.toolCalls) {
        try {
          const result = await this.toolExecutor(
            toolCall.name,
            toolCall.arguments,
            context
          );
          toolResults.push({
            toolCallId: toolCall.id,
            result,
            isError: false,
          });
        } catch (error) {
          toolResults.push({
            toolCallId: toolCall.id,
            result:
              error instanceof Error ? error.message : 'Tool execution failed',
            isError: true,
          });
        }
      }

      // Add assistant message with tool calls to history
      currentMessages.push({
        role: 'assistant',
        content: response.content,
      });

      // Add tool results to history
      for (const result of toolResults) {
        currentMessages.push({
          role: 'tool',
          content: JSON.stringify(result.result),
          toolCallId: result.toolCallId,
        });
      }
    }

    // Max iterations reached
    throw new AIError(
      `Tool execution loop exceeded ${maxIterations} iterations`,
      'INVALID_REQUEST'
    );
  }

  /**
   * Chat with context - maintains conversation history
   */
  async chat(
    sessionId: string,
    userMessage: string,
    options: {
      systemPrompt?: string;
      model?: AIModelId;
      tools?: AIToolDefinition[];
      temperature?: number;
    } = {}
  ): Promise<AICompletionResponse> {
    const context = this.conversationContexts.get(sessionId);
    if (!context) {
      throw new AIError(
        'Session not found. Create a context first.',
        'INVALID_REQUEST'
      );
    }

    // Add user message to history
    context.conversationHistory.push({
      role: 'user',
      content: userMessage,
    });

    // Build request
    const request: AICompletionRequest = {
      model: options.model,
      messages: context.conversationHistory,
      systemPrompt: options.systemPrompt,
      temperature: options.temperature,
      tools: options.tools,
    };

    // Complete with or without tools
    let response: AICompletionResponse;
    if (options.tools && options.tools.length > 0 && this.toolExecutor) {
      response = await this.completeWithTools(request, context);
    } else {
      response = await this.complete(request);
    }

    // Add assistant response to history
    context.conversationHistory.push({
      role: 'assistant',
      content: response.content,
    });

    return response;
  }

  /**
   * Quick completion without context (stateless)
   */
  async quickComplete(
    prompt: string,
    options: {
      systemPrompt?: string;
      model?: AIModelId;
      temperature?: number;
      maxTokens?: number;
      responseFormat?: 'text' | 'json';
    } = {}
  ): Promise<string> {
    const response = await this.complete({
      model: options.model,
      messages: [{ role: 'user', content: prompt }],
      systemPrompt: options.systemPrompt,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      responseFormat: options.responseFormat,
    });

    return response.content;
  }

  /**
   * Classify text using a fast model
   */
  async classify<T extends string>(
    text: string,
    categories: T[],
    description?: string
  ): Promise<T> {
    const systemPrompt = `You are a text classifier. Classify the given text into exactly one of these categories: ${categories.join(', ')}.
${description ? `\nClassification context: ${description}` : ''}

Respond with ONLY the category name, nothing else.`;

    const response = await this.complete({
      model: 'claude-haiku-3.5', // Use fast model for classification
      messages: [{ role: 'user', content: text }],
      systemPrompt,
      temperature: 0,
      maxTokens: 50,
    });

    const result = response.content.trim() as T;
    if (!categories.includes(result)) {
      // If model didn't return exact match, find closest
      const lower = result.toLowerCase();
      const match = categories.find(
        (c) => c.toLowerCase() === lower || lower.includes(c.toLowerCase())
      );
      return match || categories[0];
    }

    return result;
  }

  /**
   * Summarize text
   */
  async summarize(
    text: string,
    options: {
      maxLength?: number;
      style?: 'brief' | 'detailed' | 'bullet_points';
      model?: AIModelId;
    } = {}
  ): Promise<string> {
    const styleInstructions = {
      brief: 'Provide a brief 1-2 sentence summary.',
      detailed: 'Provide a detailed summary covering all key points.',
      bullet_points: 'Summarize as a bullet-point list of key points.',
    };

    const systemPrompt = `You are a summarization expert. ${styleInstructions[options.style || 'brief']}
${options.maxLength ? `Keep the summary under ${options.maxLength} characters.` : ''}`;

    return this.quickComplete(text, {
      systemPrompt,
      model: options.model || 'claude-haiku-3.5',
      temperature: 0.3,
    });
  }

  /**
   * Extract structured data from text
   */
  async extract<T>(
    text: string,
    schema: {
      description: string;
      properties: Record<string, { type: string; description: string }>;
    },
    model?: AIModelId
  ): Promise<T> {
    const systemPrompt = `You are a data extraction expert. Extract information from the text according to this schema:

${schema.description}

Properties to extract:
${Object.entries(schema.properties)
  .map(([key, val]) => `- ${key} (${val.type}): ${val.description}`)
  .join('\n')}

Respond with ONLY valid JSON matching the schema.`;

    const response = await this.complete({
      model: model || 'gpt-4o',
      messages: [{ role: 'user', content: text }],
      systemPrompt,
      temperature: 0,
      responseFormat: 'json',
    });

    try {
      return JSON.parse(response.content) as T;
    } catch {
      throw new AIError(
        'Failed to parse extracted data as JSON',
        'INVALID_REQUEST'
      );
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let orchestratorInstance: AIOrchestrator | null = null;

export function getAIOrchestrator(
  config?: Partial<OrchestratorConfig>
): AIOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new AIOrchestrator(config);
  }
  return orchestratorInstance;
}

export function resetAIOrchestrator(): void {
  orchestratorInstance = null;
  providerRegistry.clearInstances();
}
