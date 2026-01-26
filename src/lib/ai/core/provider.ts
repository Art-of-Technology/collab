/**
 * AI Provider Abstraction Layer
 *
 * This module defines the abstract interface for AI providers and
 * implements the provider factory pattern for multi-provider support.
 */

import type {
  AIProviderType,
  AIProviderConfig,
  AIModelId,
  AICompletionRequest,
  AICompletionResponse,
  AIStreamChunk,
  EmbeddingRequest,
  EmbeddingResponse,
  AIError,
} from './types';

// ============================================================================
// Abstract Provider Interface
// ============================================================================

export abstract class AIProvider {
  protected config: AIProviderConfig;

  constructor(config: AIProviderConfig) {
    this.config = config;
  }

  /**
   * Get the provider type
   */
  abstract get providerType(): AIProviderType;

  /**
   * Check if the provider is properly configured
   */
  abstract isConfigured(): boolean;

  /**
   * Generate a completion (non-streaming)
   */
  abstract complete(request: AICompletionRequest): Promise<AICompletionResponse>;

  /**
   * Generate a streaming completion
   */
  abstract stream(
    request: AICompletionRequest
  ): AsyncGenerator<AIStreamChunk, void, unknown>;

  /**
   * Generate embeddings for text
   */
  abstract embed(request: EmbeddingRequest): Promise<EmbeddingResponse>;

  /**
   * Count tokens in a text (approximate)
   */
  abstract countTokens(text: string): Promise<number>;

  /**
   * Get available models for this provider
   */
  abstract getAvailableModels(): AIModelId[];

  /**
   * Check if a model supports a specific capability
   */
  abstract supportsCapability(
    model: AIModelId,
    capability: 'tools' | 'vision' | 'json_mode' | 'embeddings'
  ): boolean;
}

// ============================================================================
// Provider Registry
// ============================================================================

type ProviderConstructor = new (config: AIProviderConfig) => AIProvider;

class AIProviderRegistry {
  private providers: Map<AIProviderType, ProviderConstructor> = new Map();
  private instances: Map<AIProviderType, AIProvider> = new Map();

  /**
   * Register a provider implementation
   */
  register(type: AIProviderType, constructor: ProviderConstructor): void {
    this.providers.set(type, constructor);
  }

  /**
   * Get or create a provider instance
   */
  getProvider(type: AIProviderType, config: AIProviderConfig): AIProvider {
    // Check if we already have an instance
    const existing = this.instances.get(type);
    if (existing) {
      return existing;
    }

    // Get the constructor
    const Constructor = this.providers.get(type);
    if (!Constructor) {
      throw new Error(`Unknown AI provider: ${type}`);
    }

    // Create and cache the instance
    const instance = new Constructor(config);
    this.instances.set(type, instance);
    return instance;
  }

  /**
   * Check if a provider is registered
   */
  hasProvider(type: AIProviderType): boolean {
    return this.providers.has(type);
  }

