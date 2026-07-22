// AI Module — Cleo-powered workspace assistant
// Uses Anthropic MCP connector for tools + web search

// Streaming types and utilities
export {
  createSSEHeaders,
  type StreamEventType,
  type StreamEvent,
  type AgentStreamEvent,
  type TextStreamEvent,
  type ToolStartStreamEvent,
  type ToolInputStreamEvent,
  type ToolResultStreamEvent,
  type WebSearchResultsStreamEvent,
  type ConversationStreamEvent,
  type DoneStreamEvent,
  type ErrorStreamEvent,
} from './streaming';

// MCP token provisioning — server-only, import directly from './mcp-token'
// Do NOT re-export here: it pulls bcrypt/node-pre-gyp into client bundles

// Agent system
export {
  cleoAgent,
  getAllAgents,
  getAgent,
  getDefaultAgent,
  invalidateAgentCache,
  type AgentDefinition,
  type AgentCapability,
  type AgentMessage,
  type AgentAction,
  type AgentSuggestion,
  type AgentChatRequest,
  type AgentChatResponse,
} from './agents';

// Context utilities (still used for page detection and suggestions)
export {
  buildAIContext,
  buildEnrichedContext,
  getPageContextFromPath,
  getContextualPrompt,
  getSuggestedActions,
  parseUserIntent,
} from './context';

// Legacy assistant types (kept for backward compat, tools stubbed internally)
export {
  createAssistant,
  AgentAssistant,
  type AIMessage,
  type AIAction,
  type AISuggestion,
  type AIContext,
  type AIAssistantConfig,
} from './assistant';
