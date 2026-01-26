/**
 * Anthropic (Claude) Provider Implementation
 *
 * This module implements the AI provider interface for Anthropic's Claude models.
 * It handles completions, streaming, and tool use with Claude.
 */

import Anthropic from '@anthropic-ai/sdk';
import { AIProvider, MODEL_CONFIGS } from '../core/provider';
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
  AIMessage,
  ToolCall,
  AIToolDefinition,
} from '../core/types';

// ============================================================================
// Anthropic Model Mapping
// ============================================================================

const ANTHROPIC_MODEL_MAP: Partial<Record<AIModelId, string>> = {
  'claude-opus-4': 'claude-opus-4-20250514',
  'claude-sonnet-4': 'claude-sonnet-4-20250514',
  'claude-haiku-3.5': 'claude-3-5-haiku-20241022',
};

// ============================================================================
// Type Conversions
// ============================================================================

function toAnthropicMessages(
  messages: AIMessage[]
): Anthropic.Messages.MessageParam[] {
  return messages
    .filter((m) => m.role !== 'system') // System messages handled separately
    .map((message) => {
      if (message.role === 'tool') {
        return {
          role: 'user' as const,
          content: [
            {
              type: 'tool_result' as const,
              tool_use_id: message.toolCallId || '',
              content: message.content,
            },
          ],
        };
      }

      return {
        role: message.role as 'user' | 'assistant',
        content: message.content,
      };
    });
}

function toAnthropicTools(
  tools: AIToolDefinition[]
): Anthropic.Messages.Tool[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema as Anthropic.Messages.Tool['input_schema'],
  }));
}

function extractToolCalls(
  content: Anthropic.Messages.ContentBlock[]
): ToolCall[] {
  return content
    .filter(
      (block): block is Anthropic.Messages.ToolUseBlock =>
        block.type === 'tool_use'
    )
    .map((block) => ({
      id: block.id,
      name: block.name,
      arguments: block.input as Record<string, unknown>,
    }));
}

function extractTextContent(content: Anthropic.Messages.ContentBlock[]): string {
  return content
    .filter(
      (block): block is Anthropic.Messages.TextBlock => block.type === 'text'
    )
    .map((block) => block.text)
    .join('');
}

function mapFinishReason(
  stopReason: Anthropic.Messages.Message['stop_reason']
): AICompletionResponse['finishReason'] {
  switch (stopReason) {
    case 'end_turn':
      return 'stop';
    case 'max_tokens':
      return 'length';
    case 'tool_use':
      return 'tool_calls';
    default:
      return 'stop';
  }
}

// ============================================================================
// Anthropic Provider Implementation
// ============================================================================

export class AnthropicProvider extends AIProvider {
  private client: Anthropic | null = null;

  get providerType(): AIProviderType {
    return 'anthropic';
  }

  isConfigured(): boolean {
    return !!(this.config.apiKey || process.env.ANTHROPIC_API_KEY);
  }

