// AI Components

// Chat Bar (replaces AIAssistantWidget)
export { ChatBar } from './ChatBar';
export { ChatPanel } from './ChatBar';
export { ChatInput } from './ChatBar';
export { AgentSelector } from './ChatBar';
export { StreamingMessage } from './ChatBar';

// Rich Cards
export { IssueCard } from './cards';
export { ProjectCard } from './cards';
export { ActionConfirmation } from './cards';
export { SearchResultsList } from './cards';

// Message & AI Components
export { default as AIMessage } from './AIMessage';
export { default as AIQuickActions, AIQuickActionsCompact } from './AIQuickActions';
export { default as AISuggestion, AIInsightCard } from './AISuggestion';
export { default as AIFilterBar, convertToViewFilters } from './AIFilterBar';
export type { ParsedFilter } from './AIFilterBar';
export { default as AIIssueSidebar } from './AIIssueSidebar';

// Legacy (deprecated - use ChatBar instead)
export { default as AIAssistantWidget } from './AIAssistantWidget';
