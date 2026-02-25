// AI Agent Type System

export type AgentCapability =
  | 'navigate'
  | 'search'
  | 'summarize'
  | 'analyze'
  | 'answer'
  | 'create_issue'
  | 'update_issue'
  | 'sprint_report'
  | 'workload_balance'
  | 'triage'
  | 'assign';

export interface AgentDefinition {
  slug: string;
  name: string;
  avatar?: string;
  color: string;
  systemPrompt: string;
  capabilities: AgentCapability[];
  personality: string;
  description: string;
  isDefault?: boolean;
}

export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  agentSlug?: string;
  timestamp: Date;
  metadata?: {
    action?: AgentAction;
    cards?: RenderedCard[];
    suggestions?: AgentSuggestion[];
  };
}

export interface AgentAction {
  type: string;
  params: Record<string, unknown>;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  result?: unknown;
}

export interface AgentSuggestion {
  id: string;
  type: 'quick_action' | 'issue' | 'view' | 'insight' | 'navigation';
  title: string;
  description: string;
  action?: AgentAction;
  priority?: 'high' | 'medium' | 'low';
}

export type CardType = 'issue' | 'project' | 'action_confirmation' | 'search_results' | 'sprint_report' | 'workload';

export interface RenderedCard {
  type: CardType;
  data: Record<string, unknown>;
}

export interface AgentChatRequest {
  message: string;
  agentSlug: string;
  conversationId?: string;
  workspaceId: string;
  context?: {
    currentPage?: string;
    selectedIssues?: string[];
    projectId?: string;
  };
}

export interface AgentChatResponse {
  message: AgentMessage;
  conversationId: string;
}
