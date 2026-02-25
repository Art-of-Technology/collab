"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useWorkspace } from "./WorkspaceContext";
import type { AIContext as AIContextType } from "@/lib/ai";
import {
  buildAIContext,
  getPageContextFromPath,
  getSuggestedActions,
  getContextualPrompt,
} from "@/lib/ai";
import type {
  StreamEvent,
  ToolStartStreamEvent,
  ToolResultStreamEvent,
  WebSearchResultsStreamEvent,
} from "@/lib/ai/streaming";

// ──────────────────────────────────────────
// Types
// ──────────────────────────────────────────

export interface ClientAgent {
  slug: string;
  name: string;
  avatar?: string;
  color: string;
  description: string;
  personality: string;
  capabilities: string[];
  isDefault: boolean;
}

/** A single content block in a message — text, tool call, or tool result */
export interface ContentBlock {
  type: "text" | "tool_start" | "tool_input" | "tool_result" | "web_search_results";
  /** For text blocks */
  text?: string;
  /** For tool_start blocks */
  toolType?: "mcp" | "web_search";
  toolName?: string;
  serverName?: string;
  toolUseId?: string;
  /** For tool_input blocks */
  input?: Record<string, unknown>;
  /** For tool_result blocks */
  isError?: boolean;
  content?: string;
  /** For web_search_results blocks */
  results?: Array<{ url: string; title: string; pageAge?: string }>;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  /** Raw text content (for persistence and simple rendering) */
  text: string;
  /** Structured content blocks (for rich rendering) */
  blocks: ContentBlock[];
  timestamp: Date;
}

/** Tracks a tool call in progress */
export interface ActiveToolCall {
  toolUseId: string;
  toolName: string;
  toolType: "mcp" | "web_search";
  serverName?: string;
  input?: Record<string, unknown>;
  status: "running" | "completed" | "error";
  result?: string;
}

export interface QuickAction {
  id: string;
  label: string;
  prompt: string;
  icon?: string;
}

interface AIProviderState {
  // Agent (Cleo — single agent, no switching)
  agent: ClientAgent | null;

  // Chat bar state
  isExpanded: boolean;
  isFocused: boolean;
  expandChat: () => void;
  collapseChat: () => void;
  focusInput: () => void;
  blurInput: () => void;

  // Conversation state
  conversationId: string | null;
  messages: ChatMessage[];
  isLoading: boolean;
  isStreaming: boolean;
  streamingText: string;
  activeToolCalls: ActiveToolCall[];

  // Web search
  webSearchEnabled: boolean;
  setWebSearchEnabled: (enabled: boolean) => void;

  // Actions
  sendMessage: (message: string) => Promise<void>;
  clearConversation: () => void;
  startNewConversation: () => void;

  // Quick actions / suggestions
  quickActions: QuickAction[];
  executeQuickAction: (action: QuickAction) => void;

  // Context
  context: AIContextType | null;
  getPlaceholder: () => string;

  // Backward compat
  isOpen: boolean;
  openWidget: () => void;
  closeWidget: () => void;
  toggleWidget: () => void;
}

const AIProviderContext = createContext<AIProviderState | undefined>(undefined);

// ──────────────────────────────────────────
// Provider
// ──────────────────────────────────────────

