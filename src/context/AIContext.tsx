"use client";

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useWorkspace } from './WorkspaceContext';
import type { AIMessage, AISuggestion, AIContext as AIContextType, AIAction } from '@/lib/ai';
import { buildAIContext, getPageContextFromPath, getSuggestedActions, getContextualPrompt } from '@/lib/ai';

interface AIProviderState {
  // Widget state
  isOpen: boolean;
  isMinimized: boolean;
  isLoading: boolean;

  // Conversation state
  messages: AIMessage[];
  suggestions: AISuggestion[];

  // Context
  context: AIContextType | null;

  // Actions
  openWidget: () => void;
  closeWidget: () => void;
  toggleWidget: () => void;
  minimizeWidget: () => void;
  expandWidget: () => void;

  // Chat actions
  sendMessage: (message: string) => Promise<void>;
  clearHistory: () => void;
  executeSuggestion: (suggestion: AISuggestion) => Promise<void>;

  // Utility
  refreshSuggestions: () => void;
  getContextualPrompt: () => string;
}

const AIProviderContext = createContext<AIProviderState | undefined>(undefined);

export function AIProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const { currentWorkspace } = useWorkspace();
  const pathname = usePathname();
  const router = useRouter();

  // Widget state
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Conversation state
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);

  // Context ref to avoid stale closures
  const contextRef = useRef<AIContextType | null>(null);

  // Build context when dependencies change
  useEffect(() => {
    if (session?.user && currentWorkspace) {
      const pageContext = getPageContextFromPath(pathname);

      const context = buildAIContext({
        user: {
          id: session.user.id || '',
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

      // Update suggestions based on new context
      const newSuggestions = getSuggestedActions(context).map((action, index) => ({
        id: `suggestion_${index}`,
        type: 'quick_action' as const,
        title: action.label,
        description: action.prompt,
      }));

      setSuggestions(newSuggestions);
    }
  }, [session, currentWorkspace, pathname]);

  // Widget actions
  const openWidget = useCallback(() => {
    setIsOpen(true);
    setIsMinimized(false);
  }, []);

  const closeWidget = useCallback(() => {
    setIsOpen(false);
    setIsMinimized(false);
  }, []);

  const toggleWidget = useCallback(() => {
    if (isOpen && !isMinimized) {
      setIsMinimized(true);
    } else {
      setIsOpen(true);
      setIsMinimized(false);
    }
  }, [isOpen, isMinimized]);

  const minimizeWidget = useCallback(() => {
    setIsMinimized(true);
  }, []);

  const expandWidget = useCallback(() => {
    setIsMinimized(false);
  }, []);

  // Send message to AI
  const sendMessage = useCallback(async (message: string) => {
    if (!contextRef.current || isLoading) return;

    // Add user message immediately
    const userMessage: AIMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: message,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          context: contextRef.current,
          history: messages.slice(-10), // Send last 10 messages for context
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get AI response');
      }

      const data = await response.json();

      const assistantMessage: AIMessage = {
        id: `msg_${Date.now()}_ai`,
        role: 'assistant',
        content: data.content,
        timestamp: new Date(),
        metadata: {
          action: data.action,
          suggestions: data.suggestions,
        },
      };

      setMessages(prev => [...prev, assistantMessage]);

      // Handle action if present
      if (data.action && data.action.navigateTo) {
        router.push(data.action.navigateTo);
      }

      // Update suggestions if provided
      if (data.suggestions?.length > 0) {
        setSuggestions(data.suggestions);
      }
    } catch (error) {
      console.error('AI chat error:', error);

      const errorMessage: AIMessage = {
        id: `msg_${Date.now()}_error`,
        role: 'assistant',
        content: 'I apologize, but I encountered an error. Please try again.',
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, messages, router]);

  // Clear conversation history
  const clearHistory = useCallback(() => {
    setMessages([]);
  }, []);

  // Execute a suggestion
  const executeSuggestion = useCallback(async (suggestion: AISuggestion) => {
    if (suggestion.action) {
      // Execute the action directly
      try {
        const response = await fetch('/api/ai/action', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
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
        console.error('Error executing suggestion action:', error);
      }
    } else {
      // Send as a message
      await sendMessage(suggestion.description || suggestion.title);
    }
  }, [sendMessage, router]);

  // Refresh suggestions
  const refreshSuggestions = useCallback(() => {
    if (contextRef.current) {
      const newSuggestions = getSuggestedActions(contextRef.current).map((action, index) => ({
        id: `suggestion_${index}`,
        type: 'quick_action' as const,
        title: action.label,
        description: action.prompt,
      }));
      setSuggestions(newSuggestions);
    }
  }, []);

  // Get contextual prompt
  const getContextPrompt = useCallback(() => {
    const pageType = contextRef.current?.currentPage?.type || 'other';
    return getContextualPrompt(pageType);
  }, []);

  // Keyboard shortcut to toggle widget (Cmd/Ctrl + J)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
        e.preventDefault();
        toggleWidget();
      }
      // Escape to close/minimize
      if (e.key === 'Escape' && isOpen) {
        if (isMinimized) {
          closeWidget();
        } else {
          minimizeWidget();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleWidget, isOpen, isMinimized, closeWidget, minimizeWidget]);

  const value: AIProviderState = {
    isOpen,
    isMinimized,
    isLoading,
    messages,
    suggestions,
    context: contextRef.current,
    openWidget,
    closeWidget,
    toggleWidget,
    minimizeWidget,
    expandWidget,
    sendMessage,
    clearHistory,
    executeSuggestion,
    refreshSuggestions,
    getContextualPrompt: getContextPrompt,
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
    throw new Error('useAI must be used within an AIProvider');
  }
  return context;
}

// Hook for AI suggestions
export function useAISuggestions() {
  const { suggestions, executeSuggestion, isLoading } = useAI();
  return { suggestions, executeSuggestion, isLoading };
}

// Hook for AI chat
export function useAIChat() {
  const { messages, sendMessage, clearHistory, isLoading } = useAI();
  return { messages, sendMessage, clearHistory, isLoading };
}

// Hook for AI widget state
export function useAIWidget() {
  const {
    isOpen,
    isMinimized,
    openWidget,
    closeWidget,
    toggleWidget,
    minimizeWidget,
    expandWidget,
  } = useAI();

  return {
    isOpen,
    isMinimized,
    openWidget,
    closeWidget,
    toggleWidget,
    minimizeWidget,
    expandWidget,
  };
}
