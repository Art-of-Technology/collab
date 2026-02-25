"use client";

import React from "react";
import {
  User,
  Copy,
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
  Globe,
  Wrench,
  ExternalLink,
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { ChatMessage, ContentBlock } from "@/context/AIContext";
import { IssueChip } from "./InteractiveElements";
import ToolResultRenderer from "./ToolResultRenderer";

// ─── Markdown Text Rendering ───

/** Render bold, italic, and inline code */
function renderInlineFormatting(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);

  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("*") && part.endsWith("*") && !part.startsWith("**")) {
      return (
        <em key={i} className="italic text-white/80">
          {part.slice(1, -1)}
        </em>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={i}
          className="bg-violet-500/10 text-violet-300 px-1.5 py-0.5 rounded text-[11px] font-mono"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

/** Detect issue keys and render as chips */
function renderInlineWithIssueKeys(text: string): React.ReactNode {
  const issueKeyRegex = /\b([A-Z]{2,10}-[A-Z]?\d+)\b/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = issueKeyRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(
        <span key={`t-${lastIndex}`}>
          {renderInlineFormatting(text.slice(lastIndex, match.index))}
        </span>
      );
    }
    parts.push(
      <IssueChip key={`i-${match.index}`} data={{ key: match[1] }} />
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(
      <span key={`t-${lastIndex}`}>
        {renderInlineFormatting(text.slice(lastIndex))}
      </span>
    );
  }

  return parts.length > 0 ? (
    <span className="inline-flex flex-wrap items-center gap-1">{parts}</span>
  ) : (
    renderInlineFormatting(text)
  );
}

/** Render a line of inline text (headers, bullets, numbered lists, or plain) */
function InlineTextContent({ content }: { content: string }) {
  const lines = content.split("\n");

  return (
    <>
      {lines.map((line, i) => {
        const trimmed = line.trim();

        // Headers
        if (trimmed.startsWith("### ")) {
          return (
            <h4 key={i} className="text-sm font-semibold text-white/90 mt-4 mb-2">
              {renderInlineFormatting(trimmed.slice(4))}
            </h4>
          );
        }
        if (trimmed.startsWith("## ")) {
          return (
            <h3 key={i} className="text-base font-bold text-white mt-4 mb-2">
              {renderInlineFormatting(trimmed.slice(3))}
            </h3>
          );
        }
        if (trimmed.startsWith("# ")) {
          return (
            <h2 key={i} className="text-lg font-bold text-white mt-4 mb-2">
              {renderInlineFormatting(trimmed.slice(2))}
            </h2>
          );
        }

        // Bullet lists
        if (trimmed.startsWith("- ") || trimmed.startsWith("* ") || trimmed.startsWith("• ")) {
          return (
            <div key={i} className="flex items-start gap-2.5 py-0.5 pl-1">
              <span className="text-violet-400/60 mt-1.5 text-[6px]">●</span>
              <span className="flex-1">{renderInlineWithIssueKeys(trimmed.slice(2))}</span>
            </div>
          );
        }

        // Numbered lists
        const numberedMatch = trimmed.match(/^(\d+)\.\s/);
        if (numberedMatch) {
          return (
            <div key={i} className="flex items-start gap-2.5 py-0.5 pl-1">
              <span className="text-white/40 text-xs mt-0.5 w-4 text-right font-medium">
                {numberedMatch[1]}.
              </span>
              <span className="flex-1">
                {renderInlineWithIssueKeys(trimmed.slice(numberedMatch[0].length))}
              </span>
            </div>
          );
        }

        // Empty line
        if (!trimmed) {
          return <div key={i} className="h-3" />;
        }

        // Regular text
        return (
          <div key={i} className="py-0.5">
            {renderInlineWithIssueKeys(line)}
          </div>
        );
      })}
    </>
  );
}

/** Render text with code blocks */
function TextContent({ content }: { content: string }) {
  const codeBlockRegex = /(```[\s\S]*?```)/g;
  const parts = content.split(codeBlockRegex);

  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("```") && part.endsWith("```")) {
          const lines = part.slice(3, -3).split("\n");
          const language = lines[0]?.trim() || "";
          const code = language ? lines.slice(1).join("\n") : lines.join("\n");

          return (
            <pre
              key={i}
              className="bg-black/30 border border-white/[0.08] rounded-lg p-3 my-2 overflow-x-auto text-xs font-mono"
            >
              {language && (
                <span className="text-[10px] text-white/30 block mb-2 uppercase tracking-wider">
                  {language}
                </span>
              )}
              <code className="text-emerald-300/90">{code}</code>
            </pre>
          );
        }
        return <InlineTextContent key={i} content={part} />;
      })}
    </>
  );
}

// ─── Block Renderers ───

