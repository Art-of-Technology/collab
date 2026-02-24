"use client";

import React from "react";
import { User, Copy, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { AIMessage as AIMessageType } from "@/lib/ai";
import InteractiveContentRenderer from "./InteractiveContentRenderer";

interface AIMessageProps {
  message: AIMessageType;
  agentName?: string;
  agentColor?: string;
  onRegenerate?: () => void;
}

export default function AIMessage({
  message,
  agentName,
  agentColor = "#8b5cf6",
  onRegenerate,
}: AIMessageProps) {
  const isUser = message.role === "user";

  const handleCopy = () => {
    // Strip markers for clipboard
    const cleanContent = message.content
      .replace(/\[ACTION:[^\]]+\]/g, '')
      .replace(/\[SUGGESTION:[^\]]+\]/g, '')
      .replace(/\[ISSUE:[^\]]+\]/g, '')
      .replace(/\[USER:[^\]]+\]/g, '')
      .replace(/\[PROJECT:[^\]]+\]/g, '')
      .replace(/\[ISSUE_LIST:[^\]]+\]/g, '')
      .replace(/\[USER_WORKLOAD:[^\]]+\]/g, '')
      .trim();
    navigator.clipboard.writeText(cleanContent);
  };

  return (
    <div
      className={cn(
        "flex items-start gap-3 px-4 py-3 group animate-in fade-in slide-in-from-bottom-2 duration-300",
        isUser && "bg-white/[0.02]"
      )}
    >
      {/* Avatar */}
      {isUser ? (
        <div className="w-6 h-6 rounded-full bg-white/[0.06] flex items-center justify-center flex-shrink-0 mt-0.5">
          <User className="h-3.5 w-3.5 text-white/40" />
        </div>
      ) : (
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 mt-0.5"
          style={{ backgroundColor: agentColor, boxShadow: `0 0 8px ${agentColor}30` }}
        >
          {agentName?.[0] || "A"}
        </div>
      )}

      {/* Content */}
      <div className={cn("flex-1 min-w-0", !isUser && "glass-subtle rounded-xl px-3 py-2")}>
        {/* Name */}
        <span className="text-[10px] font-medium text-white/30 mb-1 block">
          {isUser ? "You" : agentName || "AI"}
        </span>

        {/* Message content with interactive elements */}
        <div className="text-sm text-white/80 leading-relaxed">
          {isUser ? (
            <span className="whitespace-pre-wrap">{message.content}</span>
          ) : (
            <InteractiveContentRenderer content={message.content} />
          )}
        </div>

        {/* Action buttons (show on hover for assistant messages) */}
        {!isUser && (
          <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCopy}
              className="h-6 w-6 text-white/15 hover:text-white/40"
              title="Copy"
            >
              <Copy className="h-3 w-3" />
            </Button>
            {onRegenerate && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onRegenerate}
                className="h-6 w-6 text-white/15 hover:text-white/40"
                title="Regenerate"
              >
                <RefreshCw className="h-3 w-3" />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