  private getClient(): Anthropic {
    if (!this.client) {
      const apiKey = this.config.apiKey || process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new AIError(
          'Anthropic API key not configured',
          'AUTHENTICATION_ERROR',
          'anthropic'
        );
      }

      this.client = new Anthropic({
        apiKey,
        baseURL: this.config.baseUrl,
        maxRetries: this.config.maxRetries ?? 3,
        timeout: this.config.timeout ?? 60000,
      });
    }
    return this.client;
  }

  private getModelId(model?: AIModelId): string {
    const modelId = model || this.config.defaultModel;
    const anthropicModel = ANTHROPIC_MODEL_MAP[modelId];

    if (!anthropicModel) {
      throw new AIError(
        `Model ${modelId} is not supported by Anthropic provider`,
        'INVALID_REQUEST',
        'anthropic'
      );
    }

    return anthropicModel;
  }

  async complete(request: AICompletionRequest): Promise<AICompletionResponse> {
    const client = this.getClient();

    try {
      // Build system prompt
      let systemPrompt = request.systemPrompt || '';
      const systemMessages = request.messages.filter((m) => m.role === 'system');
      if (systemMessages.length > 0) {
        systemPrompt =
          systemMessages.map((m) => m.content).join('\n\n') +
          (systemPrompt ? '\n\n' + systemPrompt : '');
      }

      // Build request params
      const params: Anthropic.Messages.MessageCreateParams = {
        model: this.getModelId(request.model),
        max_tokens: request.maxTokens || 4096,
        messages: toAnthropicMessages(request.messages),
        temperature: request.temperature,
      };

      // Add system prompt if present
      if (systemPrompt) {
        params.system = systemPrompt;
      }

      // Add tools if present
      if (request.tools && request.tools.length > 0) {
        params.tools = toAnthropicTools(request.tools);

        // Handle tool choice
        if (request.toolChoice) {
          if (request.toolChoice === 'auto') {
            params.tool_choice = { type: 'auto' };
          } else if (request.toolChoice === 'none') {
            // Don't include tools
            delete params.tools;
          } else if (request.toolChoice === 'required') {
            params.tool_choice = { type: 'any' };
          } else if (typeof request.toolChoice === 'object') {
            params.tool_choice = {
              type: 'tool',
              name: request.toolChoice.name,
            };
          }
        }
      }

      const response = await client.messages.create(params);

      return {
        id: response.id,
        content: extractTextContent(response.content),
        model: request.model || this.config.defaultModel,
        toolCalls: extractToolCalls(response.content),
        usage: {
          promptTokens: response.usage.input_tokens,
          completionTokens: response.usage.output_tokens,
          totalTokens:
            response.usage.input_tokens + response.usage.output_tokens,
        },
        finishReason: mapFinishReason(response.stop_reason),
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async *stream(
    request: AICompletionRequest
  ): AsyncGenerator<AIStreamChunk, void, unknown> {
    const client = this.getClient();

    try {
      // Build system prompt
      let systemPrompt = request.systemPrompt || '';
      const systemMessages = request.messages.filter((m) => m.role === 'system');
      if (systemMessages.length > 0) {
        systemPrompt =
          systemMessages.map((m) => m.content).join('\n\n') +
          (systemPrompt ? '\n\n' + systemPrompt : '');
      }

      // Build request params
      const params: Anthropic.Messages.MessageCreateParams = {
        model: this.getModelId(request.model),
        max_tokens: request.maxTokens || 4096,
        messages: toAnthropicMessages(request.messages),
        temperature: request.temperature,
        stream: true,
      };

      if (systemPrompt) {
        params.system = systemPrompt;
      }

      if (request.tools && request.tools.length > 0) {
        params.tools = toAnthropicTools(request.tools);
      }

      const stream = await client.messages.stream(params);

      let currentId = '';
      let accumulatedToolCalls: Map<number, Partial<ToolCall>> = new Map();

      for await (const event of stream) {
        if (event.type === 'message_start') {
          currentId = event.message.id;
        } else if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            yield {
              id: currentId,
              content: event.delta.text,
            };
          } else if (event.delta.type === 'input_json_delta') {
            // Handle tool call streaming (partial JSON)
            const index = event.index;
            const existing = accumulatedToolCalls.get(index) || {};
            // Accumulate partial JSON - actual parsing happens on completion
            yield {
              id: currentId,
              content: '',
              toolCalls: [existing],
            };
          }
        } else if (event.type === 'content_block_start') {
          if (event.content_block.type === 'tool_use') {
            accumulatedToolCalls.set(event.index, {
              id: event.content_block.id,
              name: event.content_block.name,
              arguments: {},
            });
          }
        } else if (event.type === 'message_delta') {
          yield {
            id: currentId,
            content: '',
            finishReason: mapFinishReason(event.delta.stop_reason),
          };
        }
      }
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async embed(_request: EmbeddingRequest): Promise<EmbeddingResponse> {
    // Anthropic doesn't have a native embedding model
    // This would need to be handled by the orchestrator routing to OpenAI
    throw new AIError(
      'Anthropic does not support embeddings. Use OpenAI for embeddings.',
      'INVALID_REQUEST',
      'anthropic'
    );
  }

  async countTokens(text: string): Promise<number> {
    const client = this.getClient();

    try {
      const response = await client.messages.countTokens({
        model: this.getModelId(),
        messages: [{ role: 'user', content: text }],
      });
      return response.input_tokens;
    } catch {
      // Fallback to rough estimation (4 chars per token)
      return Math.ceil(text.length / 4);
    }
  }

  getAvailableModels(): AIModelId[] {
    return Object.keys(ANTHROPIC_MODEL_MAP) as AIModelId[];
  }

  supportsCapability(
    model: AIModelId,
    capability: 'tools' | 'vision' | 'json_mode' | 'embeddings'
  ): boolean {
    const config = MODEL_CONFIGS[model];
    if (!config || config.provider !== 'anthropic') {
      return false;
    }

    switch (capability) {
      case 'tools':
        return config.supportsTools;
      case 'vision':
        return config.supportsVision;
      case 'json_mode':
        return config.supportsJsonMode;
      case 'embeddings':
        return false; // Anthropic doesn't support embeddings
      default:
        return false;
    }
  }

  private handleError(error: unknown): AIError {
    // Check if it's an Anthropic API error with status property
    const apiError = error as { status?: number; message?: string };
    if (
      error &&
      typeof error === 'object' &&
      'status' in error &&
      typeof apiError.status === 'number'
    ) {
      const statusCode = apiError.status;
      const message = apiError.message || 'Unknown error';

      if (statusCode === 401) {
        return new AIError(
          'Invalid Anthropic API key',
          'AUTHENTICATION_ERROR',
          'anthropic',
          statusCode,
          false
        );
      }

      if (statusCode === 429) {
        return new AIError(
          'Anthropic rate limit exceeded',
          'RATE_LIMIT',
          'anthropic',
          statusCode,
          true
        );
      }

      if (statusCode === 400 && message.includes('context')) {
        return new AIError(
          'Context length exceeded for Anthropic model',
          'CONTEXT_LENGTH_EXCEEDED',
          'anthropic',
          statusCode,
          false
        );
      }

      return new AIError(
        message || 'Anthropic API error',
        'PROVIDER_ERROR',
        'anthropic',
        statusCode,
        statusCode >= 500
      );
    }

    if (error instanceof Error) {
      if (error.message.includes('timeout')) {
        return new AIError(
          'Anthropic request timed out',
          'TIMEOUT',
          'anthropic',
          undefined,
          true
        );
      }

      if (
        error.message.includes('network') ||
        error.message.includes('ECONNREFUSED')
      ) {
        return new AIError(
          'Network error connecting to Anthropic',
          'NETWORK_ERROR',
          'anthropic',
          undefined,
          true
        );
      }

      return new AIError(
        error.message,
        'UNKNOWN',
        'anthropic',
        undefined,
        false
      );
    }

    return new AIError(
      'Unknown error occurred',
      'UNKNOWN',
      'anthropic',
      undefined,
      false
    );
  }
}