function TextBlock({ text }: { text: string }) {
  // Strip action markers from display
  const cleaned = text
    .replace(/\[ACTION:\s*type="[^"]*"\s*params=\{[\s\S]*?\}\s*\]/g, "")
    .replace(/\[SUGGESTION:[^\]]+\]/g, "")
    .trim();

  if (!cleaned) return null;

  return (
    <div className="leading-relaxed">
      <TextContent content={cleaned} />
    </div>
  );
}

function ToolStartBlock({
  block,
  hasResult,
}: {
  block: ContentBlock;
  hasResult: boolean;
}) {
  const displayName = (block.toolName || "tool")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  const isWebSearch = block.toolType === "web_search";

  return (
    <div className="flex items-center gap-2 py-1 text-xs text-white/30">
      {hasResult ? (
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400/60" />
      ) : (
        <Loader2 className="w-3.5 h-3.5 animate-spin text-white/25" />
      )}
      {isWebSearch ? (
        <Globe className="w-3 h-3 text-cyan-400/60" />
      ) : (
        <Wrench className="w-3 h-3 text-white/20" />
      )}
      <span>
        {hasResult ? "Used" : "Using"}{" "}
        <span className="text-white/40 font-medium">{displayName}</span>
      </span>
    </div>
  );
}

function ToolResultBlock({ block }: { block: ContentBlock }) {
  return (
    <ToolResultRenderer
      toolName={block.toolName || "unknown_tool"}
      content={block.content || ""}
      isError={block.isError}
      toolUseId={block.toolUseId}
    />
  );
}

function WebSearchResultsBlock({ block }: { block: ContentBlock }) {
  const results = block.results || [];

  if (results.length === 0) return null;

  return (
    <div className="my-2 space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs text-white/30 mb-2">
        <Globe className="w-3 h-3 text-cyan-400/60" />
        <span>{results.length} source{results.length !== 1 ? "s" : ""} found</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {results.slice(0, 5).map((result, i) => (
          <a
            key={i}
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs",
              "bg-cyan-500/5 border border-cyan-500/15",
              "text-cyan-300/70 hover:text-cyan-300 hover:bg-cyan-500/10 hover:border-cyan-500/25",
              "transition-all duration-200"
            )}
          >
            <ExternalLink className="w-3 h-3 shrink-0" />
            <span className="truncate max-w-[200px]">{result.title}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ───

interface AIMessageProps {
  message: ChatMessage;
  agentName?: string;
  agentColor?: string;
  onRegenerate?: () => void;
}

export default function AIMessage({
  message,
  agentName,
  agentColor = "#6366f1",
  onRegenerate,
}: AIMessageProps) {
  const isUser = message.role === "user";

  // Track which tool_start blocks have results (so we can show checkmarks)
  const resultToolIds = new Set(
    message.blocks
      .filter((b) => b.type === "tool_result" || b.type === "web_search_results")
      .map((b) => b.toolUseId)
      .filter(Boolean)
  );

  const handleCopy = () => {
    navigator.clipboard.writeText(message.text);
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
        <div className="w-6 h-6 rounded-full bg-white/[0.06] flex items-center justify-center shrink-0 mt-0.5">
          <User className="h-3.5 w-3.5 text-white/40" />
        </div>
      ) : (
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 mt-0.5"
          style={{ backgroundColor: agentColor, boxShadow: `0 0 8px ${agentColor}30` }}
        >
          {agentName?.[0] || "C"}
        </div>
      )}

      {/* Content */}
      <div className={cn("flex-1 min-w-0", !isUser && "glass-subtle rounded-xl px-3 py-2")}>
        {/* Name */}
        <span className="text-[10px] font-medium text-white/30 mb-1 block">
          {isUser ? "You" : agentName || "Cleo"}
        </span>

        {/* Message content */}
        <div className="text-sm text-white/80 leading-relaxed">
          {isUser ? (
            <span className="whitespace-pre-wrap">{message.text}</span>
          ) : (
            <>
              {message.blocks.map((block, i) => {
                switch (block.type) {
                  case "text":
                    return <TextBlock key={i} text={block.text || ""} />;
                  case "tool_start":
                    return (
                      <ToolStartBlock
                        key={i}
                        block={block}
                        hasResult={!!block.toolUseId && resultToolIds.has(block.toolUseId)}
                      />
                    );
                  case "tool_input":
                    // Don't render tool inputs — they're internal details
                    return null;
                  case "tool_result":
                    return <ToolResultBlock key={i} block={block} />;
                  case "web_search_results":
                    return <WebSearchResultsBlock key={i} block={block} />;
                  default:
                    return null;
                }
              })}
            </>
          )}
        </div>

        {/* Action buttons (hover) */}
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
