/**
 * AI Streaming Utilities
 *
 * Provides SSE header creation and stream event types for the AI chat system.
 * The actual streaming logic is now in the API route, using Anthropic's
 * native streaming with MCP connector.
 */

/**
 * SSE event types sent from the streaming API to the frontend.
 *
 * Event flow:
 * 1. `agent` — Agent identity (name, color, slug)
 * 2. `text` — Streaming text chunks (may be multiple)
 * 3. `tool_start` — Tool call initiated (mcp or web_search)
 * 4. `tool_input` — Complete tool input (after streaming finishes)
 * 5. `tool_result` — MCP tool result
 * 6. `web_search_results` — Web search results with URLs
 * 7. `conversation` — Conversation ID for persistence
 * 8. `done` — Stream complete with full text content
 * 9. `error` — Error occurred
 */
export type StreamEventType =
  | 'agent'
  | 'text'
  | 'tool_start'
  | 'tool_input'
  | 'tool_result'
  | 'web_search_results'
  | 'conversation'
  | 'done'
  | 'error';

export interface StreamEvent {
  type: StreamEventType;
  [key: string]: unknown;
}

export interface AgentStreamEvent extends StreamEvent {
  type: 'agent';
  agent: {
    slug: string;
    name: string;
    color: string;
  };
}

export interface TextStreamEvent extends StreamEvent {
  type: 'text';
  content: string;
}

export interface ToolStartStreamEvent extends StreamEvent {
  type: 'tool_start';
  toolType: 'mcp' | 'web_search';
  toolName: string;
  serverName?: string;
  toolUseId: string;
}

export interface ToolInputStreamEvent extends StreamEvent {
  type: 'tool_input';
  toolUseId: string;
  input: Record<string, unknown>;
}

export interface ToolResultStreamEvent extends StreamEvent {
  type: 'tool_result';
  toolUseId: string;
  isError: boolean;
  content: string;
}

export interface WebSearchResultsStreamEvent extends StreamEvent {
  type: 'web_search_results';
  toolUseId: string;
  results: Array<{
    url: string;
    title: string;
    pageAge?: string;
  }>;
}

export interface ConversationStreamEvent extends StreamEvent {
  type: 'conversation';
  conversationId: string | undefined;
}

export interface DoneStreamEvent extends StreamEvent {
  type: 'done';
  fullContent: string;
}

export interface ErrorStreamEvent extends StreamEvent {
  type: 'error';
  message: string;
}

/**
 * Create SSE headers for streaming responses.
 */
export function createSSEHeaders(): HeadersInit {
  return {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  };
}
