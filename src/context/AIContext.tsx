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
import type {
  AIMessage,
  AISuggestion,
  AIContext as AIContextType,
} from "@/lib/ai";
import {
  buildAIContext,
  getPageContextFromPath,
  getSuggestedActions,
  getContextualPrompt,
} from "@/lib/ai";

// Agent definition (client-side)
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

interface AIProviderState {
  // Agent state
  currentAgent: ClientAgent | null;
  availableAgents: ClientAgent[];
  setCurrentAgent: (slug: string) => void;

  // Chat bar state (replaces old widget state)
  isExpanded: boolean;
  isFocused: boolean;
  expandChat: () => void;
  collapseChat: () => void;
  focusInput: () => void;
  blurInput: () => void;

  // Conversation state
  currentConversationId: string | null;
  messages: AIMessage[];
  isLoading: boolean;
  isStreaming: boolean;
  streamingContent: string;

  // Conversation management
  sendMessage: (message: string) => Promise<void>;
  sendStreamingMessage: (message: string) => Promise<void>;
  clearConversation: () => void;
  loadConversation: (id: string) => Promise<void>;
  startNewConversation: () => void;

  // Suggestions
  suggestions: AISuggestion[];
  refreshSuggestions: () => void;
  executeSuggestion: (suggestion: AISuggestion) => Promise<void>;

  // Context
  context: AIContextType | null;
  getContextualPrompt: () => string;

  // Backward compatibility
  isOpen: boolean;
  isMinimized: boolean;
  openWidget: () => void;
  closeWidget: () => void;
  toggleWidget: () => void;
  minimizeWidget: () => void;
  expandWidget: () => void;
  clearHistory: () => void;
}

const AIProviderContext = createContext<AIProviderState | undefined>(undefined);

