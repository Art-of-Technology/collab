// AI Assistant Module
// Provides AI-powered assistance for the Collab platform

export {
  AIAssistant,
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
  validateActionParams,
  type ActionResult,
  type ActionExecutor,
} from './actions';