export function AIProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const { currentWorkspace } = useWorkspace();
  const pathname = usePathname();
  const router = useRouter();

  // Agent state (Cleo only)
  const [agent, setAgent] = useState<ClientAgent | null>(null);

  // Chat state
  const [isExpanded, setIsExpanded] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [activeToolCalls, setActiveToolCalls] = useState<ActiveToolCall[]>([]);

  // Web search
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);

  // Suggestions
  const [quickActions, setQuickActions] = useState<QuickAction[]>([]);

  // Refs
  const contextRef = useRef<AIContextType | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // ── Load agent (Cleo) ──
  useEffect(() => {
    async function fetchAgent() {
      try {
        const response = await fetch("/api/ai/agents");
        if (response.ok) {
          const data = await response.json();
          const defaultAgent =
            data.agents?.find((a: ClientAgent) => a.isDefault) || data.agents?.[0];
          if (defaultAgent) {
            setAgent(defaultAgent);
          }
        }
      } catch {
        // Fallback
        setAgent({
          slug: "cleo",
          name: "Cleo",
          color: "#6366f1",
          description: "Your AI-powered workspace assistant",
          personality: "Smart, proactive, and direct",
          capabilities: [],
          isDefault: true,
        });
      }
    }
    fetchAgent();
  }, []);

  // ── Build context ──
  useEffect(() => {
    if (session?.user && currentWorkspace) {
      const pageContext = getPageContextFromPath(pathname);
      const context = buildAIContext({
        user: {
          id: session.user.id || "",
          name: session.user.name,
          email: session.user.email,
        },
        workspace: {
          id: currentWorkspace.id,
          name: currentWorkspace.name,
          slug: currentWorkspace.slug,
        },
        currentPage: pageContext,
      });

      contextRef.current = context;

      // Update quick actions based on page context
      const actions = getSuggestedActions(context).map((action, index) => ({
        id: `qa_${index}`,
        label: action.label,
        prompt: action.prompt,
      }));
      setQuickActions(actions);
    }
  }, [session, currentWorkspace, pathname]);

  // ── Chat bar actions ──
  const expandChat = useCallback(() => setIsExpanded(true), []);
  const collapseChat = useCallback(() => {
    setIsExpanded(false);
    setIsFocused(false);
  }, []);
  const focusInput = useCallback(() => {
    setIsFocused(true);
    setIsExpanded(true);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);
  const blurInput = useCallback(() => setIsFocused(false), []);

  // ── Send message (streaming via MCP connector) ──
  const sendMessage = useCallback(
    async (message: string) => {
      if (!contextRef.current || isLoading || isStreaming) return;

      const userMsg: ChatMessage = {
        id: `msg_${Date.now()}`,
        role: "user",
        text: message,
        blocks: [{ type: "text", text: message }],
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);
      setIsStreaming(true);
      setStreamingText("");
      setActiveToolCalls([]);
      setIsExpanded(true);

      abortControllerRef.current = new AbortController();

      // Collect blocks for the assistant message
      const assistantBlocks: ContentBlock[] = [];
      let fullText = "";

      try {
        const response = await fetch("/api/ai/chat/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message,
            context: contextRef.current,
            history: messages.slice(-20).map((m) => ({
              role: m.role,
              content: m.text,
            })),
            conversationId,
            webSearchEnabled,
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) throw new Error(`API error: ${response.status}`);
        if (!response.body) throw new Error("No response body");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;

            let event: StreamEvent;
            try {
              event = JSON.parse(line.slice(6));
            } catch {
              continue;
            }

            switch (event.type) {
              case "text": {
                const text = (event as any).content as string;
                fullText += text;
                setStreamingText(fullText);

                // Append to last text block or create new one
                const lastBlock = assistantBlocks[assistantBlocks.length - 1];
                if (lastBlock?.type === "text") {
                  lastBlock.text = (lastBlock.text || "") + text;
                } else {
                  assistantBlocks.push({ type: "text", text });
                }
                break;
              }

              case "tool_start": {
                const e = event as ToolStartStreamEvent;
                assistantBlocks.push({
                  type: "tool_start",
                  toolType: e.toolType,
                  toolName: e.toolName,
                  serverName: e.serverName,
                  toolUseId: e.toolUseId,
                });
                setActiveToolCalls((prev) => [
                  ...prev,
                  {
                    toolUseId: e.toolUseId,
                    toolName: e.toolName,
                    toolType: e.toolType,
                    serverName: e.serverName,
                    status: "running",
                  },
                ]);
                break;
              }

              case "tool_input": {
                const e = event as any;
                assistantBlocks.push({
                  type: "tool_input",
                  toolUseId: e.toolUseId,
                  input: e.input,
                });
                setActiveToolCalls((prev) =>
                  prev.map((tc) =>
                    tc.toolUseId === e.toolUseId ? { ...tc, input: e.input } : tc
                  )
                );
                break;
              }

              case "tool_result": {
                const e = event as ToolResultStreamEvent;
                assistantBlocks.push({
                  type: "tool_result",
                  toolUseId: e.toolUseId,
                  isError: e.isError,
                  content: e.content,
                });
                setActiveToolCalls((prev) =>
                  prev.map((tc) =>
                    tc.toolUseId === e.toolUseId
                      ? { ...tc, status: e.isError ? "error" : "completed", result: e.content }
                      : tc
                  )
                );
                break;
              }

              case "web_search_results": {
                const e = event as WebSearchResultsStreamEvent;
                assistantBlocks.push({
                  type: "web_search_results",
                  toolUseId: e.toolUseId,
                  results: e.results,
                });
                setActiveToolCalls((prev) =>
                  prev.map((tc) =>
                    tc.toolUseId === e.toolUseId ? { ...tc, status: "completed" } : tc
                  )
                );
                break;
              }

              case "conversation": {
                const cid = (event as any).conversationId;
                if (cid) setConversationId(cid);
                break;
              }

              case "done": {
                const doneText = (event as any).fullContent || fullText;

                // Parse navigation actions from text
                const actionMatch = doneText.match(
                  /\[ACTION:\s*type="navigate"\s*params=(\{[^}]+\})\]/
                );
                if (actionMatch) {
                  try {
                    const params = JSON.parse(actionMatch[1]);
                    const path = params.path;
                    if (path && currentWorkspace?.slug) {
                      const fullPath = path.startsWith("/")
                        ? `/${currentWorkspace.slug}${path}`
                        : path;
                      router.push(fullPath);
                    }
                  } catch {
                    // Skip malformed action
                  }
                }
                break;
              }

              case "error": {
                const errMsg = (event as any).message || "An error occurred.";
                throw new Error(errMsg);
              }
            }
          }
        }

        // Build final assistant message
        const assistantMsg: ChatMessage = {
          id: `msg_${Date.now()}_ai`,
          role: "assistant",
          text: fullText,
          blocks: assistantBlocks,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
        setStreamingText("");
        setActiveToolCalls([]);
      } catch (error: any) {
        if (error.name === "AbortError") return;

        console.error("Chat error:", error);
        let errorMsg = "I encountered an error. Please try again.";
        if (error.message?.includes("MCP")) {
          errorMsg = "Failed to connect to workspace tools. Please try again.";
        }

        setMessages((prev) => [
          ...prev,
          {
            id: `msg_${Date.now()}_err`,
            role: "assistant",
            text: errorMsg,
            blocks: [{ type: "text", text: errorMsg }],
            timestamp: new Date(),
          },
        ]);
        setStreamingText("");
        setActiveToolCalls([]);
      } finally {
        setIsLoading(false);
        setIsStreaming(false);
        abortControllerRef.current = null;
      }
    },
    [isLoading, isStreaming, messages, conversationId, webSearchEnabled, router, currentWorkspace]
  );

  // ── Conversation management ──
  const clearConversation = useCallback(() => {
    setMessages([]);
    setConversationId(null);
    setStreamingText("");
    setActiveToolCalls([]);
  }, []);

  const startNewConversation = useCallback(() => {
    clearConversation();
    focusInput();
  }, [clearConversation, focusInput]);

  // ── Quick actions ──
  const executeQuickAction = useCallback(
    (action: QuickAction) => {
      sendMessage(action.prompt);
    },
    [sendMessage]
  );

  // ── Placeholder text ──
  const getPlaceholder = useCallback(() => {
    const pageType = contextRef.current?.currentPage?.type || "other";
    return getContextualPrompt(pageType);
  }, []);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl+K: Focus search/AI input
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (isExpanded) {
          collapseChat();
        } else {
          focusInput();
        }
      }
      // Escape: Collapse
      if (e.key === "Escape" && isExpanded) {
        collapseChat();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isExpanded, collapseChat, focusInput]);

  // ── Provider value ──
  const value: AIProviderState = {
    agent,
    isExpanded,
    isFocused,
    expandChat,
    collapseChat,
    focusInput,
    blurInput,
    conversationId,
    messages,
    isLoading,
    isStreaming,
    streamingText,
    activeToolCalls,
    webSearchEnabled,
    setWebSearchEnabled,
    sendMessage,
    clearConversation,
    startNewConversation,
    quickActions,
    executeQuickAction,
    context: contextRef.current,
    getPlaceholder,
    // Backward compat
    isOpen: isExpanded,
    openWidget: expandChat,
    closeWidget: collapseChat,
    toggleWidget: () => (isExpanded ? collapseChat() : focusInput()),
  };

  return (
    <AIProviderContext.Provider value={value}>
      {children}
    </AIProviderContext.Provider>
  );
}