export function AIProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const { currentWorkspace } = useWorkspace();
  const pathname = usePathname();
  const router = useRouter();

  // Agent state
  const [availableAgents, setAvailableAgents] = useState<ClientAgent[]>([]);
  const [currentAgent, setCurrentAgentState] = useState<ClientAgent | null>(
    null
  );

  // Chat bar state
  const [isExpanded, setIsExpanded] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  // Conversation state
  const [currentConversationId, setCurrentConversationId] = useState<
    string | null
  >(null);
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");

  // Suggestions
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);

  // Context ref
  const contextRef = useRef<AIContextType | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Load available agents
  useEffect(() => {
    async function fetchAgents() {
      try {
        const response = await fetch("/api/ai/agents");
        if (response.ok) {
          const data = await response.json();
          setAvailableAgents(data.agents);
          // Set default agent
          const defaultAgent =
            data.agents.find((a: ClientAgent) => a.isDefault) ||
            data.agents[0];
          if (defaultAgent && !currentAgent) {
            setCurrentAgentState(defaultAgent);
          }
        }
      } catch {
        // Fallback agents if API fails
        const fallbackAgents: ClientAgent[] = [
          {
            slug: "alex",
            name: "Alex",
            color: "#8b5cf6",
            description: "General AI assistant",
            personality: "Friendly, helpful, concise",
            capabilities: [
              "navigate",
              "search",
              "summarize",
              "analyze",
              "answer",
            ],
            isDefault: true,
          },
          {
            slug: "nova",
            name: "Nova",
            color: "#3b82f6",
            description: "Project manager agent",
            personality: "Methodical, data-driven, action-oriented",
            capabilities: [
              "create_issue",
              "update_issue",
              "search",
              "sprint_report",
              "workload_balance",
              "triage",
              "assign",
            ],
            isDefault: false,
          },
        ];
        setAvailableAgents(fallbackAgents);
        if (!currentAgent) {
          setCurrentAgentState(fallbackAgents[0]);
        }
      }
    }
    fetchAgents();
  }, []);

  // Build context when dependencies change
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

      // Update suggestions
      const newSuggestions = getSuggestedActions(context).map(
        (action, index) => ({
          id: `suggestion_${index}`,
          type: "quick_action" as const,
          title: action.label,
          description: action.prompt,
        })
      );
      setSuggestions(newSuggestions);
    }
  }, [session, currentWorkspace, pathname]);

  // Set current agent
  const setCurrentAgent = useCallback(
    (slug: string) => {
      const agent = availableAgents.find((a) => a.slug === slug);
      if (agent) {
        setCurrentAgentState(agent);
        // Clear conversation when switching agents
        setMessages([]);
        setCurrentConversationId(null);
        setStreamingContent("");
      }
    },
    [availableAgents]
  );

  // Chat bar actions
  const expandChat = useCallback(() => {
    setIsExpanded(true);
  }, []);

  const collapseChat = useCallback(() => {
    setIsExpanded(false);
    setIsFocused(false);
  }, []);

  const focusInput = useCallback(() => {
    setIsFocused(true);
    setIsExpanded(true);
    // Focus the input element if available
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  }, []);

  const blurInput = useCallback(() => {
    setIsFocused(false);
  }, []);

  // Send non-streaming message
  const sendMessage = useCallback(
    async (message: string) => {
      if (!contextRef.current || isLoading) return;

      const userMessage: AIMessage = {
        id: `msg_${Date.now()}`,
        role: "user",
        content: message,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);
      setIsExpanded(true);

      try {
        const response = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message,
            context: contextRef.current,
            history: messages.slice(-10),
            agentSlug: currentAgent?.slug,
            conversationId: currentConversationId,
          }),
        });

        if (!response.ok) throw new Error("Failed to get AI response");

        const data = await response.json();

        const assistantMessage: AIMessage = {
          id: `msg_${Date.now()}_ai`,
          role: "assistant",
          content: data.content,
          timestamp: new Date(),
          agentSlug: data.agentSlug,
          metadata: {
            action: data.action,
            suggestions: data.suggestions,
          },
        };

        setMessages((prev) => [...prev, assistantMessage]);

        if (data.conversationId) {
          setCurrentConversationId(data.conversationId);
        }

        // Handle navigation action - check both direct and nested params
        const navigateTo = data.action?.navigateTo || data.action?.params?.navigateTo || data.action?.params?.path;
        if (navigateTo && data.action?.type === "navigate") {
          const fullPath = navigateTo.startsWith("/") && currentWorkspace?.slug
            ? `/${currentWorkspace.slug}${navigateTo}`
            : navigateTo;
          router.push(fullPath);
        }

        if (data.suggestions?.length > 0) {
          setSuggestions(data.suggestions);
        }
      } catch (error) {
        console.error("AI chat error:", error);
        setMessages((prev) => [
          ...prev,
          {
            id: `msg_${Date.now()}_error`,
            role: "assistant",
            content:
              "I apologize, but I encountered an error. Please try again.",
            timestamp: new Date(),
            agentSlug: currentAgent?.slug,
          },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, messages, currentAgent, currentConversationId, router]
  );

  // Send streaming message
  const sendStreamingMessage = useCallback(
    async (message: string) => {
      if (!contextRef.current || isLoading || isStreaming) return;

      const userMessage: AIMessage = {
        id: `msg_${Date.now()}`,
        role: "user",
        content: message,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);
      setIsStreaming(true);
      setStreamingContent("");
      setIsExpanded(true);

      // Create abort controller for cancellation
      abortControllerRef.current = new AbortController();

      try {
        const response = await fetch("/api/ai/chat/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message,
            context: contextRef.current,
            history: messages.slice(-10),
            agentSlug: currentAgent?.slug,
            conversationId: currentConversationId,
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) throw new Error("Streaming failed");
        if (!response.body) throw new Error("No response body");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullContent = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value, { stream: true });
          const lines = text.split("\n");

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;

            try {
              const data = JSON.parse(line.slice(6));

              switch (data.type) {
                case "text":
                  fullContent += data.content;
                  setStreamingContent(fullContent);
                  break;

                case "done":
                  // Final message with metadata
                  const assistantMessage: AIMessage = {
                    id: `msg_${Date.now()}_ai`,
                    role: "assistant",
                    content: data.fullContent || fullContent,
                    timestamp: new Date(),
                    agentSlug: currentAgent?.slug,
                    metadata: {
                      action: data.action,
                      suggestions: data.suggestions,
                    },
                  };
                  setMessages((prev) => [...prev, assistantMessage]);
                  setStreamingContent("");

                  // Handle navigation action - check both direct and nested params
                  const navigateTo = data.action?.navigateTo || data.action?.params?.navigateTo || data.action?.params?.path;
                  if (navigateTo && data.action?.type === "navigate") {
                    // Build full path with workspace slug
                    const fullPath = navigateTo.startsWith("/") && currentWorkspace?.slug
                      ? `/${currentWorkspace.slug}${navigateTo}`
                      : navigateTo;
                    router.push(fullPath);
                  }
                  if (data.suggestions?.length > 0) {
                    setSuggestions(data.suggestions);
                  }
                  break;

                case "conversation":
                  if (data.conversationId) {
                    setCurrentConversationId(data.conversationId);
                  }
                  break;

                case "error":
                  throw new Error(data.message);
              }
            } catch (parseError) {
              // Skip malformed events
            }
          }
        }
      } catch (error: any) {
        if (error.name === "AbortError") return; // User cancelled

        console.error("Streaming error:", error);

        // Provide contextual error message
        let errorMsg = "I encountered an error processing your request. Please try again.";
        if (error.message?.includes("429") || error.message?.includes("rate")) {
          errorMsg = "I'm receiving too many requests right now. Please wait a moment and try again.";
        } else if (error.message?.includes("timeout") || error.message?.includes("network")) {
          errorMsg = "There was a network issue. Please check your connection and try again.";
        } else if (error.message?.includes("401") || error.message?.includes("auth")) {
          errorMsg = "Your session may have expired. Please refresh the page and try again.";
        }

        setMessages((prev) => [
          ...prev,
          {
            id: `msg_${Date.now()}_error`,
            role: "assistant",
            content: errorMsg,
            timestamp: new Date(),
            agentSlug: currentAgent?.slug,
          },
        ]);
        setStreamingContent("");
      } finally {
        setIsLoading(false);
        setIsStreaming(false);
        abortControllerRef.current = null;
      }
    },
    [isLoading, isStreaming, messages, currentAgent, currentConversationId, router, currentWorkspace]
  );

  // Clear conversation
  const clearConversation = useCallback(() => {
    setMessages([]);
    setCurrentConversationId(null);
    setStreamingContent("");
  }, []);

  // Load an existing conversation
  const loadConversation = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/ai/conversations/${id}`);
      if (!response.ok) throw new Error("Failed to load conversation");

      const data = await response.json();

      setCurrentConversationId(id);
      setMessages(
        data.messages.map((m: any) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: new Date(m.createdAt),
          agentSlug: m.agent?.slug,
          metadata: m.metadata,
        }))
      );

      // Set agent from conversation
      if (data.agent?.slug) {
        setCurrentAgent(data.agent.slug);
      }

      setIsExpanded(true);
    } catch (error) {
      console.error("Error loading conversation:", error);
    }
  }, [setCurrentAgent]);

  // Start a new conversation
  const startNewConversation = useCallback(() => {
    setMessages([]);
    setCurrentConversationId(null);
    setStreamingContent("");
    focusInput();
  }, [focusInput]);

  // Execute a suggestion
  const executeSuggestion = useCallback(
    async (suggestion: AISuggestion) => {
      if (suggestion.action) {
        try {
          const response = await fetch("/api/ai/action", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: suggestion.action,
              context: contextRef.current,
            }),
          });
          if (response.ok) {
            const result = await response.json();
            if (result.navigateTo) {
              router.push(result.navigateTo);
            }
          }
        } catch (error) {
          console.error("Error executing suggestion:", error);
        }
      } else {
        await sendStreamingMessage(suggestion.description || suggestion.title);
      }
    },
    [sendStreamingMessage, router]
  );

  // Refresh suggestions
  const refreshSuggestions = useCallback(() => {
    if (contextRef.current) {
      const newSuggestions = getSuggestedActions(contextRef.current).map(
        (action, index) => ({
          id: `suggestion_${index}`,
          type: "quick_action" as const,
          title: action.label,
          description: action.prompt,
        })
      );
      setSuggestions(newSuggestions);
    }
  }, []);

  // Get contextual prompt
  const getContextPrompt = useCallback(() => {
    const pageType = contextRef.current?.currentPage?.type || "other";
    return getContextualPrompt(pageType);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl+J: Toggle chat bar
      if ((e.metaKey || e.ctrlKey) && e.key === "j") {
        e.preventDefault();
        if (isExpanded) {
          collapseChat();
        } else {
          focusInput();
        }
      }
      // Escape: Collapse expanded chat
      if (e.key === "Escape" && isExpanded) {
        collapseChat();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isExpanded, collapseChat, focusInput]);

  const value: AIProviderState = {
    // Agent state
    currentAgent,
    availableAgents,
    setCurrentAgent,

    // Chat bar state
    isExpanded,
    isFocused,
    expandChat,
    collapseChat,
    focusInput,
    blurInput,

    // Conversation state
    currentConversationId,
    messages,
    isLoading,
    isStreaming,
    streamingContent,

    // Conversation management
    sendMessage,
    sendStreamingMessage,
    clearConversation,
    loadConversation,
    startNewConversation,

    // Suggestions
    suggestions,
    refreshSuggestions,
    executeSuggestion,

    // Context
    context: contextRef.current,
    getContextualPrompt: getContextPrompt,

    // Backward compatibility
    isOpen: isExpanded,
    isMinimized: !isExpanded && messages.length > 0,
    openWidget: expandChat,
    closeWidget: collapseChat,
    toggleWidget: () => (isExpanded ? collapseChat() : focusInput()),
    minimizeWidget: collapseChat,
    expandWidget: expandChat,
    clearHistory: clearConversation,
  };

  return (
    <AIProviderContext.Provider value={value}>
      {children}
    </AIProviderContext.Provider>
  );
}

export function useAI() {
  const context = useContext(AIProviderContext);
  if (context === undefined) {
    throw new Error("useAI must be used within an AIProvider");
  }
  return context;
}

// Specific hooks for different use cases
export function useAISuggestions() {
  const { suggestions, executeSuggestion, isLoading } = useAI();
  return { suggestions, executeSuggestion, isLoading };
}

export function useAIChat() {
  const {
    messages,
    sendMessage,
    sendStreamingMessage,
    clearConversation,
    isLoading,
    isStreaming,
    streamingContent,
    currentAgent,
  } = useAI();
  return {
    messages,
    sendMessage,
    sendStreamingMessage,
    clearHistory: clearConversation,
    clearConversation,
    isLoading,
    isStreaming,
    streamingContent,
    currentAgent,
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
    isMinimized,
    openWidget,
    closeWidget,
    toggleWidget,
    minimizeWidget,
    expandWidget,
  } = useAI();

  return {
    isExpanded,
    isFocused,
    expandChat,
    collapseChat,
    focusInput,
    blurInput,
    // Backward compat
    isOpen,
    isMinimized,
    openWidget,
    closeWidget,
    toggleWidget,
    minimizeWidget,
    expandWidget,
  };
}

export function useAIAgents() {
  const { currentAgent, availableAgents, setCurrentAgent } = useAI();
  return { currentAgent, availableAgents, setCurrentAgent };
}

export function useAIConversation() {
  const {
    currentConversationId,
    messages,
    loadConversation,
    startNewConversation,
    clearConversation,
  } = useAI();
  return {
    currentConversationId,
    messages,
    loadConversation,
    startNewConversation,
    clearConversation,
  };
}
