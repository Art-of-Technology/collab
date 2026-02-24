"use client";

import React, { useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Plus,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAI } from "@/context/AIContext";
import AIMessage from "../AIMessage";
import StreamingMessage from "./StreamingMessage";

export default function ChatPanel() {
  const {
    isExpanded,
    messages,
    isStreaming,
    streamingContent,
    currentAgent,
    collapseChat,
    startNewConversation,
    suggestions,
    executeSuggestion,
  } = useAI();

  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        const scrollContainer = scrollRef.current.querySelector(
          "[data-radix-scroll-area-viewport]"
        );
        if (scrollContainer) {
          scrollContainer.scrollTo({
            top: scrollContainer.scrollHeight,
            behavior: "smooth",
          });
        }
      }
    });
  }, [messages, streamingContent]);

  return (
    <AnimatePresence>
      {isExpanded && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "50vh", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ type: "spring", damping: 30, stiffness: 350 }}
          className="overflow-hidden flex flex-col max-h-[60vh]"
        >
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06] shrink-0">
            <div className="flex items-center gap-2.5">
              {currentAgent && (
                <>
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                    style={{
                      backgroundColor: currentAgent.color,
                      boxShadow: `0 0 10px ${currentAgent.color}30`,
                    }}
                  >
                    {currentAgent.name[0]}
                  </div>
                  <span className="text-xs font-medium text-white/60">
                    {currentAgent.name}
                  </span>
                  <span className="text-[10px] text-white/25">
                    {currentAgent.personality}
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={startNewConversation}
                className="h-6 w-6 text-white/25 hover:text-white/60 hover:bg-white/[0.06]"
                title="New conversation"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={collapseChat}
                className="h-6 w-6 text-white/25 hover:text-white/60 hover:bg-white/[0.06]"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Messages area */}
          <ScrollArea ref={scrollRef} className="flex-1 overflow-hidden">
            {messages.length === 0 && !isStreaming ? (
              <div className="flex flex-col items-center justify-center py-12 px-4">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center mb-4"
                  style={{ backgroundColor: `${currentAgent?.color || "#8b5cf6"}15` }}
                >
                  <Sparkles
                    className="h-5 w-5"
                    style={{ color: currentAgent?.color || "#8b5cf6" }}
                  />
                </div>
                <p className="text-base font-medium text-white/70 mb-1">
                  How can I help?
                </p>
                <p className="text-xs text-white/25 text-center max-w-xs mb-6">
                  {currentAgent?.description || "Ask me anything about your workspace."}
                </p>

                {/* Quick suggestions */}
                {suggestions.length > 0 && (
                  <div className="flex flex-wrap gap-2 justify-center max-w-sm">
                    {suggestions.slice(0, 4).map((suggestion) => (
                      <button
                        key={suggestion.id}
                        onClick={() => executeSuggestion(suggestion)}
                        className={cn(
                          "px-3 py-1.5 text-[11px] rounded-xl",
                          "bg-white/[0.04] border border-white/[0.06]",
                          "text-white/35 hover:text-white/60 hover:bg-white/[0.07] hover:border-white/[0.1]",
                          "transition-all duration-200",
                        )}
                      >
                        {suggestion.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="py-2">
                {messages.map((msg) => (
                  <AIMessage
                    key={msg.id}
                    message={msg}
                    agentName={
                      msg.role === "assistant"
                        ? currentAgent?.name
                        : undefined
                    }
                    agentColor={
                      msg.role === "assistant"
                        ? currentAgent?.color
                        : undefined
                    }
                  />
                ))}

                {/* Streaming message */}
                {isStreaming && streamingContent && (
                  <StreamingMessage
                    content={streamingContent}
                    agentName={currentAgent?.name}
                    agentColor={currentAgent?.color}
                  />
                )}
              </div>
            )}
          </ScrollArea>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