// ──────────────────────────────────────────
// Hooks
// ──────────────────────────────────────────

export function useAI() {
  const context = useContext(AIProviderContext);
  if (context === undefined) {
    throw new Error("useAI must be used within an AIProvider");
  }
  return context;
}

export function useAIChat() {
  const {
    messages,
    sendMessage,
    clearConversation,
    isLoading,
    isStreaming,
    streamingText,
    activeToolCalls,
    agent,
  } = useAI();
  return {
    messages,
    sendMessage,
    clearConversation,
    isLoading,
    isStreaming,
    streamingText,
    activeToolCalls,
    agent,
    // Legacy compat
    sendStreamingMessage: sendMessage,
    clearHistory: clearConversation,
    currentAgent: agent,
    streamingContent: streamingText,
  };
}

export function useAIWidget() {
  const {
    isExpanded,
    isFocused,
    expandChat,
    collapseChat,
    focusInput,
    blurInput,
    isOpen,
    openWidget,
    closeWidget,
    toggleWidget,
  } = useAI();

  return {
    isExpanded,
    isFocused,
    expandChat,
    collapseChat,
    focusInput,
    blurInput,
    isOpen,
    isMinimized: false,
    openWidget,
    closeWidget,
    toggleWidget,
    minimizeWidget: collapseChat,
    expandWidget: expandChat,
  };
}

/** @deprecated Use useAI().agent instead */
export function useAIAgents() {
  const { agent } = useAI();
  return {
    currentAgent: agent,
    availableAgents: agent ? [agent] : [],
    setCurrentAgent: () => {},
  };
}

export function useAISuggestions() {
  const { quickActions, executeQuickAction, isLoading } = useAI();
  return {
    suggestions: quickActions.map((a) => ({
      id: a.id,
      type: "quick_action" as const,
      title: a.label,
      description: a.prompt,
    })),
    executeSuggestion: (s: any) => executeQuickAction({ id: s.id, label: s.title, prompt: s.description }),
    isLoading,
  };
}

export function useAIConversation() {
  const { conversationId, messages, startNewConversation, clearConversation } = useAI();
  return {
    currentConversationId: conversationId,
    messages,
    loadConversation: async () => {},
    startNewConversation,
    clearConversation,
  };
}
