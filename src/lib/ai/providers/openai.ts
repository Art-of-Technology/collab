/**
 * OpenAI Provider Implementation
 *
 * This module implements the AI provider interface for OpenAI models.
 * Primarily used for embeddings and as a fallback for completions.
 */

import OpenAI from 'openai';
import type { ChatCompletionMessageToolCall } from 'openai/resources/chat/completions';
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
// OpenAI Model Mapping
// ============================================================================

const OPENAI_MODEL_MAP: Partial<Record<AIModelId, string>> = {
  'gpt-4o': 'gpt-4o',
  'gpt-4o-mini': 'gpt-4o-mini',
  'gpt-4-turbo': 'gpt-4-turbo',
  'text-embedding-3-small': 'text-embedding-3-small',
  'text-embedding-3-large': 'text-embedding-3-large',
};

// ============================================================================
// Type Conversions
// ============================================================================

function toOpenAIMessages(
  messages: AIMessage[],
  systemPrompt?: string
): OpenAI.ChatCompletionMessageParam[] {
  const result: OpenAI.ChatCompletionMessageParam[] = [];

  // Add system prompt first if provided
  if (systemPrompt) {
    result.push({ role: 'system', content: systemPrompt });
  }

  for (const message of messages) {
    if (message.role === 'system' && !systemPrompt) {
      result.push({ role: 'system', content: message.content });
    } else if (message.role === 'user') {
      result.push({ role: 'user', content: message.content });
    } else if (message.role === 'assistant') {
      // Handle assistant messages with tool calls
      if (message.toolCalls && message.toolCalls.length > 0) {
        result.push({
          role: 'assistant',
          content: message.content || null,
          tool_calls: message.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.arguments),
            },
          })),
        });
      } else {
        result.push({ role: 'assistant', content: message.content });
      }
    } else if (message.role === 'tool') {
      result.push({
        role: 'tool',
        content: message.content,
        tool_call_id: message.toolCallId || '',
      });
    }
  }

  return result;
}

function toOpenAITools(
  tools: AIToolDefinition[]
): OpenAI.ChatCompletionTool[] {
  return tools.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: (tool.parameters || tool.inputSchema) as unknown as Record<string, unknown>,
    },
  }));
}

function extractToolCalls(
  toolCalls?: ChatCompletionMessageToolCall[]
): ToolCall[] {
  if (!toolCalls) return [];

  return toolCalls.map((tc) => ({
    id: tc.id,
    name: tc.function.name,
    arguments: JSON.parse(tc.function.arguments || '{}'),
  }));
}

function mapFinishReason(
  finishReason: OpenAI.ChatCompletion.Choice['finish_reason']
): AICompletionResponse['finishReason'] {
  switch (finishReason) {
    case 'stop':
      return 'stop';
    case 'length':
      return 'length';
    case 'tool_calls':
      return 'tool_calls';
    default:
      return 'stop';
  }
}

// ============================================================================
// OpenAI Provider Implementation
// ============================================================================

export class OpenAIProvider extends AIProvider {
  private client: OpenAI | null = null;

  get providerType(): AIProviderType {
    return 'openai';
  }

  isConfigured(): boolean {
    return !!(this.config.apiKey || process.env.OPENAI_API_KEY);
  }

