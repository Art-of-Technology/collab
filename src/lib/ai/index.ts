// AI Assistant Module
// Provides AI-powered assistance for the Collab platform

export {
  AgentAssistant,
  AIAssistant,
  createAssistant,
  getAIAssistant,
  resetAIAssistant,
  type AIMessage,
  type AIAction,
  type AISuggestion,
  type AIContext,
  type AIAssistantConfig,
} from './assistant';

export {
  buildAIContext,
  buildEnrichedContext,
  getPageContextFromPath,
  getContextualPrompt,
  getSuggestedActions,
  parseUserIntent,
} from './context';

export {
  executeAction,
  executeCreateIssue,
  executeUpdateIssue,
  executeSearch,
  executeNavigate,
  executeSummarize,
  executeAnalyze,
  executeAssign,
  executeSprintReport,
  executeWorkloadBalance,
  getAgentActions,
  canAgentExecute,
  validateActionParams,
  type ActionResult,
  type ActionExecutor,
} from './actions';

export {
  createStreamingResponse,
  createSSEHeaders,
} from './streaming';

export {
  AI_TOOLS,
  executeTool,
} from './tools';

// Re-export agent system
export {
  getAllAgents,
  getAgent,
  getDefaultAgent,
  type AgentDefinition,
  type AgentCapability,
  type AgentChatRequest,
  type AgentChatResponse,
} from './agents';
