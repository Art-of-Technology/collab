"use client";

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare,
  X,
  Minus,
  Maximize2,
  Send,
  Sparkles,
  Loader2,
  ChevronUp,
  Trash2,
  Mic,
  Command,
} from 'lucide-react';
import { useAI } from '@/context/AIContext';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import AIMessage from './AIMessage';
import AIQuickActions from './AIQuickActions';

export default function AIAssistantWidget() {
  const {
    isOpen,
    isMinimized,
    isLoading,
    messages,
    suggestions,
    openWidget,
    closeWidget,
    minimizeWidget,
    expandWidget,
    sendMessage,
    clearHistory,
    executeSuggestion,
    getContextualPrompt,
  } = useAI();

  const [inputValue, setInputValue] = useState('');
  const [showQuickActions, setShowQuickActions] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus input when widget opens
  useEffect(() => {
    if (isOpen && !isMinimized && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen, isMinimized]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    const message = inputValue.trim();
    setInputValue('');
    setShowQuickActions(false);
    await sendMessage(message);
  };

  const handleQuickAction = async (action: { title: string; description: string }) => {
    setShowQuickActions(false);
    await sendMessage(action.description);
  };

  // Collapsed state - floating button
  if (!isOpen) {
    return (
      <motion.button
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={openWidget}
        className={cn(
          "fixed bottom-6 right-6 z-50",
          "flex items-center gap-2 px-4 py-3",
          "bg-gradient-to-r from-violet-500 to-violet-600",
          "text-white font-medium text-sm",
          "rounded-full shadow-lg shadow-purple-500/25",
          "hover:shadow-xl hover:shadow-purple-500/30",
          "transition-shadow duration-200"
        )}
      >
        <Sparkles className="h-4 w-4" />
        <span>AI Assistant</span>
        <span className="text-[10px] text-purple-200 bg-purple-500/30 px-1.5 py-0.5 rounded">
          <Command className="h-2.5 w-2.5 inline mr-0.5" />J
        </span>
      </motion.button>
    );
  }

  // Minimized state - compact bar
  if (isMinimized) {
    return (
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        className={cn(
          "fixed bottom-6 right-6 z-50",
          "w-[380px] h-12",
          "bg-collab-900 border border-collab-600",
          "rounded-full shadow-lg shadow-black/20",
          "flex items-center px-4 gap-3"
        )}
      >
        <Sparkles className="h-4 w-4 text-violet-500" />
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit(e);
          }}
          placeholder="Ask AI anything..."
          className={cn(
            "flex-1 bg-transparent text-sm text-collab-50",
            "placeholder:text-collab-500/60",
            "focus:outline-none"
          )}
        />
        <button
          onClick={expandWidget}
          className="p-1.5 hover:bg-collab-700 rounded-full transition-colors"
        >
          <Maximize2 className="h-4 w-4 text-collab-500" />
        </button>
        <button
          onClick={closeWidget}
          className="p-1.5 hover:bg-collab-700 rounded-full transition-colors"
        >
          <X className="h-4 w-4 text-collab-500" />
        </button>
      </motion.div>
    );
  }

  // Expanded state - full chat widget
  return (
    <motion.div
      initial={{ y: 100, opacity: 0, scale: 0.95 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      exit={{ y: 100, opacity: 0, scale: 0.95 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className={cn(
        "fixed bottom-6 right-6 z-50",
        "w-[420px] h-[600px]",
        "bg-collab-900 border border-collab-600",
        "rounded-2xl shadow-xl shadow-black/30",
        "flex flex-col overflow-hidden"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-collab-700 bg-gradient-to-r from-violet-500/10 to-transparent">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-violet-500/20 rounded-lg">
            <Sparkles className="h-4 w-4 text-violet-500" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-collab-50">AI Assistant</h3>
            <p className="text-[10px] text-collab-500/60">Powered by Claude</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button
              onClick={clearHistory}
              className="p-1.5 hover:bg-collab-700 rounded-lg transition-colors group"
              title="Clear conversation"
            >
              <Trash2 className="h-4 w-4 text-collab-500/60 group-hover:text-collab-500" />
            </button>
          )}
          <button
            onClick={minimizeWidget}
            className="p-1.5 hover:bg-collab-700 rounded-lg transition-colors"
          >
            <Minus className="h-4 w-4 text-collab-500" />
          </button>
          <button
            onClick={closeWidget}
            className="p-1.5 hover:bg-collab-700 rounded-lg transition-colors"
          >
            <X className="h-4 w-4 text-collab-500" />
          </button>
        </div>
      </div>

      {/* Messages Area */}
      <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
        {messages.length === 0 && showQuickActions ? (
          <div className="space-y-4">
            {/* Welcome message */}
            <div className="text-center py-6">
              <div className="mx-auto w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500/20 to-violet-600/20 flex items-center justify-center mb-3">
                <Sparkles className="h-6 w-6 text-violet-500" />
              </div>
              <h3 className="text-sm font-medium text-collab-50 mb-1">
                How can I help you today?
              </h3>
              <p className="text-xs text-collab-500/60">
                {getContextualPrompt()}
              </p>
            </div>

            {/* Quick Actions */}
            <AIQuickActions
              suggestions={suggestions}
              onSelect={handleQuickAction}
            />
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <AIMessage key={message.id} message={message} />
            ))}

            {isLoading && (
              <div className="flex items-center gap-2 text-collab-500/60">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-xs">Thinking...</span>
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      {/* Input Area */}
      <div className="p-4 border-t border-collab-700 bg-collab-950">
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <div className="flex-1 relative">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Type a message..."
              disabled={isLoading}
              className={cn(
                "w-full px-4 py-2.5 pr-10",
                "bg-collab-700 border border-collab-600",
                "rounded-xl text-sm text-collab-50",
                "placeholder:text-collab-500/60",
                "focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                "transition-all duration-200"
              )}
            />
            {messages.length > 0 && (
              <button
                type="button"
                onClick={() => setShowQuickActions(!showQuickActions)}
                className={cn(
                  "absolute right-2 top-1/2 -translate-y-1/2",
                  "p-1 rounded-md",
                  "text-collab-500/60 hover:text-collab-500 hover:bg-collab-600",
                  "transition-colors"
                )}
              >
                <ChevronUp className={cn(
                  "h-4 w-4 transition-transform",
                  showQuickActions && "rotate-180"
                )} />
              </button>
            )}
          </div>
          <Button
            type="submit"
            disabled={!inputValue.trim() || isLoading}
            className={cn(
              "px-3 h-10",
              "bg-violet-500 hover:bg-violet-600",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
        <p className="text-[10px] text-collab-500/50 text-center mt-2">
          Press <kbd className="px-1 py-0.5 bg-collab-700 rounded text-collab-500/60">Cmd+J</kbd> to toggle
        </p>
      </div>
    </motion.div>
  );
}
