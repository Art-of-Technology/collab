/**
 * AI Orchestration Layer - Main Exports
 *
 * This is the main entry point for the AI-native features of Collab.
 * Import from this module to access all AI functionality.
 */

// Core types
export * from './core/types';

// Provider system
export {
  AIProvider,
  providerRegistry,
  MODEL_CONFIGS,
  getModelForTask,
  getProviderForModel,
  estimateCost,
} from './core/provider';

// Provider implementations
export { AnthropicProvider } from './providers/anthropic';
export { OpenAIProvider } from './providers/openai';

// Orchestrator
export {
  AIOrchestrator,
  getAIOrchestrator,
  resetAIOrchestrator,
  type OrchestratorConfig,
  type ToolExecutor,
} from './core/orchestrator';

// Agent system
export {
  AIAgentRegistry,
  getAgentRegistry,
  resetAgentRegistry,
  DEFAULT_AGENTS,
} from './agents/agent-registry';

// Automation
export * from './automation';

// Agent Services
export {
  AIAgentScheduler,
  getScheduler,
  resetScheduler,
  TASK_TYPES,
  type ScheduledTask,
  type TaskExecution,
  type SchedulerConfig,
  type ScheduleFrequency,
  type TaskPriority,
} from './agents/scheduler';

export {
  DailyStandupGenerator,
  getStandupGenerator,
  type StandupContext,
  type StandupSummary,
  type StandupOptions,
} from './agents/daily-standup';

export {
  SprintHealthMonitor,
  getSprintHealthMonitor,
  type SprintData,
  type SprintHealthReport,
  type SprintHealthOptions,
  type HealthStatus,
  type RiskLevel,
} from './agents/sprint-health';

// Content Generation
export * from './content';

// Tools
export {
  WORKSPACE_TOOLS,
  executeWorkspaceTool,
} from './tools/workspace-tools';

// ============================================================================
// Convenience Functions
// ============================================================================

import { getAIOrchestrator } from './core/orchestrator';
import { getAgentRegistry } from './agents/agent-registry';
import type { AIModelId, AICompletionRequest } from './core/types';

/**
 * Quick completion with default settings
 */
export async function aiComplete(
  prompt: string,
  options?: {
    systemPrompt?: string;
    model?: AIModelId;
    temperature?: number;
  }
): Promise<string> {
  const orchestrator = getAIOrchestrator();
  return orchestrator.quickComplete(prompt, options);
}

/**
 * Quick text classification
 */
export async function aiClassify<T extends string>(
  text: string,
  categories: T[],
  description?: string
): Promise<T> {
  const orchestrator = getAIOrchestrator();
  return orchestrator.classify(text, categories, description);
}

/**
 * Quick text summarization
 */
export async function aiSummarize(
  text: string,
  options?: {
    maxLength?: number;
    style?: 'brief' | 'detailed' | 'bullet_points';
  }
): Promise<string> {
  const orchestrator = getAIOrchestrator();
  return orchestrator.summarize(text, options);
}

/**
 * Generate embeddings for text
 */
export async function aiEmbed(
  input: string | string[],
  dimensions?: number
): Promise<number[][]> {
  const orchestrator = getAIOrchestrator();
  const response = await orchestrator.embed({ input, dimensions });
  return response.embeddings;
}

/**
 * Get the best agent for a task
 */
export function getBestAgent(task: string, workspaceId?: string) {
  const registry = getAgentRegistry();
  return registry.getBestAgentForTask(task, workspaceId);
}

/**
 * Get an agent by name
 */
export function getAgent(name: string) {
  const registry = getAgentRegistry();
  return registry.getAgentByName(name);
}