  /**
   * Get all registered provider types
   */
  getRegisteredProviders(): AIProviderType[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Clear cached instances (useful for testing)
   */
  clearInstances(): void {
    this.instances.clear();
  }
}

// Global registry instance
export const providerRegistry = new AIProviderRegistry();

// ============================================================================
// Model Configuration
// ============================================================================

interface ModelConfig {
  provider: AIProviderType;
  contextWindow: number;
  maxOutputTokens: number;
  supportsTools: boolean;
  supportsVision: boolean;
  supportsJsonMode: boolean;
  isEmbeddingModel: boolean;
  costPer1kInputTokens: number;
  costPer1kOutputTokens: number;
}

export const MODEL_CONFIGS: Record<AIModelId, ModelConfig> = {
  // Anthropic models
  'claude-opus-4': {
    provider: 'anthropic',
    contextWindow: 200000,
    maxOutputTokens: 32000,
    supportsTools: true,
    supportsVision: true,
    supportsJsonMode: true,
    isEmbeddingModel: false,
    costPer1kInputTokens: 0.015,
    costPer1kOutputTokens: 0.075,
  },
  'claude-sonnet-4': {
    provider: 'anthropic',
    contextWindow: 200000,
    maxOutputTokens: 64000,
    supportsTools: true,
    supportsVision: true,
    supportsJsonMode: true,
    isEmbeddingModel: false,
    costPer1kInputTokens: 0.003,
    costPer1kOutputTokens: 0.015,
  },
  'claude-haiku-3.5': {
    provider: 'anthropic',
    contextWindow: 200000,
    maxOutputTokens: 8192,
    supportsTools: true,
    supportsVision: true,
    supportsJsonMode: true,
    isEmbeddingModel: false,
    costPer1kInputTokens: 0.0008,
    costPer1kOutputTokens: 0.004,
  },
  // OpenAI models
  'gpt-4o': {
    provider: 'openai',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    supportsTools: true,
    supportsVision: true,
    supportsJsonMode: true,
    isEmbeddingModel: false,
    costPer1kInputTokens: 0.0025,
    costPer1kOutputTokens: 0.01,
  },
  'gpt-4o-mini': {
    provider: 'openai',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    supportsTools: true,
    supportsVision: true,
    supportsJsonMode: true,
    isEmbeddingModel: false,
    costPer1kInputTokens: 0.00015,
    costPer1kOutputTokens: 0.0006,
  },
  'gpt-4-turbo': {
    provider: 'openai',
    contextWindow: 128000,
    maxOutputTokens: 4096,
    supportsTools: true,
    supportsVision: true,
    supportsJsonMode: true,
    isEmbeddingModel: false,
    costPer1kInputTokens: 0.01,
    costPer1kOutputTokens: 0.03,
  },
  'text-embedding-3-small': {
    provider: 'openai',
    contextWindow: 8191,
    maxOutputTokens: 0,
    supportsTools: false,
    supportsVision: false,
    supportsJsonMode: false,
    isEmbeddingModel: true,
    costPer1kInputTokens: 0.00002,
    costPer1kOutputTokens: 0,
  },
  'text-embedding-3-large': {
    provider: 'openai',
    contextWindow: 8191,
    maxOutputTokens: 0,
    supportsTools: false,
    supportsVision: false,
    supportsJsonMode: false,
    isEmbeddingModel: true,
    costPer1kInputTokens: 0.00013,
    costPer1kOutputTokens: 0,
  },
  // Local model (placeholder)
  'local-llm': {
    provider: 'local',
    contextWindow: 8192,
    maxOutputTokens: 4096,
    supportsTools: false,
    supportsVision: false,
    supportsJsonMode: false,
    isEmbeddingModel: false,
    costPer1kInputTokens: 0,
    costPer1kOutputTokens: 0,
  },
};

/**
 * Get the appropriate model for a task type
 */
export function getModelForTask(
  task:
    | 'reasoning'
    | 'coding'
    | 'quick_classification'
    | 'embeddings'
    | 'content_generation'
): AIModelId {
  switch (task) {
    case 'reasoning':
      return 'claude-opus-4';
    case 'coding':
      return 'claude-sonnet-4';
    case 'quick_classification':
      return 'claude-haiku-3.5';
    case 'embeddings':
      return 'text-embedding-3-small';
    case 'content_generation':
      return 'claude-sonnet-4';
    default:
      return 'claude-sonnet-4';
  }
}

/**
 * Get the provider type for a model
 */
export function getProviderForModel(model: AIModelId): AIProviderType {
  return MODEL_CONFIGS[model].provider;
}

/**
 * Estimate cost for a completion
 */
export function estimateCost(
  model: AIModelId,
  inputTokens: number,
  outputTokens: number
): number {
  const config = MODEL_CONFIGS[model];
  return (
    (inputTokens / 1000) * config.costPer1kInputTokens +
    (outputTokens / 1000) * config.costPer1kOutputTokens
  );
}
