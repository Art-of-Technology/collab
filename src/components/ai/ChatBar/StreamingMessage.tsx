"use client";

import React from "react";
import { motion } from "framer-motion";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Globe,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ActiveToolCall } from "@/context/AIContext";

// ─── Inline Markdown Rendering (lightweight for streaming) ───

function renderInlineFormatting(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="font-semibold text-white">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*") && !part.startsWith("**")) {
      return <em key={i} className="italic text-white/80">{part.slice(1, -1)}</em>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={i} className="bg-violet-500/10 text-violet-300 px-1.5 py-0.5 rounded text-[11px] font-mono">
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function StreamingTextContent({ content }: { content: string }) {
  // Strip action markers
  const cleaned = content
    .replace(/\[ACTION:\s*type="[^"]*"\s*params=\{[\s\S]*?\}\s*\]/g, "")
    .replace(/\[SUGGESTION:[^\]]+\]/g, "")
    .trim();

  if (!cleaned) return null;

  const lines = cleaned.split("\n");
  return (
    <>
      {lines.map((line, i) => {
        const trimmed = line.trim();

        // Code blocks (only complete ones during streaming)
        if (trimmed.startsWith("```") && i > 0) {
          return (
            <pre key={i} className="bg-black/30 border border-white/[0.08] rounded-lg p-3 my-2 overflow-x-auto text-xs font-mono">
              <code className="text-emerald-300/90">{trimmed.slice(3)}</code>
            </pre>
          );
        }

        // Headers
        if (trimmed.startsWith("### ")) {
          return <h4 key={i} className="text-sm font-semibold text-white/90 mt-3 mb-1">{renderInlineFormatting(trimmed.slice(4))}</h4>;
        }
        if (trimmed.startsWith("## ")) {
          return <h3 key={i} className="text-base font-bold text-white mt-3 mb-1">{renderInlineFormatting(trimmed.slice(3))}</h3>;
        }

        // Bullets
        if (trimmed.startsWith("- ") || trimmed.startsWith("* ") || trimmed.startsWith("• ")) {
          return (
            <div key={i} className="flex items-start gap-2.5 py-0.5 pl-1">
              <span className="text-violet-400/60 mt-1.5 text-[6px]">●</span>
              <span className="flex-1">{renderInlineFormatting(trimmed.slice(2))}</span>
            </div>
          );
        }

        // Numbered lists
        const numMatch = trimmed.match(/^(\d+)\.\s/);
        if (numMatch) {
          return (
            <div key={i} className="flex items-start gap-2.5 py-0.5 pl-1">
              <span className="text-white/40 text-xs mt-0.5 w-4 text-right font-medium">{numMatch[1]}.</span>
              <span className="flex-1">{renderInlineFormatting(trimmed.slice(numMatch[0].length))}</span>
            </div>
          );
        }

        // Empty line
        if (!trimmed) return <div key={i} className="h-2" />;

        // Regular text
        return <div key={i} className="py-0.5">{renderInlineFormatting(line)}</div>;
      })}
    </>
  );
}

// ─── Tool Call Activity ───

function ToolCallIndicator({ toolCall }: { toolCall: ActiveToolCall }) {
  const displayName = toolCall.toolName
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  const isWebSearch = toolCall.toolType === "web_search";

  return (
    <motion.div
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-center gap-2 py-1 text-xs text-white/30"
    >
      {toolCall.status === "running" ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin text-white/25" />
      ) : toolCall.status === "error" ? (
        <XCircle className="w-3.5 h-3.5 text-red-400/60" />
      ) : (
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400/60" />
      )}
      {isWebSearch ? (
        <Globe className="w-3 h-3 text-cyan-400/60" />
      ) : (
        <Wrench className="w-3 h-3 text-white/20" />
      )}
      <span>
        {toolCall.status === "running"
          ? "Using"
          : toolCall.status === "error"
          ? "Failed:"
          : "Used"}{" "}
        <span className={cn(
          "font-medium",
          toolCall.status === "error" ? "text-red-400/60" : "text-white/40"
        )}>
          {displayName}
        </span>
      </span>
    </motion.div>
  );
}

// ─── Main Component ───

interface StreamingMessageProps {
  text: string;
  activeToolCalls: ActiveToolCall[];
  agentName?: string;
  agentColor?: string;
}

export default function StreamingMessage({
  text,
  activeToolCalls,
  agentName,
  agentColor = "#6366f1",
}: StreamingMessageProps) {
  const hasContent = text.trim().length > 0 || activeToolCalls.length > 0;
  if (!hasContent) return null;

  return (
    <div className="flex items-start gap-3 px-4 py-3">
      {/* Agent avatar */}
      <div
        className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 mt-0.5"
        style={{ backgroundColor: agentColor, boxShadow: `0 0 8px ${agentColor}30` }}
      >
        {agentName?.[0] || "C"}
      </div>

      {/* Streaming content */}
      <div className="flex-1 min-w-0 glass-subtle rounded-xl px-3 py-2">
        {agentName && (
          <span className="text-[10px] font-medium text-white/30 mb-1 block">
            {agentName}
          </span>
        )}

        {/* Active tool calls */}
        {activeToolCalls.length > 0 && (
          <div className="mb-1">
            {activeToolCalls.map((tc) => (
              <ToolCallIndicator key={tc.toolUseId} toolCall={tc} />
            ))}
          </div>
        )}

        {/* Streaming text */}
        {text.trim() && (
          <div className="text-sm text-white/80 leading-relaxed">
            <StreamingTextContent content={text} />
            <motion.span
              animate={{ opacity: [1, 0] }}
              transition={{ duration: 0.6, repeat: Infinity, repeatType: "reverse" }}
              className="inline-block w-[2px] h-4 ml-0.5 align-middle"
              style={{ backgroundColor: agentColor, boxShadow: `0 0 6px ${agentColor}` }}
            />
          </div>
        )}

        {/* Loading indicator when only tool calls are running with no text yet */}
        {!text.trim() && activeToolCalls.some((tc) => tc.status === "running") && (
          <div className="flex items-center gap-2 py-1">
            <motion.div
              className="flex gap-1"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: agentColor }}
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1.2, delay: i * 0.2, repeat: Infinity }}
                />
              ))}
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
}
