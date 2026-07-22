// Re-export all AI hooks from context for convenience
export {
  useAI,
  useAIChat,
  useAISuggestions,
  useAIWidget,
  useAIAgents,
  useAIConversation,
} from '@/context/AIContext';

export type { ClientAgent } from '@/context/AIContext';