  private getClient(): OpenAI {
    if (!this.client) {
      const apiKey = this.config.apiKey || process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new AIError(
          'OpenAI API key not configured',
          'AUTHENTICATION_ERROR',
          'openai'
        );
      }

      this.client = new OpenAI({
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
    const openaiModel = OPENAI_MODEL_MAP[modelId];

    if (!openaiModel) {
      throw new AIError(
        `Model ${modelId} is not supported by OpenAI provider`,
        'INVALID_REQUEST',
        'openai'
      );
    }

    return openaiModel;
  }

  async complete(request: AICompletionRequest): Promise<AICompletionResponse> {
    const client = this.getClient();

    try {
      const params: OpenAI.ChatCompletionCreateParams = {
        model: this.getModelId(request.model),
        messages: toOpenAIMessages(request.messages, request.systemPrompt),
        max_tokens: request.maxTokens,
        temperature: request.temperature,
      };

      // Add tools if present
      if (request.tools && request.tools.length > 0) {
        params.tools = toOpenAITools(request.tools);

        // Handle tool choice
        if (request.toolChoice) {
          if (request.toolChoice === 'auto') {
            params.tool_choice = 'auto';
          } else if (request.toolChoice === 'none') {
            params.tool_choice = 'none';
          } else if (request.toolChoice === 'required') {
            params.tool_choice = 'required';
          } else if (typeof request.toolChoice === 'object') {
            params.tool_choice = {
              type: 'function',
              function: { name: request.toolChoice.name },
            };
          }
        }
      }

      // Handle JSON mode
      if (request.responseFormat === 'json') {
        params.response_format = { type: 'json_object' };
      }

      const response = await client.chat.completions.create(params);
      const choice = response.choices[0];

      return {
        id: response.id,
        content: choice.message.content || '',
        model: request.model || this.config.defaultModel,
        toolCalls: extractToolCalls(choice.message.tool_calls),
        usage: {
          promptTokens: response.usage?.prompt_tokens || 0,
          completionTokens: response.usage?.completion_tokens || 0,
          totalTokens: response.usage?.total_tokens || 0,
        },
        finishReason: mapFinishReason(choice.finish_reason),
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
      const params: OpenAI.ChatCompletionCreateParams = {
        model: this.getModelId(request.model),
        messages: toOpenAIMessages(request.messages, request.systemPrompt),
        max_tokens: request.maxTokens,
        temperature: request.temperature,
        stream: true,
      };

      if (request.tools && request.tools.length > 0) {
        params.tools = toOpenAITools(request.tools);
      }

      const stream = await client.chat.completions.create(params);

      let currentId = '';
      const accumulatedToolCalls: Map<number, Partial<ToolCall>> = new Map();

      for await (const chunk of stream) {
        currentId = chunk.id;
        const delta = chunk.choices[0]?.delta;
        const finishReason = chunk.choices[0]?.finish_reason;

        if (delta?.content) {
          yield {
            id: currentId,
            content: delta.content,
          };
        }

        if (delta?.tool_calls) {
          for (const toolCall of delta.tool_calls) {
            const existing = accumulatedToolCalls.get(toolCall.index) || {
              id: '',
              name: '',
              arguments: {},
            };

            if (toolCall.id) existing.id = toolCall.id;
            if (toolCall.function?.name)
              existing.name = toolCall.function.name;

            accumulatedToolCalls.set(toolCall.index, existing);
          }

          yield {
            id: currentId,
            content: '',
            toolCalls: Array.from(accumulatedToolCalls.values()),
          };
        }

        if (finishReason) {
          yield {
            id: currentId,
            content: '',
            finishReason: mapFinishReason(finishReason),
          };
        }
      }
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const client = this.getClient();

    try {
      const modelId = request.model || 'text-embedding-3-small';
      const openaiModel = OPENAI_MODEL_MAP[modelId];

      if (!openaiModel) {
        throw new AIError(
          `Model ${modelId} is not an embedding model`,
          'INVALID_REQUEST',
          'openai'
        );
      }

      const params: OpenAI.EmbeddingCreateParams = {
        model: openaiModel,
        input: request.input,
      };

      // Add dimensions if specified (only for text-embedding-3-* models)
      if (request.dimensions && openaiModel.startsWith('text-embedding-3')) {
        params.dimensions = request.dimensions;
      }

      const response = await client.embeddings.create(params);

      return {
        embeddings: response.data.map((d) => d.embedding),
        model: modelId,
        usage: {
          promptTokens: response.usage.prompt_tokens,
          totalTokens: response.usage.total_tokens,
        },
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async countTokens(text: string): Promise<number> {
    // OpenAI doesn't have a direct token counting API
    // Use rough estimation (4 chars per token for English)
    // For more accurate counting, consider using tiktoken library
    return Math.ceil(text.length / 4);
  }

  getAvailableModels(): AIModelId[] {
    return Object.keys(OPENAI_MODEL_MAP) as AIModelId[];
  }

  supportsCapability(
    model: AIModelId,
    capability: 'tools' | 'vision' | 'json_mode' | 'embeddings'
  ): boolean {
    const config = MODEL_CONFIGS[model];
    if (!config || config.provider !== 'openai') {
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
        return config.isEmbeddingModel;
      default:
        return false;
    }
  }

  private handleError(error: unknown): AIError {
    // Check if it's an OpenAI API error with status property
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
          'Invalid OpenAI API key',
          'AUTHENTICATION_ERROR',
          'openai',
          statusCode,
          false
        );
      }

      if (statusCode === 429) {
        return new AIError(
          'OpenAI rate limit exceeded',
          'RATE_LIMIT',
          'openai',
          statusCode,
          true
        );
      }

      if (statusCode === 400 && message.includes('context_length')) {
        return new AIError(
          'Context length exceeded for OpenAI model',
          'CONTEXT_LENGTH_EXCEEDED',
          'openai',
          statusCode,
          false
        );
      }

      return new AIError(
        message || 'OpenAI API error',
        'PROVIDER_ERROR',
        'openai',
        statusCode,
        statusCode >= 500
      );
    }

    if (error instanceof Error) {
      if (error.message.includes('timeout')) {
        return new AIError(
          'OpenAI request timed out',
          'TIMEOUT',
          'openai',
          undefined,
          true
        );
      }

      if (
        error.message.includes('network') ||
        error.message.includes('ECONNREFUSED')
      ) {
        return new AIError(
          'Network error connecting to OpenAI',
          'NETWORK_ERROR',
          'openai',
          undefined,
          true
        );
      }

      return new AIError(error.message, 'UNKNOWN', 'openai', undefined, false);
    }

    return new AIError(
      'Unknown error occurred',
      'UNKNOWN',
      'openai',
      undefined,
      false
    );
  }
}
