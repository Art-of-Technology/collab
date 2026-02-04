"use client";

import React from 'react';
import { format } from 'date-fns';
import { User, Sparkles, ExternalLink, CheckCircle, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AIMessage as AIMessageType } from '@/lib/ai';
import { Button } from '@/components/ui/button';

interface AIMessageProps {
  message: AIMessageType;
}

export default function AIMessage({ message }: AIMessageProps) {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';

  // Parse markdown-like formatting in content
  const formatContent = (content: string) => {
    // Split by code blocks
    const parts = content.split(/(```[\s\S]*?```)/g);

    return parts.map((part, index) => {
      // Handle code blocks
      if (part.startsWith('```')) {
        const codeContent = part.replace(/```(\w+)?\n?/g, '').replace(/```$/g, '');
        return (
          <pre
            key={index}
            className="my-2 p-3 bg-[#0a0a0b] border border-[#27272a] rounded-lg overflow-x-auto"
          >
            <code className="text-xs text-[#a1a1aa] font-mono">{codeContent}</code>
          </pre>
        );
      }

      // Handle regular text with inline formatting
      return (
        <span key={index}>
          {formatInlineContent(part)}
        </span>
      );
    });
  };

  // Format inline content (bold, italic, inline code, links)
  const formatInlineContent = (text: string) => {
    // Simple inline code formatting
    const parts = text.split(/(`[^`]+`)/g);

    return parts.map((part, index) => {
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code
            key={index}
            className="px-1 py-0.5 bg-[#1f1f1f] rounded text-[#c4b5fd] text-xs font-mono"
          >
            {part.slice(1, -1)}
          </code>
        );
      }

      // Handle bold (**text**)
      const boldParts = part.split(/(\*\*[^*]+\*\*)/g);
      return boldParts.map((bp, bpIndex) => {
        if (bp.startsWith('**') && bp.endsWith('**')) {
          return (
            <strong key={`${index}-${bpIndex}`} className="font-semibold text-[#fafafa]">
              {bp.slice(2, -2)}
            </strong>
          );
        }
        return bp;
      });
    });
  };

  return (
    <div
      className={cn(
        "flex gap-3",
        isUser && "flex-row-reverse"
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          "flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center",
          isUser
            ? "bg-[#3b82f6]/20 text-[#3b82f6]"
            : "bg-[#8b5cf6]/20 text-[#8b5cf6]"
        )}
      >
        {isUser ? (
          <User className="h-3.5 w-3.5" />
        ) : (
          <Sparkles className="h-3.5 w-3.5" />
        )}
      </div>

      {/* Message Content */}
      <div
        className={cn(
          "flex-1 max-w-[85%]",
          isUser && "flex flex-col items-end"
        )}
      >
        <div
          className={cn(
            "px-3 py-2 rounded-xl",
            isUser
              ? "bg-[#3b82f6] text-white"
              : "bg-[#1f1f1f] text-[#e6edf3] border border-[#27272a]"
          )}
        >
          <div className="text-sm leading-relaxed whitespace-pre-wrap">
            {formatContent(message.content)}
          </div>
        </div>

        {/* Metadata: Action results */}
        {message.metadata?.action && (
          <div className="mt-2 w-full">
            <ActionResult action={message.metadata.action} />
          </div>
        )}

        {/* Metadata: Suggestions */}
        {message.metadata?.suggestions && message.metadata.suggestions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {message.metadata.suggestions.map((suggestion) => (
              <button
                key={suggestion.id}
                className={cn(
                  "px-2.5 py-1 text-xs",
                  "bg-[#8b5cf6]/10 text-[#c4b5fd]",
                  "border border-[#8b5cf6]/20 rounded-lg",
                  "hover:bg-[#8b5cf6]/20 hover:border-[#8b5cf6]/30",
                  "transition-colors"
                )}
              >
                {suggestion.title}
              </button>
            ))}
          </div>
        )}

        {/* Timestamp */}
        <span className="text-[10px] text-[#3f3f46] mt-1">
          {format(new Date(message.timestamp), 'h:mm a')}
        </span>
      </div>
    </div>
  );
}

// Action result component
function ActionResult({ action }: { action: AIMessageType['metadata']['action'] }) {
  if (!action) return null;

  const statusIcons = {
    pending: <div className="h-3 w-3 rounded-full bg-amber-500/50 animate-pulse" />,
    executing: <div className="h-3 w-3 rounded-full bg-blue-500 animate-pulse" />,
    completed: <CheckCircle className="h-3 w-3 text-emerald-500" />,
    failed: <AlertCircle className="h-3 w-3 text-red-500" />,
  };

  const actionLabels: Record<string, string> = {
    create_issue: 'Creating issue',
    update_issue: 'Updating issue',
    search: 'Searching',
    navigate: 'Navigating',
    summarize: 'Generating summary',
    analyze: 'Analyzing',
    suggest: 'Generating suggestions',
  };

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-2",
        "bg-[#1f1f1f] border border-[#27272a] rounded-lg",
        "text-xs"
      )}
    >
      {statusIcons[action.status]}
      <span className="text-[#a1a1aa]">
        {actionLabels[action.type] || action.type}
      </span>
      {action.status === 'completed' && action.result && (
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-6 px-2 text-[10px] text-[#8b5cf6]"
        >
          <ExternalLink className="h-3 w-3 mr-1" />
          View
        </Button>
      )}
    </div>
  );
}
